-- Replace legacy RPC overloads with explicit tenant-scoped, atomic mutations.
-- Every function runs with the caller's privileges so table RLS remains active.

DROP FUNCTION IF EXISTS public.record_stock_movement(uuid, text, numeric, numeric, text);

CREATE FUNCTION public.record_stock_movement(
    p_material_id uuid,
    p_movement_type text,
    p_quantity numeric,
    p_unit_price numeric,
    p_note text,
    p_organization_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_material record;
    v_old_stock numeric;
    v_new_stock numeric;
    v_final_price numeric;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_material_id IS NULL THEN
        RAISE EXCEPTION 'Hammadde seçimi zorunludur.' USING ERRCODE = '22023';
    END IF;

    IF p_movement_type NOT IN ('giris', 'cikis', 'fire') THEN
        RAISE EXCEPTION 'Geçersiz stok hareket türü.' USING ERRCODE = '22023';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 9999999.999 THEN
        RAISE EXCEPTION 'Miktar geçerli aralıkta olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF p_unit_price IS NOT NULL AND (p_unit_price < 0 OR p_unit_price > 99999999.99) THEN
        RAISE EXCEPTION 'Birim fiyat geçerli aralıkta olmalıdır.' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, unit, price_per_unit, stock_quantity
    INTO v_material
    FROM public.materials
    WHERE id = p_material_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hammadde bu organizasyonda bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    v_old_stock := COALESCE(v_material.stock_quantity, 0);
    v_final_price := COALESCE(NULLIF(p_unit_price, 0), v_material.price_per_unit, 0);

    IF p_movement_type IN ('cikis', 'fire') AND p_quantity > v_old_stock THEN
        RAISE EXCEPTION '% için yeterli stok yok. Mevcut: % %', v_material.name, v_old_stock, v_material.unit
            USING ERRCODE = '22023';
    END IF;

    v_new_stock := CASE
        WHEN p_movement_type = 'giris' THEN v_old_stock + p_quantity
        ELSE v_old_stock - p_quantity
    END;

    INSERT INTO public.stock_movements (
        organization_id,
        material_id,
        movement_type,
        quantity,
        unit_price,
        note,
        user_id
    )
    VALUES (
        p_organization_id,
        p_material_id,
        p_movement_type,
        p_quantity,
        v_final_price,
        COALESCE(p_note, ''),
        v_user_id
    );

    UPDATE public.materials
    SET stock_quantity = v_new_stock,
        updated_at = timezone('utc', now())
    WHERE id = p_material_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Stok',
        'EKLEME',
        format('%s için %s %s stok hareketi kaydedildi.', v_material.name, p_quantity, v_material.unit),
        jsonb_build_object(
            'materialId', p_material_id,
            'movementType', p_movement_type,
            'oldStock', v_old_stock,
            'newStock', v_new_stock,
            'unitPrice', v_final_price
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN json_build_object(
        'material_id', v_material.id,
        'material_name', v_material.name,
        'unit', v_material.unit,
        'movement_type', p_movement_type,
        'quantity', p_quantity,
        'unit_price', v_final_price,
        'old_stock', v_old_stock,
        'new_stock', v_new_stock
    );
END;
$$;

DROP FUNCTION IF EXISTS public.apply_stock_count(jsonb);

CREATE FUNCTION public.apply_stock_count(
    p_items jsonb,
    p_organization_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_item jsonb;
    v_material record;
    v_material_id uuid;
    v_counted_quantity numeric;
    v_current_stock numeric;
    v_difference numeric;
    v_count integer := 0;
    v_details text[] := ARRAY[]::text[];
    v_counted_at timestamptz := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(jsonb_typeof(p_items), 'null') <> 'array'
       OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Sayım listesi 1 ile 1000 satır içermelidir.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_items) AS item(material_id uuid, counted_quantity numeric)
        WHERE item.material_id IS NULL
           OR item.counted_quantity IS NULL
           OR item.counted_quantity < 0
           OR item.counted_quantity > 9999999.999
    ) OR EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_items) AS item(material_id uuid)
        GROUP BY item.material_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Sayım listesinde geçersiz veya yinelenen satır bulundu.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.materials AS material
    JOIN jsonb_to_recordset(p_items) AS item(material_id uuid)
      ON item.material_id = material.id
    WHERE material.organization_id = p_organization_id
    FOR UPDATE OF material;

    IF (
        SELECT count(*)
        FROM public.materials AS material
        JOIN jsonb_to_recordset(p_items) AS item(material_id uuid)
          ON item.material_id = material.id
        WHERE material.organization_id = p_organization_id
    ) <> jsonb_array_length(p_items) THEN
        RAISE EXCEPTION 'Sayımı yapılacak hammaddelerden biri bu organizasyonda bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_material_id := (v_item->>'material_id')::uuid;
        v_counted_quantity := (v_item->>'counted_quantity')::numeric;

        SELECT id, name, unit, price_per_unit, stock_quantity
        INTO v_material
        FROM public.materials
        WHERE id = v_material_id
          AND organization_id = p_organization_id;

        v_current_stock := COALESCE(v_material.stock_quantity, 0);
        v_difference := v_counted_quantity - v_current_stock;

        IF v_difference = 0 THEN
            CONTINUE;
        END IF;

        INSERT INTO public.stock_movements (
            organization_id,
            material_id,
            movement_type,
            quantity,
            unit_price,
            note,
            user_id
        )
        VALUES (
            p_organization_id,
            v_material_id,
            'sayim',
            abs(v_difference),
            COALESCE(v_material.price_per_unit, 0),
            format(
                'Sayım Düzeltmesi (%s): Teorik %s, Gerçek %s',
                CASE WHEN v_difference < 0 THEN 'Eksik' ELSE 'Fazla' END,
                v_current_stock,
                v_counted_quantity
            ),
            v_user_id
        );

        UPDATE public.materials
        SET stock_quantity = v_counted_quantity,
            updated_at = timezone('utc', now())
        WHERE id = v_material_id
          AND organization_id = p_organization_id;

        v_details := array_append(
            v_details,
            format('%s (%s -> %s)', v_material.name, v_current_stock, v_counted_quantity)
        );
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO public.settings (organization_id, key, value, user_id)
    VALUES (p_organization_id, 'last_inventory_count_date', to_jsonb(v_counted_at), v_user_id)
    ON CONFLICT (organization_id, key)
    DO UPDATE SET value = EXCLUDED.value,
                  user_id = EXCLUDED.user_id,
                  updated_at = timezone('utc', now());

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Stok',
        'GUNCELLEME',
        format('%s ürün için stok sayımı tamamlandı.', v_count),
        jsonb_build_object('updatedCount', v_count, 'details', to_jsonb(v_details), 'countedAt', v_counted_at),
        v_user_id::text,
        p_organization_id
    );

    RETURN json_build_object('updated_count', v_count, 'details', v_details, 'counted_at', v_counted_at);
END;
$$;

DROP FUNCTION IF EXISTS public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text);

CREATE FUNCTION public.buy_investment_transaction(
    p_asset_type text,
    p_name text,
    p_quantity numeric,
    p_price numeric,
    p_account_id uuid,
    p_notes text,
    p_purchase_date date,
    p_document_url text,
    p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_investment_id uuid;
    v_transaction_id uuid;
    v_total_amount numeric;
    v_existing record;
    v_existing_found boolean := false;
    v_new_quantity numeric;
    v_new_total_cost numeric;
    v_new_average_cost numeric;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_asset_type NOT IN ('gold', 'usd', 'eur', 'real_estate')
       OR length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100
       OR p_quantity IS NULL OR p_quantity <= 0 OR p_quantity > 99999999.9999
       OR p_price IS NULL OR p_price <= 0 OR p_price > 99999999.9999
       OR p_account_id IS NULL THEN
        RAISE EXCEPTION 'Geçerli yatırım ve ödeme bilgileri gereklidir.' USING ERRCODE = '22023';
    END IF;

    v_total_amount := round(p_quantity * p_price, 2);

    PERFORM 1
    FROM public.accounts
    WHERE id = p_account_id
      AND organization_id = p_organization_id
      AND COALESCE(balance, 0) >= v_total_amount
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hesap bulunamadı veya bakiyesi yetersiz.' USING ERRCODE = '22023';
    END IF;

    IF p_asset_type <> 'real_estate' THEN
        SELECT id, quantity, average_cost, notes, document_url
        INTO v_existing
        FROM public.investments
        WHERE asset_type = p_asset_type
          AND organization_id = p_organization_id
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE;
        v_existing_found := FOUND;
    END IF;

    IF v_existing_found THEN
        v_investment_id := v_existing.id;
        v_new_quantity := COALESCE(v_existing.quantity, 0) + p_quantity;
        v_new_total_cost := COALESCE(v_existing.quantity, 0) * COALESCE(v_existing.average_cost, 0) + v_total_amount;
        v_new_average_cost := v_new_total_cost / v_new_quantity;

        UPDATE public.investments
        SET quantity = v_new_quantity,
            average_cost = v_new_average_cost,
            updated_at = timezone('utc', now()),
            notes = CASE
                WHEN COALESCE(notes, '') <> '' THEN notes || E'\n' || COALESCE(p_purchase_date, CURRENT_DATE)::text || ': ' || COALESCE(p_notes, '')
                ELSE p_notes
            END,
            document_url = COALESCE(p_document_url, document_url)
        WHERE id = v_investment_id
          AND organization_id = p_organization_id;
    ELSE
        INSERT INTO public.investments (
            asset_type,
            name,
            quantity,
            average_cost,
            current_manual_value,
            notes,
            purchase_date,
            document_url,
            organization_id
        )
        VALUES (
            p_asset_type,
            btrim(p_name),
            p_quantity,
            p_price,
            CASE WHEN p_asset_type = 'real_estate' THEN p_price ELSE 0 END,
            p_notes,
            COALESCE(p_purchase_date, CURRENT_DATE),
            p_document_url,
            p_organization_id
        )
        RETURNING id INTO v_investment_id;
    END IF;

    INSERT INTO public.investment_transactions (
        investment_id,
        transaction_type,
        quantity,
        price_per_unit,
        total_amount,
        account_id,
        document_url,
        notes,
        transaction_date,
        organization_id
    )
    VALUES (
        v_investment_id,
        'buy',
        p_quantity,
        p_price,
        v_total_amount,
        p_account_id,
        p_document_url,
        p_notes,
        COALESCE(p_purchase_date, CURRENT_DATE),
        p_organization_id
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.account_movements (
        account_id,
        movement_type,
        amount,
        description,
        source_type,
        source_id,
        organization_id
    )
    VALUES (
        p_account_id,
        'cikis',
        v_total_amount,
        format('Yatırım Alımı: %s (%s birim)', btrim(p_name), p_quantity),
        'investment',
        v_transaction_id::text,
        p_organization_id
    );

    UPDATE public.accounts
    SET balance = COALESCE(balance, 0) - v_total_amount
    WHERE id = p_account_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Yatırımlar',
        'EKLEME',
        format('Yeni yatırım alımı: %s', btrim(p_name)),
        jsonb_build_object(
            'investmentId', v_investment_id,
            'transactionId', v_transaction_id,
            'assetType', p_asset_type,
            'quantity', p_quantity,
            'price', p_price,
            'totalAmount', v_total_amount,
            'accountId', p_account_id
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_transaction_id;
END;
$$;

DROP FUNCTION IF EXISTS public.add_supplier_payment_transaction(uuid, text, numeric, text, uuid);

CREATE FUNCTION public.add_supplier_payment_transaction(
    p_supplier_id uuid,
    p_supplier_name text,
    p_amount numeric,
    p_note text,
    p_account_id uuid,
    p_organization_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_supplier_name text;
    v_transaction_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_supplier_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
        RAISE EXCEPTION 'Geçerli tedarikçi ve ödeme tutarı gereklidir.' USING ERRCODE = '22023';
    END IF;

    SELECT name
    INTO v_supplier_name
    FROM public.suppliers
    WHERE id = p_supplier_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tedarikçi bu organizasyonda bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    IF p_account_id IS NOT NULL THEN
        PERFORM 1
        FROM public.accounts
        WHERE id = p_account_id
          AND organization_id = p_organization_id
          AND COALESCE(balance, 0) >= p_amount
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Hesap bulunamadı veya bakiyesi yetersiz.' USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.supplier_transactions (
        id,
        supplier_id,
        user_id,
        transaction_date,
        amount,
        transaction_type,
        note,
        organization_id
    )
    VALUES (
        gen_random_uuid(),
        p_supplier_id,
        v_user_id,
        CURRENT_DATE,
        p_amount,
        'payment',
        COALESCE(p_note, 'Manuel Ödeme'),
        p_organization_id
    )
    RETURNING id INTO v_transaction_id;

    UPDATE public.suppliers
    SET total_debt = COALESCE(total_debt, 0) - p_amount
    WHERE id = p_supplier_id
      AND organization_id = p_organization_id;

    IF p_account_id IS NOT NULL THEN
        INSERT INTO public.account_movements (
            account_id,
            movement_type,
            amount,
            description,
            source_type,
            source_id,
            organization_id
        )
        VALUES (
            p_account_id,
            'cikis',
            p_amount,
            format('%s firmasına ödeme yapıldı.', COALESCE(NULLIF(btrim(p_supplier_name), ''), v_supplier_name)),
            'supplier_payment',
            v_transaction_id::text,
            p_organization_id
        );

        UPDATE public.accounts
        SET balance = COALESCE(balance, 0) - p_amount
        WHERE id = p_account_id
          AND organization_id = p_organization_id;
    END IF;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Tedarikçi',
        'EKLEME',
        format('%s firmasına %s TL ödeme eklendi.', v_supplier_name, p_amount),
        jsonb_build_object(
            'supplierId', p_supplier_id,
            'transactionId', v_transaction_id,
            'amount', p_amount,
            'accountId', p_account_id,
            'note', p_note
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_movement(uuid, text, numeric, numeric, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_count(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_supplier_payment_transaction(uuid, text, numeric, text, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_stock_movement(uuid, text, numeric, numeric, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_count(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_supplier_payment_transaction(uuid, text, numeric, text, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

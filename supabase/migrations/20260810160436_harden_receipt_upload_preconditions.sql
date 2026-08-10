DO $migration$
BEGIN
    IF pg_catalog.to_regprocedure('public.process_receipt_upload(json)') IS NULL
       OR (
            SELECT count(*)
            FROM pg_catalog.pg_proc AS procedure
            INNER JOIN pg_catalog.pg_namespace AS namespace
                ON namespace.oid = procedure.pronamespace
            WHERE namespace.nspname = 'public'
              AND procedure.proname = 'process_receipt_upload'
       ) <> 1 THEN
        RAISE EXCEPTION
            'Unexpected process_receipt_upload signature set; refusing to leave an RPC bypass.';
    END IF;
END;
$migration$;
CREATE OR REPLACE FUNCTION public.process_receipt_upload(payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_organization_id uuid := NULLIF(payload->>'organization_id', '')::uuid;
    v_replace_batch_id uuid := NULLIF(payload->>'replace_batch_id', '')::uuid;
    v_batch_id uuid := NULLIF(payload->>'batch_id', '')::uuid;
    v_image_url text := NULLIF(payload->>'image_url', '');
    v_supplier_id uuid;
    v_supplier json := payload->'supplier';
    v_item json;
    v_items json := payload->'items';
    v_material_id uuid;
    v_old_price numeric;
    v_old_stock numeric;
    v_new_price numeric;
    v_quantity numeric;
    v_net_debt numeric;
    v_audit_details text[] := ARRAY[]::text[];
    v_movement record;
    v_transaction record;
    v_document_segments text[];
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF v_batch_id IS NULL OR json_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'Geçerli fiş bilgileri gereklidir.' USING ERRCODE = '22023';
    END IF;

    IF v_image_url IS NOT NULL THEN
        v_document_segments := string_to_array(
            substring(
                v_image_url
                FROM length('storage://motto_assets/') + 1
            ),
            '/'
        );

        IF v_image_url NOT LIKE 'storage://motto_assets/%'
           OR coalesce(cardinality(v_document_segments), 0) <> 3
           OR v_document_segments[1] <> v_organization_id::text
           OR v_document_segments[2] <> 'supplier-receipt'
           OR v_document_segments[3] !~
                '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}[.][a-z0-9]+$'
           OR lower(split_part(v_document_segments[3], '.', 2)) NOT IN
                ('jpg', 'jpeg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx') THEN
            RAISE EXCEPTION 'Geçerli bir tedarikçi fişi belge referansı gereklidir.'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF json_array_length(v_items) = 0 THEN
        RAISE EXCEPTION 'En az bir geçerli malzeme gereklidir.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM json_array_elements(v_items)
    LOOP
        IF json_typeof(v_item) <> 'object'
           OR coalesce(v_item->>'unitPrice', '') !~
                '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
           OR coalesce(v_item->>'quantity', '') !~
                '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$' THEN
            RAISE EXCEPTION 'Geçerli malzeme miktarı ve fiyatı gereklidir.'
                USING ERRCODE = '22023';
        END IF;

        BEGIN
            v_new_price := (v_item->>'unitPrice')::numeric;
            v_quantity := (v_item->>'quantity')::numeric;
        EXCEPTION
            WHEN invalid_text_representation OR numeric_value_out_of_range THEN
                RAISE EXCEPTION 'Geçerli malzeme miktarı ve fiyatı gereklidir.'
                    USING ERRCODE = '22023';
        END;

        IF v_new_price < 0 OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Geçerli malzeme miktarı ve fiyatı gereklidir.'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF v_replace_batch_id IS NOT NULL THEN
        PERFORM 1
        FROM public.supplier_transactions
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Değiştirilecek fiş bulunamadı.' USING ERRCODE = 'P0002';
        END IF;

        FOR v_movement IN
            SELECT material_id, quantity
            FROM public.stock_movements
            WHERE batch_id = v_replace_batch_id
              AND organization_id = v_organization_id
        LOOP
            UPDATE public.materials
            SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_movement.quantity)
            WHERE id = v_movement.material_id
              AND organization_id = v_organization_id;
        END LOOP;

        FOR v_transaction IN
            SELECT supplier_id, amount, transaction_type
            FROM public.supplier_transactions
            WHERE batch_id = v_replace_batch_id
              AND organization_id = v_organization_id
        LOOP
            UPDATE public.suppliers
            SET total_debt = COALESCE(total_debt, 0)
                + CASE
                    WHEN v_transaction.transaction_type = 'invoice' THEN -v_transaction.amount
                    WHEN v_transaction.transaction_type = 'payment' THEN v_transaction.amount
                    ELSE 0
                  END
            WHERE id = v_transaction.supplier_id
              AND organization_id = v_organization_id;
        END LOOP;

        DELETE FROM public.stock_movements
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id;
        DELETE FROM public.supplier_transactions
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id;
        DELETE FROM public.account_movements
        WHERE source_id = v_replace_batch_id::text
          AND organization_id = v_organization_id;
    END IF;

    IF v_supplier IS NOT NULL AND json_typeof(v_supplier) <> 'null' THEN
        v_supplier_id := NULLIF(v_supplier->>'id', '')::uuid;

        IF v_supplier_id IS NOT NULL THEN
            PERFORM 1
            FROM public.suppliers
            WHERE id = v_supplier_id
              AND organization_id = v_organization_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Tedarikçi bulunamadı.' USING ERRCODE = 'P0002';
            END IF;
        ELSE
            SELECT id
            INTO v_supplier_id
            FROM public.suppliers
            WHERE organization_id = v_organization_id
              AND btrim(name) ILIKE btrim(v_supplier->>'name')
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE;
        END IF;

        IF v_supplier_id IS NOT NULL THEN
            UPDATE public.suppliers
            SET phone = COALESCE(NULLIF(v_supplier->>'phone', ''), phone),
                iban = COALESCE(NULLIF(v_supplier->>'iban', ''), iban),
                address = COALESCE(NULLIF(v_supplier->>'address', ''), address)
            WHERE id = v_supplier_id
              AND organization_id = v_organization_id;
        ELSE
            INSERT INTO public.suppliers (name, phone, iban, address, user_id, organization_id)
            VALUES (
                btrim(v_supplier->>'name'),
                NULLIF(v_supplier->>'phone', ''),
                NULLIF(v_supplier->>'iban', ''),
                NULLIF(v_supplier->>'address', ''),
                v_user_id,
                v_organization_id
            )
            RETURNING id INTO v_supplier_id;
        END IF;

        INSERT INTO public.supplier_transactions (
            id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
        )
        VALUES (
            gen_random_uuid(), v_batch_id, v_supplier_id, (v_supplier->>'date')::date,
            (v_supplier->>'totalAmount')::numeric, 'invoice', 'Sistemden Fiş Yükleme (Otomatik Borç)',
            v_user_id, v_organization_id
        );

        IF COALESCE((v_supplier->>'paidAmount')::numeric, 0) > 0 THEN
            INSERT INTO public.supplier_transactions (
                id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
            )
            VALUES (
                gen_random_uuid(), v_batch_id, v_supplier_id, (v_supplier->>'date')::date,
                (v_supplier->>'paidAmount')::numeric, 'payment', 'Fiş Yükleme Anında Ödeme',
                v_user_id, v_organization_id
            );
        END IF;

        v_net_debt := (v_supplier->>'totalAmount')::numeric - COALESCE((v_supplier->>'paidAmount')::numeric, 0);
        UPDATE public.suppliers
        SET total_debt = COALESCE(total_debt, 0) + v_net_debt
        WHERE id = v_supplier_id
          AND organization_id = v_organization_id;
    END IF;

    FOR v_item IN SELECT value FROM json_array_elements(v_items)
    LOOP
        v_material_id := NULLIF(v_item->>'matchedMaterialId', '')::uuid;
        v_new_price := (v_item->>'unitPrice')::numeric;
        v_quantity := (v_item->>'quantity')::numeric;

        IF v_new_price < 0 OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Geçerli malzeme miktarı ve fiyatı gereklidir.' USING ERRCODE = '22023';
        END IF;

        IF v_material_id IS NOT NULL THEN
            SELECT price_per_unit, stock_quantity
            INTO v_old_price, v_old_stock
            FROM public.materials
            WHERE id = v_material_id
              AND organization_id = v_organization_id
            FOR UPDATE;
        ELSE
            SELECT id, price_per_unit, stock_quantity
            INTO v_material_id, v_old_price, v_old_stock
            FROM public.materials
            WHERE organization_id = v_organization_id
              AND name = v_item->>'name'
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE;
        END IF;

        IF v_material_id IS NOT NULL THEN
            UPDATE public.materials
            SET price_per_unit = v_new_price,
                stock_quantity = COALESCE(stock_quantity, 0) + v_quantity,
                category = COALESCE(NULLIF(btrim(v_item->>'category'), ''), category)
            WHERE id = v_material_id
              AND organization_id = v_organization_id;
            v_audit_details := array_append(
                v_audit_details,
                'Mevcut Ürün: Stok ' || COALESCE(v_old_stock, 0)::text || '->'
                    || (COALESCE(v_old_stock, 0) + v_quantity)::text
            );
        ELSE
            INSERT INTO public.materials (
                name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
            )
            VALUES (
                v_item->>'name', COALESCE(NULLIF(v_item->>'category', ''), 'Diğer'),
                COALESCE(NULLIF(v_item->>'unit', ''), 'Adet'), v_new_price, v_quantity,
                v_user_id, v_organization_id
            )
            RETURNING id INTO v_material_id;
            v_old_price := 0;
            v_audit_details := array_append(v_audit_details, 'YENİ ÜRÜN ' || (v_item->>'name'));
        END IF;

        IF COALESCE(v_old_price, 0) <> v_new_price THEN
            INSERT INTO public.material_price_history (
                material_id, old_price, new_price, source, organization_id
            )
            VALUES (
                v_material_id, COALESCE(v_old_price, 0), v_new_price, 'receipt_upload', v_organization_id
            );
        END IF;

        INSERT INTO public.stock_movements (
            id, batch_id, material_id, supplier_id, movement_type, quantity, unit_price,
            note, document_url, user_id, organization_id
        )
        VALUES (
            gen_random_uuid(), v_batch_id, v_material_id, v_supplier_id, 'giris',
            v_quantity, v_new_price, 'Yapay Zeka Fiş Yükleme', v_image_url,
            v_user_id, v_organization_id
        );
    END LOOP;

    INSERT INTO public.activity_logs (
        module, action_type, description, details, user_id, organization_id
    )
    VALUES (
        'Tedarikçi Fişleri',
        CASE WHEN v_replace_batch_id IS NULL THEN 'EKLEME' ELSE 'GUNCELLEME' END,
        CASE WHEN v_replace_batch_id IS NULL
            THEN 'Tedarikçi fişi kaydedildi'
            ELSE 'Tedarikçi fişi atomik olarak değiştirildi'
        END,
        jsonb_build_object(
            'batch_id', v_batch_id,
            'replaced_batch_id', v_replace_batch_id,
            'supplier_id', v_supplier_id,
            'document_reference', v_image_url
        ),
        v_user_id::text,
        v_organization_id
    );

    RETURN json_build_object(
        'success', true,
        'supplier_id', v_supplier_id,
        'audit_details', array_to_string(v_audit_details, ' | ')
    );
END;
$$;
REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

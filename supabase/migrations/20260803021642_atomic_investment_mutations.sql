-- Consolidate investment mutations into tenant-scoped database transactions.

DROP FUNCTION IF EXISTS public.delete_investment_transaction(uuid);

CREATE FUNCTION public.delete_investment_transaction(
    p_transaction_id uuid,
    p_organization_id uuid,
    p_write_audit boolean DEFAULT true
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_transaction record;
    v_investment record;
    v_movement record;
    v_movement_found boolean := false;
    v_balance_delta numeric := 0;
    v_new_quantity numeric;
    v_new_total_cost numeric;
    v_deleted_investment boolean := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    SELECT id, investment_id, transaction_type, quantity, total_amount, account_id, transaction_date, created_at
    INTO v_transaction
    FROM public.investment_transactions
    WHERE id = p_transaction_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım işlemi bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    SELECT id, name, quantity, average_cost
    INTO v_investment
    FROM public.investments
    WHERE id = v_transaction.investment_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.account_id IS NOT NULL THEN
        SELECT id, account_id, amount, movement_type
        INTO v_movement
        FROM public.account_movements
        WHERE organization_id = p_organization_id
          AND account_id = v_transaction.account_id
          AND amount = v_transaction.total_amount
          AND (
              (
                  v_transaction.transaction_type = 'buy'
                  AND source_type = 'investment'
                  AND (
                      source_id IN (v_transaction.id::text, v_transaction.investment_id::text)
                      OR (v_investment.name IS NOT NULL AND description ILIKE '%' || v_investment.name || '%')
                  )
              )
              OR (
                  v_transaction.transaction_type = 'rent'
                  AND source_type = 'investment_rent'
                  AND (source_id IS NULL OR source_id IN (v_transaction.id::text, v_transaction.investment_id::text))
              )
          )
        ORDER BY
            CASE WHEN source_id = v_transaction.id::text THEN 0 ELSE 1 END,
            abs(extract(epoch FROM (created_at - v_transaction.created_at)))
        LIMIT 1
        FOR UPDATE;
        v_movement_found := FOUND;
    END IF;

    IF v_movement_found THEN
        v_balance_delta := CASE
            WHEN v_movement.movement_type = 'cikis' THEN v_movement.amount
            ELSE -v_movement.amount
        END;

        UPDATE public.accounts
        SET balance = COALESCE(balance, 0) + v_balance_delta
        WHERE id = v_movement.account_id
          AND organization_id = p_organization_id;

        DELETE FROM public.account_movements
        WHERE id = v_movement.id
          AND organization_id = p_organization_id;
    END IF;

    DELETE FROM public.investment_transactions
    WHERE id = p_transaction_id
      AND organization_id = p_organization_id;

    IF v_investment.id IS NOT NULL AND v_transaction.transaction_type = 'buy' THEN
        v_new_quantity := COALESCE(v_investment.quantity, 0) - COALESCE(v_transaction.quantity, 0);

        IF v_new_quantity <= 0 THEN
            DELETE FROM public.investments
            WHERE id = v_investment.id
              AND organization_id = p_organization_id;
            v_deleted_investment := true;
        ELSE
            v_new_total_cost := GREATEST(
                0,
                COALESCE(v_investment.quantity, 0) * COALESCE(v_investment.average_cost, 0)
                - COALESCE(v_transaction.total_amount, 0)
            );

            UPDATE public.investments
            SET quantity = v_new_quantity,
                average_cost = v_new_total_cost / v_new_quantity,
                updated_at = timezone('utc', now())
            WHERE id = v_investment.id
              AND organization_id = p_organization_id;
        END IF;
    END IF;

    IF p_write_audit THEN
        INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
        VALUES (
            'Yatırımlar',
            'SILME',
            format('Yatırım işlemi silindi: %s', COALESCE(v_investment.name, v_transaction.investment_id::text)),
            jsonb_build_object(
                'transactionId', p_transaction_id,
                'investmentId', v_transaction.investment_id,
                'transactionType', v_transaction.transaction_type,
                'refundedAmount', v_balance_delta,
                'deletedInvestment', v_deleted_investment
            ),
            v_user_id::text,
            p_organization_id
        );
    END IF;

    RETURN json_build_object(
        'refunded_amount', v_balance_delta,
        'deleted_investment', v_deleted_investment
    );
END;
$$;

CREATE FUNCTION public.delete_investment_with_refund(
    p_investment_id uuid,
    p_organization_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_investment_name text;
    v_transaction record;
    v_result json;
    v_refunded_amount numeric := 0;
    v_transaction_count integer := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    SELECT name
    INTO v_investment_name
    FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    FOR v_transaction IN
        SELECT id
        FROM public.investment_transactions
        WHERE investment_id = p_investment_id
          AND organization_id = p_organization_id
        ORDER BY CASE WHEN transaction_type = 'rent' THEN 0 ELSE 1 END, created_at DESC
    LOOP
        v_result := public.delete_investment_transaction(v_transaction.id, p_organization_id, false);
        v_refunded_amount := v_refunded_amount + COALESCE((v_result->>'refunded_amount')::numeric, 0);
        v_transaction_count := v_transaction_count + 1;
    END LOOP;

    DELETE FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Yatırımlar',
        'SILME',
        format('Yatırım silindi ve bağlı finans hareketleri geri alındı: %s', v_investment_name),
        jsonb_build_object(
            'investmentId', p_investment_id,
            'transactionCount', v_transaction_count,
            'refundedAmount', v_refunded_amount
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN json_build_object(
        'refunded_amount', v_refunded_amount,
        'transaction_count', v_transaction_count
    );
END;
$$;

CREATE FUNCTION public.update_investment(
    p_investment_id uuid,
    p_organization_id uuid,
    p_name text,
    p_quantity numeric,
    p_average_cost numeric,
    p_notes text,
    p_purchase_date date,
    p_document_url text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_old record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 100
       OR p_quantity IS NULL OR p_quantity < 0 OR p_quantity > 99999999.9999
       OR p_average_cost IS NULL OR p_average_cost < 0 OR p_average_cost > 99999999.9999 THEN
        RAISE EXCEPTION 'Geçerli yatırım bilgileri gereklidir.' USING ERRCODE = '22023';
    END IF;

    SELECT name, quantity, average_cost, notes, purchase_date, document_url
    INTO v_old
    FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.investments
    SET name = btrim(p_name),
        quantity = p_quantity,
        average_cost = p_average_cost,
        notes = p_notes,
        purchase_date = p_purchase_date,
        document_url = p_document_url,
        updated_at = timezone('utc', now())
    WHERE id = p_investment_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Yatırımlar',
        'GUNCELLEME',
        format('Yatırım düzenlendi: %s', btrim(p_name)),
        jsonb_build_object(
            'investmentId', p_investment_id,
            'before', jsonb_build_object('name', v_old.name, 'quantity', v_old.quantity, 'averageCost', v_old.average_cost),
            'after', jsonb_build_object('name', btrim(p_name), 'quantity', p_quantity, 'averageCost', p_average_cost)
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN true;
END;
$$;

CREATE FUNCTION public.update_investment_value(
    p_investment_id uuid,
    p_organization_id uuid,
    p_current_value numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_name text;
    v_old_value numeric;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_current_value IS NULL OR p_current_value < 0 OR p_current_value > 9999999999.9999 THEN
        RAISE EXCEPTION 'Geçerli yatırım değeri gereklidir.' USING ERRCODE = '22023';
    END IF;

    SELECT name, current_manual_value
    INTO v_name, v_old_value
    FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.investments
    SET current_manual_value = p_current_value,
        updated_at = timezone('utc', now())
    WHERE id = p_investment_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Yatırımlar',
        'GUNCELLEME',
        format('Yatırım değeri güncellendi: %s', v_name),
        jsonb_build_object(
            'investmentId', p_investment_id,
            'oldValue', v_old_value,
            'newValue', p_current_value
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_investment_rent(
    p_investment_id uuid,
    p_account_id uuid,
    p_amount numeric,
    p_organization_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_investment_name text;
    v_transaction_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 9999999999.99 THEN
        RAISE EXCEPTION 'Kira tutarı sıfırdan büyük olmalıdır.' USING ERRCODE = '22023';
    END IF;

    SELECT name
    INTO v_investment_name
    FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
    FROM public.accounts
    WHERE id = p_account_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hesap bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.investment_transactions (
        investment_id,
        transaction_type,
        quantity,
        price_per_unit,
        total_amount,
        account_id,
        transaction_date,
        organization_id
    )
    VALUES (
        p_investment_id,
        'rent',
        1,
        p_amount,
        p_amount,
        p_account_id,
        CURRENT_DATE,
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
        'giris',
        p_amount,
        format('Gayrimenkul Kira Geliri Tahsilatı: %s', v_investment_name),
        'investment_rent',
        v_transaction_id::text,
        p_organization_id
    );

    UPDATE public.accounts
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_account_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES (
        'Yatırımlar',
        'EKLEME',
        format('Kira tahsilatı: %s', v_investment_name),
        jsonb_build_object(
            'investmentId', p_investment_id,
            'transactionId', v_transaction_id,
            'accountId', p_account_id,
            'amount', p_amount
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN json_build_object('success', true, 'transaction_id', v_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_investment_transaction(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_investment_with_refund(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_investment_value(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_investment_rent(uuid, uuid, numeric, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_investment_transaction(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_investment_with_refund(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_investment_value(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_investment_rent(uuid, uuid, numeric, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

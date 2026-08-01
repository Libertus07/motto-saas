-- Keep the existing, battle-tested stock/receipt bodies and correct the two
-- PL/pgSQL array initializers that the database linter flags as implicit casts.
DO $migration$
DECLARE
    v_definition text;
    v_updated_definition text;
BEGIN
    SELECT pg_get_functiondef('public.apply_stock_count(jsonb)'::regprocedure)
    INTO v_definition;

    v_updated_definition := replace(
        v_definition,
        'v_details text[] := ''{}'';',
        'v_details text[] := ARRAY[]::text[];'
    );

    IF v_updated_definition = v_definition THEN
        RAISE EXCEPTION 'apply_stock_count array initializer was not found';
    END IF;

    EXECUTE v_updated_definition;

    SELECT pg_get_functiondef('public.process_receipt_upload(json)'::regprocedure)
    INTO v_definition;

    v_updated_definition := replace(
        v_definition,
        'v_audit_details text[] := ''{}'';',
        'v_audit_details text[] := ARRAY[]::text[];'
    );
    v_updated_definition := replace(
        v_updated_definition,
        'v_user_id := (payload->>''user_id'')::uuid;',
        E'v_user_id := auth.uid();\n\n    IF v_user_id IS NULL THEN\n        RAISE EXCEPTION ''Oturum açmış bir kullanıcı gereklidir.'' USING ERRCODE = ''42501'';\n    END IF;'
    );

    IF v_updated_definition = v_definition THEN
        RAISE EXCEPTION 'process_receipt_upload hardening targets were not found';
    END IF;

    EXECUTE v_updated_definition;
END;
$migration$;

-- The client already sends organization_id. Replace the legacy three-argument
-- overload with an explicitly tenant-scoped signature and least-privilege ACL.
DROP FUNCTION IF EXISTS public.process_investment_rent(uuid, uuid, numeric);

CREATE FUNCTION public.process_investment_rent(
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
    v_organization_id uuid := COALESCE(p_organization_id, public.current_organization_id());
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Kira tutarı sıfırdan büyük olmalıdır.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.investments
    WHERE id = p_investment_id
      AND organization_id = v_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
    FROM public.accounts
    WHERE id = p_account_id
      AND organization_id = v_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hesap bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.accounts
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_account_id
      AND organization_id = v_organization_id;

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
        'Gayrimenkul Kira Geliri Tahsilatı',
        'investment_rent',
        p_investment_id::text,
        v_organization_id
    );

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
        v_organization_id
    );

    RETURN json_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_count(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_investment_rent(uuid, uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_stock_count(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM anon;
REVOKE ALL ON FUNCTION public.process_investment_rent(uuid, uuid, numeric, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.apply_stock_count(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_investment_rent(uuid, uuid, numeric, uuid) TO authenticated;

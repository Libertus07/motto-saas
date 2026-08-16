DO $migration$
DECLARE
    v_signatures text[] := ARRAY[
        'public.process_receipt_upload(json)',
        'public.buy_investment_transaction(text,text,numeric,numeric,uuid,text,date,text,uuid)',
        'public.buy_investment_transaction(text,text,numeric,numeric,uuid,text,date,text,uuid,uuid)',
        'public.update_investment(uuid,uuid,text,numeric,numeric,text,date,text)',
        'public.process_z_report_atomic(uuid,date,jsonb,jsonb,jsonb,text,boolean,jsonb)'
    ];
    v_existing_guards text[] := ARRAY[
        $guard$    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF auth.uid() IS NULL
       OR p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, auth.uid()) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;$guard$
    ];
    v_scoped_guards text[] := ARRAY[
        $guard$    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = v_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
    END IF;$guard$,
        $guard$    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
    END IF;$guard$
    ];
    v_scope_predicates text[] := ARRAY[
        'selected_profile.active_organization_id = v_organization_id',
        'selected_profile.active_organization_id = p_organization_id',
        'selected_profile.active_organization_id = p_organization_id',
        'selected_profile.active_organization_id = p_organization_id',
        'selected_profile.active_organization_id = p_organization_id'
    ];
    v_definition text;
    v_updated_definition text;
    v_procedure pg_catalog.regprocedure;
    v_index integer;
BEGIN
    FOR v_index IN 1..pg_catalog.array_length(v_signatures, 1)
    LOOP
        v_procedure := pg_catalog.to_regprocedure(v_signatures[v_index]);
        IF v_procedure IS NULL THEN
            RAISE EXCEPTION 'Required financial RPC is missing: %', v_signatures[v_index];
        END IF;

        SELECT pg_catalog.pg_get_functiondef(v_procedure)
        INTO v_definition;

        IF pg_catalog.strpos(v_definition, v_scope_predicates[v_index]) > 0
           AND pg_catalog.strpos(
                v_definition,
                'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.'
           ) > 0 THEN
            CONTINUE;
        END IF;

        IF pg_catalog.strpos(v_definition, v_existing_guards[v_index]) = 0 THEN
            RAISE EXCEPTION
                'Financial RPC authorization guard could not be verified: %',
                v_signatures[v_index];
        END IF;

        v_updated_definition := pg_catalog.replace(
            v_definition,
            v_existing_guards[v_index],
            v_existing_guards[v_index] || E'\n\n' || v_scoped_guards[v_index]
        );
        EXECUTE v_updated_definition;
    END LOOP;
END;
$migration$;

ALTER FUNCTION public.process_receipt_upload(json) SECURITY INVOKER;
ALTER FUNCTION public.process_receipt_upload(json)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated, service_role;

ALTER FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid)
SECURITY INVOKER;
ALTER FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid)
TO authenticated, service_role;

ALTER FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid, uuid)
SECURITY INVOKER;
ALTER FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid, uuid)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid, uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text, uuid, uuid)
TO authenticated, service_role;

ALTER FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text)
SECURITY INVOKER;
ALTER FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_investment(uuid, uuid, text, numeric, numeric, text, date, text)
TO authenticated, service_role;

ALTER FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
SECURITY INVOKER;
ALTER FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

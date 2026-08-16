DO $migration$
DECLARE
    v_definition text;
    v_updated_definition text;
BEGIN
    IF pg_catalog.to_regprocedure(
        'private.is_valid_stable_financial_document_reference(text,uuid,text,text[])'
    ) IS NULL THEN
        RAISE EXCEPTION
            'Stable financial document validator is missing; refusing an incomplete hardening migration.';
    END IF;

    SELECT pg_catalog.pg_get_functiondef(
        'private.is_valid_stable_financial_document_reference(text,uuid,text,text[])'::pg_catalog.regprocedure
    )
    INTO v_definition;

    IF pg_catalog.strpos(
        v_definition,
        'p_reference LIKE ''storage://'' || p_bucket_id || ''/%'''
    ) > 0 THEN
        v_updated_definition := pg_catalog.replace(
            v_definition,
            'p_reference LIKE ''storage://'' || p_bucket_id || ''/%''',
            'pg_catalog.left(p_reference, pg_catalog.length(''storage://'' || p_bucket_id || ''/'')) = ''storage://'' || p_bucket_id || ''/'''
        );

        EXECUTE v_updated_definition;
    ELSIF pg_catalog.strpos(
        v_definition,
        'pg_catalog.left(p_reference, pg_catalog.length(''storage://'' || p_bucket_id || ''/'')) = ''storage://'' || p_bucket_id || ''/'''
    ) = 0 THEN
        RAISE EXCEPTION
            'Stable financial document bucket predicate could not be verified.';
    END IF;
END;
$migration$;

DO $migration$
DECLARE
    v_definition text;
    v_updated_definition text;
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

    SELECT pg_catalog.pg_get_functiondef(
        'public.process_receipt_upload(json)'::pg_catalog.regprocedure
    )
    INTO v_definition;

    IF pg_catalog.strpos(
        v_definition,
        'v_image_url NOT LIKE ''storage://motto_assets/%'''
    ) > 0 THEN
        v_updated_definition := pg_catalog.replace(
            v_definition,
            'v_image_url NOT LIKE ''storage://motto_assets/%''',
            'pg_catalog.left(v_image_url, pg_catalog.length(''storage://motto_assets/'')) IS DISTINCT FROM ''storage://motto_assets/'''
        );

        EXECUTE v_updated_definition;
    ELSIF pg_catalog.strpos(
        v_definition,
        'pg_catalog.left(v_image_url, pg_catalog.length(''storage://motto_assets/'')) IS DISTINCT FROM ''storage://motto_assets/'''
    ) = 0 THEN
        RAISE EXCEPTION
            'process_receipt_upload bucket predicate could not be verified.';
    END IF;
END;
$migration$;

ALTER FUNCTION public.process_receipt_upload(json) SECURITY INVOKER;
ALTER FUNCTION public.process_receipt_upload(json)
SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

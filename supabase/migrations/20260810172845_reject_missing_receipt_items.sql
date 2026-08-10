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
        'IF v_batch_id IS NULL OR json_typeof(v_items) <> ''array'' THEN'
    ) = 0 THEN
        RAISE EXCEPTION
            'process_receipt_upload item-type precondition could not be verified.';
    END IF;

    v_updated_definition := pg_catalog.replace(
        v_definition,
        'IF v_batch_id IS NULL OR json_typeof(v_items) <> ''array'' THEN',
        E'IF v_batch_id IS NULL\n       OR json_typeof(v_items) IS DISTINCT FROM ''array'' THEN'
    );

    IF pg_catalog.strpos(
        v_updated_definition,
        'IF json_array_length(v_items) = 0 THEN'
    ) = 0 THEN
        RAISE EXCEPTION
            'process_receipt_upload item-count precondition could not be verified.';
    END IF;

    v_updated_definition := pg_catalog.replace(
        v_updated_definition,
        'IF json_array_length(v_items) = 0 THEN',
        'IF coalesce(json_array_length(v_items), 0) = 0 THEN'
    );

    EXECUTE v_updated_definition;
END;
$migration$;

ALTER FUNCTION public.process_receipt_upload(json) SECURITY INVOKER;
ALTER FUNCTION public.process_receipt_upload(json)
SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

CREATE TABLE IF NOT EXISTS private.organization_document_object_conflicts (
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    organization_ids uuid[] NOT NULL,
    detected_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    resolved_at timestamptz,
    CONSTRAINT organization_document_object_conflicts_pkey
        PRIMARY KEY (bucket_id, object_name),
    CONSTRAINT organization_document_object_conflicts_bucket_id_check
        CHECK (bucket_id IN ('motto_assets', 'receipts')),
    CONSTRAINT organization_document_object_conflicts_organizations_check
        CHECK (cardinality(organization_ids) > 1)
);

ALTER TABLE private.organization_document_object_conflicts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.organization_document_object_conflicts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.reconcile_legacy_financial_document_mappings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_conflict_count integer;
    v_mapped_count integer;
BEGIN
    LOCK TABLE
        public.stock_movements,
        public.sales,
        public.investments,
        public.investment_transactions,
        private.organization_document_objects
    IN SHARE MODE;

    CREATE TEMP TABLE _financial_document_candidates (
        organization_id uuid NOT NULL,
        bucket_id text NOT NULL,
        object_name text NOT NULL,
        PRIMARY KEY (organization_id, bucket_id, object_name)
    ) ON COMMIT DROP;

    INSERT INTO _financial_document_candidates (organization_id, bucket_id, object_name)
    SELECT DISTINCT
        candidate.organization_id,
        candidate.bucket_id,
        candidate.object_name
    FROM (
        SELECT
            mapped.organization_id,
            mapped.bucket_id,
            mapped.object_name
        FROM private.organization_document_objects AS mapped

        UNION ALL

        SELECT
            source.organization_id,
            source.bucket_id,
            private.storage_object_name_from_reference(source.bucket_id, source.document_reference)
        FROM (
            SELECT
                movement.organization_id,
                'motto_assets'::text AS bucket_id,
                movement.document_url AS document_reference
            FROM public.stock_movements AS movement
            WHERE movement.document_url ~
                '^https://zahdmrvhxsmqpeesrfkt[.]supabase[.]co/storage/v1/object/public/motto_assets/'

            UNION ALL

            SELECT
                sale.organization_id,
                'receipts'::text,
                sale.document_url
            FROM public.sales AS sale
            WHERE sale.document_url ~
                '^https://zahdmrvhxsmqpeesrfkt[.]supabase[.]co/storage/v1/object/public/receipts/'

            UNION ALL

            SELECT
                investment.organization_id,
                'motto_assets'::text,
                investment.document_url
            FROM public.investments AS investment
            WHERE investment.document_url ~
                '^https://zahdmrvhxsmqpeesrfkt[.]supabase[.]co/storage/v1/object/public/motto_assets/'

            UNION ALL

            SELECT
                transaction.organization_id,
                'motto_assets'::text,
                transaction.document_url
            FROM public.investment_transactions AS transaction
            WHERE transaction.document_url ~
                '^https://zahdmrvhxsmqpeesrfkt[.]supabase[.]co/storage/v1/object/public/motto_assets/'
        ) AS source
    ) AS candidate
    WHERE candidate.organization_id IS NOT NULL
      AND candidate.object_name IS NOT NULL
    ON CONFLICT DO NOTHING;

    CREATE TEMP TABLE _financial_document_conflicts
    ON COMMIT DROP
    AS
    SELECT
        candidate.bucket_id,
        candidate.object_name,
        array_agg(DISTINCT candidate.organization_id ORDER BY candidate.organization_id) AS organization_ids
    FROM _financial_document_candidates AS candidate
    GROUP BY candidate.bucket_id, candidate.object_name
    HAVING count(DISTINCT candidate.organization_id) > 1;

    UPDATE private.organization_document_object_conflicts AS conflict
    SET resolved_at = timezone('utc', now()),
        last_seen_at = timezone('utc', now())
    WHERE conflict.resolved_at IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM _financial_document_conflicts AS current_conflict
          WHERE current_conflict.bucket_id = conflict.bucket_id
            AND current_conflict.object_name = conflict.object_name
      );

    INSERT INTO private.organization_document_object_conflicts (
        bucket_id,
        object_name,
        organization_ids,
        detected_at,
        last_seen_at,
        resolved_at
    )
    SELECT
        conflict.bucket_id,
        conflict.object_name,
        conflict.organization_ids,
        timezone('utc', now()),
        timezone('utc', now()),
        NULL
    FROM _financial_document_conflicts AS conflict
    ON CONFLICT (bucket_id, object_name)
    DO UPDATE SET
        organization_ids = EXCLUDED.organization_ids,
        last_seen_at = EXCLUDED.last_seen_at,
        resolved_at = NULL;

    DELETE FROM private.organization_document_objects AS mapped
    USING _financial_document_conflicts AS conflict
    WHERE mapped.bucket_id = conflict.bucket_id
      AND mapped.object_name = conflict.object_name;

    INSERT INTO private.organization_document_objects (organization_id, bucket_id, object_name)
    SELECT
        candidate.organization_id,
        candidate.bucket_id,
        candidate.object_name
    FROM _financial_document_candidates AS candidate
    WHERE NOT EXISTS (
        SELECT 1
        FROM _financial_document_conflicts AS conflict
        WHERE conflict.bucket_id = candidate.bucket_id
          AND conflict.object_name = candidate.object_name
    )
    ON CONFLICT (organization_id, bucket_id, object_name) DO NOTHING;

    IF EXISTS (
        SELECT 1
        FROM _financial_document_candidates AS candidate
        LEFT JOIN _financial_document_conflicts AS conflict
          ON conflict.bucket_id = candidate.bucket_id
         AND conflict.object_name = candidate.object_name
        LEFT JOIN private.organization_document_objects AS mapped
          ON mapped.organization_id = candidate.organization_id
         AND mapped.bucket_id = candidate.bucket_id
         AND mapped.object_name = candidate.object_name
        WHERE conflict.bucket_id IS NULL
          AND mapped.organization_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Legacy financial document mapping reconciliation is incomplete.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM _financial_document_conflicts AS conflict
        INNER JOIN private.organization_document_objects AS mapped
          ON mapped.bucket_id = conflict.bucket_id
         AND mapped.object_name = conflict.object_name
    ) THEN
        RAISE EXCEPTION 'Conflicted legacy financial document mappings remain authorized.';
    END IF;

    SELECT count(*)::integer INTO v_conflict_count
    FROM _financial_document_conflicts;

    SELECT count(*)::integer INTO v_mapped_count
    FROM _financial_document_candidates AS candidate
    WHERE NOT EXISTS (
        SELECT 1
        FROM _financial_document_conflicts AS conflict
        WHERE conflict.bucket_id = candidate.bucket_id
          AND conflict.object_name = candidate.object_name
    );

    RETURN jsonb_build_object(
        'mapped_candidates', v_mapped_count,
        'quarantined_conflicts', v_conflict_count
    );
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_legacy_financial_document_mappings()
FROM PUBLIC, anon, authenticated, service_role;

SELECT private.reconcile_legacy_financial_document_mappings();

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'private.organization_document_objects'::regclass
          AND conname = 'organization_document_objects_object_key'
    ) THEN
        ALTER TABLE private.organization_document_objects
        ADD CONSTRAINT organization_document_objects_object_key
        UNIQUE (bucket_id, object_name);
    END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION private.can_access_organization_document(
    p_bucket_id text,
    p_object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH request_context AS (
        SELECT
            (SELECT auth.uid()) AS user_id,
            CASE
                WHEN split_part(coalesce(p_object_name, ''), '/', 1) ~
                    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
                THEN split_part(p_object_name, '/', 1)::uuid
                ELSE NULL
            END AS path_organization_id
    ), legacy_mapping AS (
        SELECT
            (array_agg(
                DISTINCT mapped.organization_id
                ORDER BY mapped.organization_id
            ))[1] AS organization_id,
            count(DISTINCT mapped.organization_id) AS organization_count
        FROM private.organization_document_objects AS mapped
        WHERE mapped.bucket_id = p_bucket_id
          AND mapped.object_name = p_object_name
    )
    SELECT coalesce(
        request_context.user_id IS NOT NULL
        AND p_bucket_id IN ('motto_assets', 'receipts')
        AND EXISTS (
            SELECT 1
            FROM public.organization_members AS membership
            WHERE membership.user_id = request_context.user_id
              AND membership.status = 'active'
              AND (
                  membership.organization_id = request_context.path_organization_id
                  OR (
                      request_context.path_organization_id IS NULL
                      AND
                      legacy_mapping.organization_count = 1
                      AND membership.organization_id = legacy_mapping.organization_id
                  )
              )
        ),
        false
    )
    FROM request_context
    CROSS JOIN legacy_mapping;
$$;

REVOKE ALL ON FUNCTION private.can_access_organization_document(text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_organization_document(text, text)
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_valid_stable_financial_document_reference(
    p_reference text,
    p_organization_id uuid,
    p_bucket_id text,
    p_allowed_kinds text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    WITH parsed AS (
        SELECT substring(
            p_reference
            FROM length('storage://' || p_bucket_id || '/') + 1
        ) AS object_name
        WHERE p_reference IS NOT NULL
          AND p_organization_id IS NOT NULL
          AND p_bucket_id IN ('motto_assets', 'receipts')
          AND p_reference LIKE 'storage://' || p_bucket_id || '/%'
    ), segments AS (
        SELECT
            object_name,
            string_to_array(object_name, '/') AS path_segments
        FROM parsed
    )
    SELECT coalesce(
        cardinality(path_segments) = 3
        AND path_segments[1] = p_organization_id::text
        AND path_segments[2] = ANY(p_allowed_kinds)
        AND path_segments[3] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}[.][a-z0-9]+$'
        AND CASE path_segments[2]
            WHEN 'supplier-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND lower(split_part(path_segments[3], '.', 2)) IN
                    ('jpg', 'jpeg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx')
            WHEN 'investment-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND lower(split_part(path_segments[3], '.', 2)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
            WHEN 'investment-document' THEN
                p_bucket_id = 'motto_assets'
                AND lower(split_part(path_segments[3], '.', 2)) IN ('jpg', 'jpeg', 'png', 'webp', 'pdf')
            WHEN 'z-report' THEN
                p_bucket_id = 'receipts'
                AND lower(split_part(path_segments[3], '.', 2)) IN
                    ('jpg', 'jpeg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx')
            ELSE false
        END,
        false
    )
    FROM segments;
$$;

REVOKE ALL ON FUNCTION private.is_valid_stable_financial_document_reference(text, uuid, text, text[])
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_financial_document_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_is_valid boolean;
    v_error_message text;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.document_url IS NOT DISTINCT FROM OLD.document_url
       AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
        RETURN NEW;
    END IF;

    IF NEW.document_url IS NULL THEN
        RETURN NEW;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'stock_movements' THEN
            v_is_valid := private.is_valid_stable_financial_document_reference(
                NEW.document_url,
                NEW.organization_id,
                'motto_assets',
                ARRAY['supplier-receipt']::text[]
            );
            v_error_message := 'Geçerli bir tedarikçi fişi belge referansı gereklidir.';
        WHEN 'sales' THEN
            v_is_valid := private.is_valid_stable_financial_document_reference(
                NEW.document_url,
                NEW.organization_id,
                'receipts',
                ARRAY['z-report']::text[]
            );
            v_error_message := 'Geçerli bir Z-Raporu belge referansı gereklidir.';
        WHEN 'investments', 'investment_transactions' THEN
            v_is_valid := private.is_valid_stable_financial_document_reference(
                NEW.document_url,
                NEW.organization_id,
                'motto_assets',
                ARRAY['investment-receipt', 'investment-document']::text[]
            );
            v_error_message := 'Geçerli bir yatırım belge referansı gereklidir.';
        ELSE
            RAISE EXCEPTION 'Unsupported financial document trigger table.';
    END CASE;

    IF NOT coalesce(v_is_valid, false) THEN
        RAISE EXCEPTION '%', v_error_message USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_financial_document_reference()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS enforce_financial_document_reference ON public.stock_movements;
CREATE TRIGGER enforce_financial_document_reference
BEFORE INSERT OR UPDATE OF document_url, organization_id ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION private.enforce_financial_document_reference();

DROP TRIGGER IF EXISTS enforce_financial_document_reference ON public.sales;
CREATE TRIGGER enforce_financial_document_reference
BEFORE INSERT OR UPDATE OF document_url, organization_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.enforce_financial_document_reference();

DROP TRIGGER IF EXISTS enforce_financial_document_reference ON public.investments;
CREATE TRIGGER enforce_financial_document_reference
BEFORE INSERT OR UPDATE OF document_url, organization_id ON public.investments
FOR EACH ROW EXECUTE FUNCTION private.enforce_financial_document_reference();

DROP TRIGGER IF EXISTS enforce_financial_document_reference ON public.investment_transactions;
CREATE TRIGGER enforce_financial_document_reference
BEFORE INSERT OR UPDATE OF document_url, organization_id ON public.investment_transactions
FOR EACH ROW EXECUTE FUNCTION private.enforce_financial_document_reference();

CREATE OR REPLACE FUNCTION private.is_valid_financial_document_upload(
    p_bucket_id text,
    p_name text,
    p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        p_bucket_id IN ('motto_assets', 'receipts')
        AND cardinality(storage.foldername(p_name)) = 2
        AND (storage.foldername(p_name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        AND p_name ~
            '^[0-9a-fA-F-]{36}/(supplier-receipt|investment-receipt|investment-document|z-report)/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.[a-z0-9]+$'
        AND COALESCE(
            (p_metadata->>'size')::bigint,
            (p_metadata->>'contentLength')::bigint,
            -1
        ) BETWEEN 1 AND
            CASE
                WHEN (storage.foldername(p_name))[2] = 'z-report' THEN 10485760
                ELSE 3145728
            END
        AND CASE (storage.foldername(p_name))[2]
            WHEN 'supplier-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND (
                    (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                        ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                        ('webp', 'image/webp'), ('pdf', 'application/pdf'),
                        ('xml', 'application/xml'), ('xml', 'text/xml'),
                        ('json', 'application/json'), ('xls', 'application/vnd.ms-excel'),
                        ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                    )
                )
            WHEN 'investment-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                    ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                    ('webp', 'image/webp'), ('pdf', 'application/pdf')
                )
            WHEN 'investment-document' THEN
                p_bucket_id = 'motto_assets'
                AND (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                    ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                    ('webp', 'image/webp'), ('pdf', 'application/pdf')
                )
            WHEN 'z-report' THEN
                p_bucket_id = 'receipts'
                AND (
                    (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                        ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                        ('webp', 'image/webp'), ('pdf', 'application/pdf'),
                        ('xml', 'application/xml'), ('xml', 'text/xml'),
                        ('json', 'application/json'), ('xls', 'application/vnd.ms-excel'),
                        ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                    )
                )
            ELSE false
        END;
$$;

REVOKE ALL ON FUNCTION private.is_valid_financial_document_upload(text, text, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_valid_financial_document_upload(text, text, jsonb)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

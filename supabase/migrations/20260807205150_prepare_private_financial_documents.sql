CREATE TABLE private.organization_document_objects (
    organization_id uuid NOT NULL,
    bucket_id text NOT NULL,
    object_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT organization_document_objects_pkey
        PRIMARY KEY (organization_id, bucket_id, object_name),
    CONSTRAINT organization_document_objects_organization_id_fkey
        FOREIGN KEY (organization_id)
        REFERENCES public.organizations(id)
        ON DELETE CASCADE,
    CONSTRAINT organization_document_objects_bucket_id_check
        CHECK (bucket_id IN ('motto_assets', 'receipts'))
);

ALTER TABLE private.organization_document_objects ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.organization_document_objects FROM PUBLIC, anon, authenticated;

-- The primary key supports organization cascades. Legacy authorization starts
-- from bucket and object name, so it needs the reverse lookup order as well.
CREATE INDEX organization_document_objects_lookup_idx
ON private.organization_document_objects (bucket_id, object_name, organization_id);

CREATE FUNCTION private.storage_object_name_from_reference(
    p_bucket_id text,
    p_reference text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    WITH extracted_reference AS (
        SELECT CASE
            WHEN p_bucket_id NOT IN ('motto_assets', 'receipts') THEN NULL
            WHEN left(
                p_reference,
                length('storage://' || p_bucket_id || '/')
            ) = 'storage://' || p_bucket_id || '/' THEN
                NULLIF(
                    substring(
                        p_reference
                        FROM length('storage://' || p_bucket_id || '/') + 1
                    ),
                    ''
                )
            WHEN p_reference ~ (
                '^https://[a-z0-9]{20}[.]supabase[.]co/storage/v1/object/public/'
                || p_bucket_id
                || '/[^?#]+([?#].*)?$'
            ) THEN
                NULLIF(
                    split_part(
                        split_part(
                            split_part(
                                p_reference,
                                '/storage/v1/object/public/' || p_bucket_id || '/',
                                2
                            ),
                            '?',
                            1
                        ),
                        '#',
                        1
                    ),
                    ''
                )
            ELSE NULL
        END AS object_name
    )
    SELECT object_name
    FROM extracted_reference
    WHERE object_name IS NOT NULL
      AND position('?' IN object_name) = 0
      AND position('#' IN object_name) = 0
      AND position('%' IN object_name) = 0
      AND position(chr(92) IN object_name) = 0
      AND object_name !~ '(^|/)[.]{1,2}(/|$)'
      AND object_name !~ '(^/|/$|//)';
$$;

REVOKE ALL ON FUNCTION private.storage_object_name_from_reference(text, text)
FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.organization_document_objects (
    organization_id,
    bucket_id,
    object_name
)
SELECT
    parsed_reference.organization_id,
    parsed_reference.bucket_id,
    parsed_reference.object_name
FROM (
    SELECT
        source_reference.organization_id,
        source_reference.bucket_id,
        private.storage_object_name_from_reference(
            source_reference.bucket_id,
            source_reference.document_reference
        ) AS object_name
    FROM (
        SELECT
            stock_movement.organization_id,
            'motto_assets'::text AS bucket_id,
            stock_movement.document_url AS document_reference
        FROM public.stock_movements AS stock_movement
        WHERE stock_movement.document_url IS NOT NULL

        UNION ALL

        SELECT
            sale.organization_id,
            'receipts'::text AS bucket_id,
            sale.document_url AS document_reference
        FROM public.sales AS sale
        WHERE sale.document_url IS NOT NULL

        UNION ALL

        SELECT
            investment.organization_id,
            'motto_assets'::text AS bucket_id,
            investment.document_url AS document_reference
        FROM public.investments AS investment
        WHERE investment.document_url IS NOT NULL

        UNION ALL

        SELECT
            investment_transaction.organization_id,
            'motto_assets'::text AS bucket_id,
            investment_transaction.document_url AS document_reference
        FROM public.investment_transactions AS investment_transaction
        WHERE investment_transaction.document_url IS NOT NULL
    ) AS source_reference
) AS parsed_reference
WHERE parsed_reference.object_name IS NOT NULL
ON CONFLICT (organization_id, bucket_id, object_name) DO NOTHING;

-- Storage policies need a privileged lookup because the legacy mapping is
-- intentionally inaccessible to browser roles. The caller identity is still
-- checked explicitly and every accepted organization requires active membership.
CREATE FUNCTION private.can_access_organization_document(
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
    )
    SELECT coalesce(
        request_context.user_id IS NOT NULL
        AND p_bucket_id IN ('motto_assets', 'receipts')
        AND (
            EXISTS (
                SELECT 1
                FROM public.organization_members AS membership
                WHERE membership.organization_id = request_context.path_organization_id
                  AND membership.user_id = request_context.user_id
                  AND membership.status = 'active'
            )
            OR EXISTS (
                SELECT 1
                FROM private.organization_document_objects AS mapped_object
                INNER JOIN public.organization_members AS membership
                  ON membership.organization_id = mapped_object.organization_id
                 AND membership.user_id = request_context.user_id
                 AND membership.status = 'active'
                WHERE mapped_object.bucket_id = p_bucket_id
                  AND mapped_object.object_name = p_object_name
            )
        ),
        false
    )
    FROM request_context;
$$;

REVOKE ALL ON FUNCTION private.can_access_organization_document(text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_organization_document(text, text)
TO authenticated, service_role;

CREATE POLICY "Financial documents can be selected by active organization members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    private.can_access_organization_document(bucket_id, name)
);

CREATE POLICY "Financial documents can be inserted by active organization members"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id IN ('motto_assets', 'receipts')
    AND CASE
        WHEN bucket_id = 'motto_assets'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf')
        WHEN bucket_id = 'receipts'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx')
        ELSE false
    END
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS membership
        WHERE membership.organization_id = CASE
                WHEN (storage.foldername(name))[1] ~
                    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
                THEN (storage.foldername(name))[1]::uuid
                ELSE NULL
            END
          AND membership.user_id = (SELECT auth.uid())
          AND membership.status = 'active'
    )
);

CREATE POLICY "Financial documents can be updated by their active organization owner"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    owner_id = (SELECT auth.uid()::text)
    AND private.can_access_organization_document(bucket_id, name)
    AND CASE
        WHEN bucket_id = 'motto_assets'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf')
        WHEN bucket_id = 'receipts'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx')
        ELSE false
    END
)
WITH CHECK (
    owner_id = (SELECT auth.uid()::text)
    AND private.can_access_organization_document(bucket_id, name)
    AND CASE
        WHEN bucket_id = 'motto_assets'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf')
        WHEN bucket_id = 'receipts'
            THEN lower(storage.extension(name)) IN ('jpeg', 'jpg', 'png', 'webp', 'pdf', 'xml', 'json', 'xls', 'xlsx')
        ELSE false
    END
);

CREATE POLICY "Financial documents can be deleted by their active organization owner"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    owner_id = (SELECT auth.uid()::text)
    AND private.can_access_organization_document(bucket_id, name)
);

NOTIFY pgrst, 'reload schema';

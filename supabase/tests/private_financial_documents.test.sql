BEGIN;

SELECT plan(37);

SELECT has_table(
    'private',
    'organization_document_objects',
    'the private legacy document mapping table exists'
);

SELECT is(
    (
        SELECT string_agg(
            format('%s:%s:%s', column_name, data_type, is_nullable),
            ','
            ORDER BY ordinal_position
        )
        FROM information_schema.columns
        WHERE table_schema = 'private'
          AND table_name = 'organization_document_objects'
    ),
    'organization_id:uuid:NO,bucket_id:text:NO,object_name:text:NO,created_at:timestamp with time zone:NO',
    'the legacy mapping keeps the exact organization, bucket, object, and timestamp contract'
);

SELECT ok(
    (
        SELECT class.relrowsecurity
        FROM pg_class AS class
        INNER JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
        WHERE namespace.nspname = 'private'
          AND class.relname = 'organization_document_objects'
    ),
    'row-level security is enabled on the private mapping table'
);

SELECT is(
    (
        SELECT pg_get_constraintdef(constraint_row.oid)
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'private.organization_document_objects'::regclass
          AND constraint_row.contype = 'p'
    ),
    'PRIMARY KEY (organization_id, bucket_id, object_name)',
    'the mapping primary key prevents duplicate organization object mappings'
);

SELECT is(
    (
        SELECT pg_get_constraintdef(constraint_row.oid)
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'private.organization_document_objects'::regclass
          AND constraint_row.contype = 'f'
    ),
    'FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE',
    'organization deletion cascades to its legacy document mappings'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'private'
          AND tablename = 'organization_document_objects'
          AND indexdef LIKE '%(bucket_id, object_name, organization_id)'
    ),
    'legacy bucket and object lookups have a covering organization index'
);

SELECT ok(
    NOT has_table_privilege('anon', 'private.organization_document_objects', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'private.organization_document_objects', 'SELECT')
    AND NOT has_table_privilege('anon', 'private.organization_document_objects', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'private.organization_document_objects', 'INSERT,UPDATE,DELETE'),
    'browser roles have no direct access to the private mapping table'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'authenticated',
        'authenticated',
        'financial-active@example.com',
        now(),
        now()
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'authenticated',
        'authenticated',
        'financial-other@example.com',
        now(),
        now()
    ),
    (
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'authenticated',
        'authenticated',
        'financial-suspended@example.com',
        now(),
        now()
    ),
    (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'authenticated',
        'authenticated',
        'financial-non-owner@example.com',
        now(),
        now()
    );

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'Financial Primary',
        'financial-primary',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'Financial Other',
        'financial-other',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'owner',
        'active'
    ),
    (
        '11111111-1111-4111-8111-111111111111',
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        'staff',
        'active'
    ),
    (
        '11111111-1111-4111-8111-111111111111',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'staff',
        'suspended'
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'owner',
        'active'
    );

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('motto_assets', 'motto_assets', true),
    ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

SELECT throws_ok(
    $$
    INSERT INTO private.organization_document_objects (organization_id, bucket_id, object_name)
    VALUES (
        '11111111-1111-4111-8111-111111111111',
        'unknown',
        'legacy/unknown.pdf'
    )
    $$,
    '23514',
    'new row for relation "organization_document_objects" violates check constraint "organization_document_objects_bucket_id_check"',
    'the mapping table rejects unsupported document buckets'
);

SELECT is(
    private.storage_object_name_from_reference(
        'motto_assets',
        'storage://motto_assets/legacy/supplier-receipt.pdf'
    ),
    'legacy/supplier-receipt.pdf',
    'the internal parser extracts stable storage references'
);

SELECT is(
    private.storage_object_name_from_reference(
        'receipts',
        'https://project.supabase.co/storage/v1/object/public/receipts/legacy/z-report.xlsx?download=1'
    ),
    'legacy/z-report.xlsx',
    'the internal parser extracts legacy public Storage URLs without query parameters'
);

SELECT is(
    private.storage_object_name_from_reference(
        'motto_assets',
        'storage://receipts/legacy/z-report.pdf'
    ),
    NULL,
    'the internal parser does not cross bucket boundaries'
);

SELECT ok(
    NOT has_function_privilege(
        'anon',
        'private.storage_object_name_from_reference(text,text)',
        'EXECUTE'
    ),
    'anonymous users cannot execute the internal reference parser'
);

SELECT ok(
    NOT has_function_privilege(
        'authenticated',
        'private.storage_object_name_from_reference(text,text)',
        'EXECUTE'
    ),
    'authenticated users cannot execute the internal reference parser'
);

SELECT ok(
    NOT has_function_privilege(
        'service_role',
        'private.storage_object_name_from_reference(text,text)',
        'EXECUTE'
    ),
    'service clients cannot execute the internal reference parser'
);

SELECT ok(
    has_function_privilege(
        'authenticated',
        'private.can_access_organization_document(text,text)',
        'EXECUTE'
    ),
    'authenticated users can execute the document authorization helper'
);

SELECT ok(
    has_function_privilege(
        'service_role',
        'private.can_access_organization_document(text,text)',
        'EXECUTE'
    ),
    'service clients can execute the document authorization helper'
);

SELECT ok(
    NOT has_function_privilege(
        'anon',
        'private.can_access_organization_document(text,text)',
        'EXECUTE'
    ),
    'anonymous users cannot execute the document authorization helper'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_proc AS procedure
        INNER JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'can_access_organization_document'
          AND procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=""']::text[]
    ),
    'the authorization helper is a narrowly scoped definer with an empty search path'
);

SELECT is(
    (
        SELECT jsonb_agg(
            jsonb_build_array(policyname, cmd, roles::text)
            ORDER BY cmd
        )
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE 'Financial documents can be %'
    ),
    jsonb_build_array(
        jsonb_build_array(
            left('Financial documents can be deleted by their active organization owner', 63),
            'DELETE',
            '{authenticated}'
        ),
        jsonb_build_array(
            left('Financial documents can be inserted by active organization members', 63),
            'INSERT',
            '{authenticated}'
        ),
        jsonb_build_array(
            left('Financial documents can be selected by active organization members', 63),
            'SELECT',
            '{authenticated}'
        ),
        jsonb_build_array(
            left('Financial documents can be updated by their active organization owner', 63),
            'UPDATE',
            '{authenticated}'
        )
    ),
    'financial Storage uses the exact four authenticated operation-specific policies'
);

INSERT INTO private.organization_document_objects (organization_id, bucket_id, object_name)
VALUES (
    '11111111-1111-4111-8111-111111111111',
    'motto_assets',
    'legacy/supplier-receipt.pdf'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT ok(
    private.can_access_organization_document(
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/file.pdf'
    ),
    'an active member can read an organization-scoped document'
);

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

SELECT ok(
    NOT private.can_access_organization_document(
        'motto_assets',
        '33333333-3333-4333-8333-333333333333/supplier-receipt/file.pdf'
    ),
    'an active user cannot read a document outside their organizations'
);

SELECT set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);

SELECT ok(
    NOT private.can_access_organization_document(
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/file.pdf'
    ),
    'a suspended member cannot read an organization document'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

SELECT ok(
    NOT private.can_access_organization_document(
        'motto_assets',
        'not-an-organization/supplier-receipt/file.pdf'
    ),
    'an unmapped path without a valid organization UUID is denied'
);

SELECT ok(
    private.can_access_organization_document(
        'motto_assets',
        'legacy/supplier-receipt.pdf'
    ),
    'an active member can read a mapped legacy document'
);

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);

SELECT ok(
    NOT private.can_access_organization_document(
        'motto_assets',
        'legacy/supplier-receipt.pdf'
    ),
    'a user outside the mapped legacy organization is denied'
);

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);

SELECT ok(
    NOT private.can_access_organization_document(
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/file.pdf'
    ),
    'an unauthenticated request cannot read an organization document'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
    $$
    INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '{"state":"inserted"}'::jsonb
    )
    $$,
    'an active member can insert an allowed organization-scoped financial document'
);

SELECT throws_ok(
    $$
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES (
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/unsafe.svg',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    $$,
    '42501',
    'new row violates row-level security policy for table "objects"',
    'the insert policy rejects extensions outside the bucket allowlist'
);

SELECT throws_ok(
    $$
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES (
        'motto_assets',
        '22222222-2222-4222-8222-222222222222/supplier-receipt/cross-tenant.pdf',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    $$,
    '42501',
    'new row violates row-level security policy for table "objects"',
    'the insert policy rejects a path for another organization'
);

SELECT lives_ok(
    $$
    INSERT INTO storage.objects (bucket_id, name, owner_id)
    VALUES (
        'receipts',
        '11111111-1111-4111-8111-111111111111/z-report/report.xlsx',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
    $$,
    'the receipts insert policy accepts its additional spreadsheet extension'
);

SELECT is(
    (SELECT count(*)::integer FROM storage.objects WHERE bucket_id IN ('motto_assets', 'receipts')),
    2,
    'the select policy exposes the active organization financial documents'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
SET LOCAL ROLE authenticated;

SELECT is(
    (SELECT count(*)::integer FROM storage.objects WHERE bucket_id IN ('motto_assets', 'receipts')),
    0,
    'the select policy hides another organization financial documents'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
    $$
    UPDATE storage.objects
    SET metadata = '{"state":"owner-updated"}'::jsonb
    WHERE bucket_id = 'motto_assets'
      AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf'
    $$,
    'the active object owner can update an allowed financial document'
);

RESET ROLE;

SELECT is(
    (
        SELECT metadata->>'state'
        FROM storage.objects
        WHERE bucket_id = 'motto_assets'
          AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf'
    ),
    'owner-updated',
    'the owner update policy changes the stored object metadata'
);

SELECT set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
SET LOCAL ROLE authenticated;

UPDATE storage.objects
SET metadata = '{"state":"non-owner-updated"}'::jsonb
WHERE bucket_id = 'motto_assets'
  AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf';

RESET ROLE;

SELECT is(
    (
        SELECT metadata->>'state'
        FROM storage.objects
        WHERE bucket_id = 'motto_assets'
          AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf'
    ),
    'owner-updated',
    'an active non-owner cannot update another member financial document'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
SET LOCAL session_replication_role = replica;
SET LOCAL ROLE authenticated;

SELECT lives_ok(
    $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'motto_assets'
      AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf'
    $$,
    'the active object owner can delete their financial document'
);

RESET ROLE;
SET LOCAL session_replication_role = origin;

SELECT is(
    (
        SELECT count(*)::integer
        FROM storage.objects
        WHERE bucket_id = 'motto_assets'
          AND name = '11111111-1111-4111-8111-111111111111/supplier-receipt/owner.pdf'
    ),
    0,
    'the owner delete policy removes the financial document object'
);

SELECT * FROM finish();
ROLLBACK;

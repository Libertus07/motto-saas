BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(34);

INSERT INTO auth.users (id, email)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'owner-a@example.test'),
    ('b1000000-0000-4000-8000-000000000002', 'owner-b@example.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    ('a2000000-0000-4000-8000-000000000001', 'Helper Org A', 'helper-org-a', 'a1000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000002', 'Helper Org B', 'helper-org-b', 'b1000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, active_organization_id)
VALUES
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
    ('b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO UPDATE
SET active_organization_id = EXCLUDED.active_organization_id;

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'active'),
    ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status;

SELECT has_function('private', 'current_organization_id', ARRAY[]::text[], 'private current organization helper exists');
SELECT has_function('private', 'active_organization_ids', ARRAY[]::text[], 'private active organizations helper exists');
SELECT has_function('private', 'current_user_organization_role', ARRAY['uuid'], 'private role helper exists');
SELECT has_function('private', 'is_current_user_organization_member', ARRAY['uuid'], 'private membership helper exists');
SELECT has_function('private', 'current_user_has_organization_role', ARRAY['uuid', 'text[]'], 'private role allowlist helper exists');

SELECT results_eq(
    $$
        SELECT procedure.proname::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname IN (
              'current_organization_id',
              'active_organization_ids',
              'current_user_organization_role',
              'is_current_user_organization_member',
              'current_user_has_organization_role'
          )
          AND procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=""']::text[]
        ORDER BY procedure.proname
    $$,
    $$ VALUES
        ('active_organization_ids'::text),
        ('current_organization_id'::text),
        ('current_user_has_organization_role'::text),
        ('current_user_organization_role'::text),
        ('is_current_user_organization_member'::text)
    $$,
    'all private helpers are fixed-path definers'
);

SELECT results_eq(
    $$
        SELECT procedure.oid::regprocedure::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.oid::regprocedure::text IN (
              'current_organization_id()',
              'get_user_organizations()',
              'get_user_org_role(uuid)',
              'is_organization_member(uuid,uuid)',
              'has_organization_role(uuid,text[],uuid)'
          )
          AND NOT procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=""']::text[]
        ORDER BY 1
    $$,
    $$ VALUES
        ('current_organization_id()'::text),
        ('get_user_org_role(uuid)'::text),
        ('get_user_organizations()'::text),
        ('has_organization_role(uuid,text[],uuid)'::text),
        ('is_organization_member(uuid,uuid)'::text)
    $$,
    'all public compatibility helpers are fixed-path invokers'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_organization_id'
          AND NOT EXISTS (
              SELECT 1
              FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
          )
    ),
    'PUBLIC cannot execute private current organization helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'active_organization_ids'
          AND NOT EXISTS (
              SELECT 1
              FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
          )
    ),
    'PUBLIC cannot execute private active organizations helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_user_organization_role'
          AND NOT EXISTS (
              SELECT 1
              FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
          )
    ),
    'PUBLIC cannot execute private role helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'is_current_user_organization_member'
          AND NOT EXISTS (
              SELECT 1
              FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
          )
    ),
    'PUBLIC cannot execute private membership helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_user_has_organization_role'
          AND NOT EXISTS (
              SELECT 1
              FROM aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
              WHERE acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
          )
    ),
    'PUBLIC cannot execute private role allowlist helper'
);

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_organization_id'
          AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    'anon cannot execute private current organization helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'active_organization_ids'
          AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    'anon cannot execute private active organizations helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_user_organization_role'
          AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    'anon cannot execute private role helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'is_current_user_organization_member'
          AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    'anon cannot execute private membership helper'
);
SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'current_user_has_organization_role'
          AND NOT has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    'anon cannot execute private role allowlist helper'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        WHERE procedure.oid IN (
            'public.current_organization_id()'::regprocedure,
            'public.get_user_organizations()'::regprocedure,
            'public.get_user_org_role(uuid)'::regprocedure,
            'public.is_organization_member(uuid,uuid)'::regprocedure,
            'public.has_organization_role(uuid,text[],uuid)'::regprocedure
        )
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ),
    0,
    'PUBLIC cannot execute public compatibility helpers'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid IN (
            'public.current_organization_id()'::regprocedure,
            'public.get_user_organizations()'::regprocedure,
            'public.get_user_org_role(uuid)'::regprocedure,
            'public.is_organization_member(uuid,uuid)'::regprocedure,
            'public.has_organization_role(uuid,text[],uuid)'::regprocedure
        )
          AND has_function_privilege('anon', procedure.oid, 'EXECUTE')
    ),
    0,
    'anon cannot execute public compatibility helpers'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        WHERE procedure.oid = 'private.get_user_organizations()'::regprocedure
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ),
    0,
    'PUBLIC cannot execute legacy private helper'
);
SELECT ok(NOT has_function_privilege('anon', 'private.get_user_organizations()', 'EXECUTE'), 'anon cannot execute legacy private helper');
SELECT ok(NOT has_function_privilege('authenticated', 'private.get_user_organizations()', 'EXECUTE'), 'legacy private helper is revoked from authenticated');
SELECT ok(NOT has_function_privilege('service_role', 'private.get_user_organizations()', 'EXECUTE'), 'legacy private helper is revoked from service role');

SELECT ok(NOT has_function_privilege('anon', 'public.get_users_info(uuid[])', 'EXECUTE'), 'anon cannot execute unused directory RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_users_info(uuid[])', 'EXECUTE'), 'unused directory RPC is revoked from authenticated');
SELECT ok(has_function_privilege('service_role', 'public.get_users_info(uuid[])', 'EXECUTE'), 'service role retains the reviewed directory RPC');
SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        WHERE procedure.oid = 'public.get_users_info(uuid[])'::regprocedure
          AND acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
    ),
    0,
    'PUBLIC cannot execute unused directory RPC'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS acl
        WHERE namespace.nspname = 'private'
          AND acl.grantee = 0
          AND acl.privilege_type = 'USAGE'
    ),
    0,
    'PUBLIC cannot use private schema'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

SELECT is(public.current_organization_id(), 'a2000000-0000-4000-8000-000000000001'::uuid, 'wrapper resolves selected active organization');
SELECT results_eq(
    $$ SELECT * FROM public.get_user_organizations() ORDER BY 1 $$,
    $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid) $$,
    'wrapper returns caller active organizations only'
);
SELECT is(public.get_user_org_role('a2000000-0000-4000-8000-000000000001'), 'owner', 'wrapper returns caller role');
SELECT is(public.is_organization_member('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'), false, 'legacy membership wrapper rejects another user id');
SELECT is(public.has_organization_role('a2000000-0000-4000-8000-000000000001', ARRAY['owner'], 'b1000000-0000-4000-8000-000000000002'), false, 'legacy role wrapper rejects another user id');

RESET ROLE;

UPDATE public.organization_members
SET status = 'suspended'
WHERE organization_id = 'a2000000-0000-4000-8000-000000000001'
  AND user_id = 'a1000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT is(public.current_organization_id(), NULL::uuid, 'suspended membership cannot resolve tenant context');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

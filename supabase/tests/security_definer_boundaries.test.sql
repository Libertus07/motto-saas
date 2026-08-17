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
    ('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002', 'owner', 'active'),
    ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status;

SELECT is(to_regprocedure('private.current_organization_id()')::text, 'private.current_organization_id()', 'private current organization helper has its exact signature');
SELECT is(to_regprocedure('private.active_organization_ids()')::text, 'private.active_organization_ids()', 'private active organizations helper has its exact signature');
SELECT is(to_regprocedure('private.current_user_organization_role(uuid)')::text, 'private.current_user_organization_role(uuid)', 'private role helper has its exact signature');
SELECT is(to_regprocedure('private.is_current_user_organization_member(uuid)')::text, 'private.is_current_user_organization_member(uuid)', 'private membership helper has its exact signature');
SELECT is(to_regprocedure('private.current_user_has_organization_role(uuid,text[])')::text, 'private.current_user_has_organization_role(uuid,text[])', 'private role allowlist helper has its exact signature');

SELECT results_eq(
    $$
        SELECT procedure.oid::regprocedure::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname IN (
              'active_organization_ids',
              'current_organization_id',
              'current_user_has_organization_role',
              'current_user_organization_role',
              'get_user_organizations',
              'is_current_user_organization_member'
          )
        ORDER BY 1
    $$,
    $$ VALUES
        ('private.active_organization_ids()'::text),
        ('private.current_organization_id()'::text),
        ('private.current_user_has_organization_role(uuid,text[])'::text),
        ('private.current_user_organization_role(uuid)'::text),
        ('private.get_user_organizations()'::text),
        ('private.is_current_user_organization_member(uuid)'::text)
    $$,
    'private helper family has no unexpected overloads'
);

SELECT results_eq(
    $$
        WITH expected(signature) AS (
            VALUES
                ('private.active_organization_ids()'::text),
                ('private.current_organization_id()'::text),
                ('private.current_user_has_organization_role(uuid,text[])'::text),
                ('private.current_user_organization_role(uuid)'::text),
                ('private.is_current_user_organization_member(uuid)'::text)
        )
        SELECT expected.signature
        FROM expected
        INNER JOIN pg_catalog.pg_proc AS procedure
            ON procedure.oid = to_regprocedure(expected.signature)
        WHERE procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=""']::text[]
          AND procedure.proowner = 'postgres'::regrole
        ORDER BY 1
    $$,
    $$ VALUES
        ('private.active_organization_ids()'::text),
        ('private.current_organization_id()'::text),
        ('private.current_user_has_organization_role(uuid,text[])'::text),
        ('private.current_user_organization_role(uuid)'::text),
        ('private.is_current_user_organization_member(uuid)'::text)
    $$,
    'private helpers are exact-OID fixed-path definers owned by postgres'
);

SELECT results_eq(
    $$
        WITH expected(signature) AS (
            VALUES
                ('private.active_organization_ids()'::text),
                ('private.current_organization_id()'::text),
                ('private.current_user_has_organization_role(uuid,text[])'::text),
                ('private.current_user_organization_role(uuid)'::text),
                ('private.is_current_user_organization_member(uuid)'::text)
        )
        SELECT (format(
            '%s|%s|%s|%s|%s|%s',
            expected.signature,
            procedure.proowner::regrole::text,
            grantor.rolname,
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable
        ) COLLATE "default")::text
        FROM expected
        INNER JOIN pg_catalog.pg_proc AS procedure
            ON procedure.oid = to_regprocedure(expected.signature)
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        INNER JOIN pg_catalog.pg_roles AS grantor
            ON grantor.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = acl.grantee
        ORDER BY 1
    $$,
    $$ VALUES
        ('private.active_organization_ids()|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('private.active_organization_ids()|postgres|postgres|postgres|EXECUTE|f'::text),
        ('private.active_organization_ids()|postgres|postgres|service_role|EXECUTE|f'::text),
        ('private.current_organization_id()|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('private.current_organization_id()|postgres|postgres|postgres|EXECUTE|f'::text),
        ('private.current_organization_id()|postgres|postgres|service_role|EXECUTE|f'::text),
        ('private.current_user_has_organization_role(uuid,text[])|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('private.current_user_has_organization_role(uuid,text[])|postgres|postgres|postgres|EXECUTE|f'::text),
        ('private.current_user_has_organization_role(uuid,text[])|postgres|postgres|service_role|EXECUTE|f'::text),
        ('private.current_user_organization_role(uuid)|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('private.current_user_organization_role(uuid)|postgres|postgres|postgres|EXECUTE|f'::text),
        ('private.current_user_organization_role(uuid)|postgres|postgres|service_role|EXECUTE|f'::text),
        ('private.is_current_user_organization_member(uuid)|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('private.is_current_user_organization_member(uuid)|postgres|postgres|postgres|EXECUTE|f'::text),
        ('private.is_current_user_organization_member(uuid)|postgres|postgres|service_role|EXECUTE|f'::text)
    $$,
    'private helper ACLs have only normalized postgres, authenticated, and service role execute entries'
);

SELECT results_eq(
    $$
        SELECT (format(
            '%s|%s|%s|%s|%s|%s',
            procedure.oid::regprocedure::text,
            procedure.proowner::regrole::text,
            grantor.rolname,
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable
        ) COLLATE "default")::text
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        INNER JOIN pg_catalog.pg_roles AS grantor
            ON grantor.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = acl.grantee
        WHERE procedure.oid = to_regprocedure('private.get_user_organizations()')
        ORDER BY 1
    $$,
    $$ VALUES
        ('private.get_user_organizations()|postgres|postgres|postgres|EXECUTE|f'::text)
    $$,
    'legacy private helper has only its owner execute privilege'
);

SELECT results_eq(
    $$
        SELECT procedure.oid::regprocedure::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'private'
          AND procedure.proname = 'get_user_organizations'
        ORDER BY 1
    $$,
    $$ VALUES ('private.get_user_organizations()'::text) $$,
    'legacy private helper has no unexpected overloads'
);

SELECT is(to_regprocedure('public.current_organization_id()')::text, 'current_organization_id()', 'public current organization wrapper has its exact signature');
SELECT is(to_regprocedure('public.get_user_organizations()')::text, 'get_user_organizations()', 'public active organizations wrapper has its exact signature');
SELECT is(to_regprocedure('public.get_user_org_role(uuid)')::text, 'get_user_org_role(uuid)', 'public role wrapper has its exact signature');
SELECT is(to_regprocedure('public.is_organization_member(uuid,uuid)')::text, 'is_organization_member(uuid,uuid)', 'public membership wrapper has its exact signature');
SELECT is(to_regprocedure('public.has_organization_role(uuid,text[],uuid)')::text, 'has_organization_role(uuid,text[],uuid)', 'public role allowlist wrapper has its exact signature');

SELECT results_eq(
    $$
        SELECT procedure.oid::regprocedure::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
              'current_organization_id',
              'get_user_organizations',
              'get_user_org_role',
              'has_organization_role',
              'is_organization_member'
          )
        ORDER BY 1
    $$,
    $$ VALUES
        ('current_organization_id()'::text),
        ('get_user_org_role(uuid)'::text),
        ('get_user_organizations()'::text),
        ('has_organization_role(uuid,text[],uuid)'::text),
        ('is_organization_member(uuid,uuid)'::text)
    $$,
    'public compatibility helper family has no unexpected overloads'
);

SELECT results_eq(
    $$
        WITH expected(signature) AS (
            VALUES
                ('public.current_organization_id()'::text),
                ('public.get_user_organizations()'::text),
                ('public.get_user_org_role(uuid)'::text),
                ('public.has_organization_role(uuid,text[],uuid)'::text),
                ('public.is_organization_member(uuid,uuid)'::text)
        )
        SELECT replace(expected.signature, 'public.', '')
        FROM expected
        INNER JOIN pg_catalog.pg_proc AS procedure
            ON procedure.oid = to_regprocedure(expected.signature)
        WHERE NOT procedure.prosecdef
          AND procedure.proconfig = ARRAY['search_path=""']::text[]
          AND procedure.proowner = 'postgres'::regrole
        ORDER BY 1
    $$,
    $$ VALUES
        ('current_organization_id()'::text),
        ('get_user_org_role(uuid)'::text),
        ('get_user_organizations()'::text),
        ('has_organization_role(uuid,text[],uuid)'::text),
        ('is_organization_member(uuid,uuid)'::text)
    $$,
    'public wrappers are exact-OID fixed-path invokers owned by postgres'
);

SELECT results_eq(
    $$
        WITH expected(signature) AS (
            VALUES
                ('public.current_organization_id()'::text),
                ('public.get_user_organizations()'::text),
                ('public.get_user_org_role(uuid)'::text),
                ('public.has_organization_role(uuid,text[],uuid)'::text),
                ('public.is_organization_member(uuid,uuid)'::text)
        )
        SELECT (format(
            '%s|%s|%s|%s|%s|%s',
            replace(expected.signature, 'public.', ''),
            procedure.proowner::regrole::text,
            grantor.rolname,
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable
        ) COLLATE "default")::text
        FROM expected
        INNER JOIN pg_catalog.pg_proc AS procedure
            ON procedure.oid = to_regprocedure(expected.signature)
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        INNER JOIN pg_catalog.pg_roles AS grantor
            ON grantor.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = acl.grantee
        ORDER BY 1
    $$,
    $$ VALUES
        ('current_organization_id()|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('current_organization_id()|postgres|postgres|postgres|EXECUTE|f'::text),
        ('current_organization_id()|postgres|postgres|service_role|EXECUTE|f'::text),
        ('get_user_org_role(uuid)|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('get_user_org_role(uuid)|postgres|postgres|postgres|EXECUTE|f'::text),
        ('get_user_org_role(uuid)|postgres|postgres|service_role|EXECUTE|f'::text),
        ('get_user_organizations()|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('get_user_organizations()|postgres|postgres|postgres|EXECUTE|f'::text),
        ('get_user_organizations()|postgres|postgres|service_role|EXECUTE|f'::text),
        ('has_organization_role(uuid,text[],uuid)|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('has_organization_role(uuid,text[],uuid)|postgres|postgres|postgres|EXECUTE|f'::text),
        ('has_organization_role(uuid,text[],uuid)|postgres|postgres|service_role|EXECUTE|f'::text),
        ('is_organization_member(uuid,uuid)|postgres|postgres|authenticated|EXECUTE|f'::text),
        ('is_organization_member(uuid,uuid)|postgres|postgres|postgres|EXECUTE|f'::text),
        ('is_organization_member(uuid,uuid)|postgres|postgres|service_role|EXECUTE|f'::text)
    $$,
    'public wrapper ACLs have only normalized postgres, authenticated, and service role execute entries'
);

SELECT is(to_regprocedure('public.get_users_info(uuid[])')::text, 'get_users_info(uuid[])', 'directory RPC has its exact signature');

SELECT results_eq(
    $$
        SELECT procedure.oid::regprocedure::text
        FROM pg_catalog.pg_proc AS procedure
        INNER JOIN pg_catalog.pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname = 'get_users_info'
        ORDER BY 1
    $$,
    $$ VALUES ('get_users_info(uuid[])'::text) $$,
    'directory RPC has no unexpected overloads'
);

SELECT results_eq(
    $$
        SELECT (format(
            '%s|%s|%s|%s|%s|%s|%s',
            procedure.oid::regprocedure::text,
            procedure.prosecdef,
            array_to_string(procedure.proconfig, ','),
            procedure.proowner::regrole::text,
            grantor.rolname,
            coalesce(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type,
            acl.is_grantable
        ) COLLATE "default")::text
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        INNER JOIN pg_catalog.pg_roles AS grantor
            ON grantor.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = acl.grantee
        WHERE procedure.oid = to_regprocedure('public.get_users_info(uuid[])')
        ORDER BY 1
    $$,
    $$ VALUES
        ('get_users_info(uuid[])|t|search_path=""|postgres|postgres|postgres:EXECUTE|f'::text),
        ('get_users_info(uuid[])|t|search_path=""|postgres|postgres|service_role:EXECUTE|f'::text)
    $$,
    'directory RPC remains a fixed-path postgres definer executable only by service role'
);

SELECT is(
    (
        SELECT acl.is_grantable
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) AS acl
        WHERE procedure.oid = to_regprocedure('public.get_users_info(uuid[])')
          AND acl.grantee = 'service_role'::regrole::oid
          AND acl.privilege_type = 'EXECUTE'
    ),
    false,
    'service role cannot delegate directory RPC execution'
);

SELECT results_eq(
    $$
        SELECT (format(
            '%s|%s|%s|%s|%s',
            namespace.nspowner::regrole::text,
            grantor.rolname,
            coalesce(grantee.rolname, 'PUBLIC'),
            acl.privilege_type,
            acl.is_grantable
        ) COLLATE "default")::text
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS acl
        INNER JOIN pg_catalog.pg_roles AS grantor
            ON grantor.oid = acl.grantor
        LEFT JOIN pg_catalog.pg_roles AS grantee
            ON grantee.oid = acl.grantee
        WHERE namespace.nspname = 'private'
        ORDER BY 1
    $$,
    $$ VALUES
        ('postgres|postgres|authenticated|USAGE|f'::text),
        ('postgres|postgres|postgres|CREATE|f'::text),
        ('postgres|postgres|postgres|USAGE|f'::text),
        ('postgres|postgres|service_role|USAGE|f'::text)
    $$,
    'private schema ACL has only normalized owner, authenticated, and service role entries'
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

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_catalog.pg_namespace AS namespace
        CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) AS acl
        WHERE namespace.nspname = 'private'
          AND acl.grantee = 'anon'::regrole::oid
          AND acl.privilege_type = 'USAGE'
    ),
    0,
    'anon cannot use private schema'
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
SELECT is(public.is_organization_member('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'), true, 'membership wrapper accepts the caller own qualifying identity');
SELECT is(public.has_organization_role('a2000000-0000-4000-8000-000000000001', ARRAY['owner'], 'a1000000-0000-4000-8000-000000000001'), true, 'role wrapper accepts the caller own qualifying identity');
SELECT is(public.is_organization_member('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'), false, 'membership wrapper rejects another qualifying user identity');
SELECT is(public.has_organization_role('a2000000-0000-4000-8000-000000000001', ARRAY['owner'], 'b1000000-0000-4000-8000-000000000002'), false, 'role wrapper rejects another qualifying user identity');

RESET ROLE;

UPDATE public.organization_members
SET status = 'suspended'
WHERE organization_id = 'a2000000-0000-4000-8000-000000000001'
  AND user_id = 'a1000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
SELECT is(public.current_organization_id(), NULL::uuid, 'suspended membership cannot resolve tenant context');
SELECT results_eq(
    $$ SELECT * FROM public.get_user_organizations() ORDER BY 1 $$,
    $$ SELECT NULL::uuid WHERE false $$,
    'suspended membership cannot resolve an active organization list'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

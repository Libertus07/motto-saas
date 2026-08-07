BEGIN;

SELECT plan(10);

SELECT has_function(
    'public',
    'set_active_organization',
    ARRAY['uuid'],
    'active organization selection RPC exists'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.set_active_organization(uuid)', 'EXECUTE'),
    'anonymous users cannot select an active organization'
);

SELECT ok(
    has_function_privilege('authenticated', 'public.set_active_organization(uuid)', 'EXECUTE'),
    'authenticated users can execute the active organization selector'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'active-organization-test@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        'a2222222-2222-2222-2222-222222222222',
        'Active Organization Primary',
        'active-organization-primary',
        'a1111111-1111-1111-1111-111111111111'
    ),
    (
        'a3333333-3333-3333-3333-333333333333',
        'Active Organization Secondary',
        'active-organization-secondary',
        'a1111111-1111-1111-1111-111111111111'
    ),
    (
        'a4444444-4444-4444-4444-444444444444',
        'Active Organization Forbidden',
        'active-organization-forbidden',
        'a1111111-1111-1111-1111-111111111111'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    (
        'a2222222-2222-2222-2222-222222222222',
        'a1111111-1111-1111-1111-111111111111',
        'owner',
        'active'
    ),
    (
        'a3333333-3333-3333-3333-333333333333',
        'a1111111-1111-1111-1111-111111111111',
        'admin',
        'active'
    );

INSERT INTO public.profiles (id, active_organization_id)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222'
)
ON CONFLICT (id)
DO UPDATE SET active_organization_id = EXCLUDED.active_organization_id;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$SELECT public.set_active_organization('a3333333-3333-3333-3333-333333333333')$$,
    'a user can select an organization with an active membership'
);

SELECT is(
    public.current_organization_id(),
    'a3333333-3333-3333-3333-333333333333'::uuid,
    'database tenant context follows the selected organization'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE module = 'Organizasyon'
          AND action_type = 'GUNCELLEME'
          AND user_id = 'a1111111-1111-1111-1111-111111111111'
          AND organization_id = 'a3333333-3333-3333-3333-333333333333'
    ),
    1,
    'organization selection writes a tenant-scoped audit record'
);

SET LOCAL ROLE authenticated;

SELECT lives_ok(
    $$SELECT public.set_active_organization('a3333333-3333-3333-3333-333333333333')$$,
    'selecting the current organization is idempotent'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE module = 'Organizasyon'
          AND user_id = 'a1111111-1111-1111-1111-111111111111'
    ),
    1,
    'idempotent selection does not create duplicate audit records'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
    $$SELECT public.set_active_organization('a4444444-4444-4444-4444-444444444444')$$,
    '42501',
    'Bu organizasyonu seçme yetkiniz yok.',
    'a user cannot select an organization without active membership'
);

RESET ROLE;

SELECT is(
    (
        SELECT active_organization_id
        FROM public.profiles
        WHERE id = 'a1111111-1111-1111-1111-111111111111'
    ),
    'a3333333-3333-3333-3333-333333333333'::uuid,
    'a rejected selection cannot change the profile tenant context'
);

SELECT * FROM finish();
ROLLBACK;

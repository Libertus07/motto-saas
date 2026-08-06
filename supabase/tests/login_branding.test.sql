BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
    ('a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'brand-owner@example.com', now(), now()),
    ('a2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'brand-staff@example.com', now(), now());

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES (
    'b1111111-1111-1111-1111-111111111111',
    'Public Brand Name',
    'public-brand-test',
    'a1111111-1111-1111-1111-111111111111'
);

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    ('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'owner', 'active'),
    ('b1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'staff', 'active');

INSERT INTO public.settings (organization_id, key, value, user_id)
VALUES
    ('b1111111-1111-1111-1111-111111111111', 'business_name', '"Public Test Cafe"'::jsonb, 'a1111111-1111-1111-1111-111111111111'),
    ('b1111111-1111-1111-1111-111111111111', 'business_logo', '"https://example.test/logo.png"'::jsonb, 'a1111111-1111-1111-1111-111111111111');

SELECT ok(
    has_function_privilege('anon', 'public.get_public_login_branding(text)', 'EXECUTE'),
    'anonymous login clients can execute the narrow public branding function'
);

SET LOCAL ROLE anon;

SELECT is(
    (SELECT business_name FROM public.get_public_login_branding('public-brand-test')),
    'Public Test Cafe',
    'the public function returns the organization display name'
);

SELECT is(
    (SELECT count(*)::integer FROM public.get_public_login_branding('unknown-brand')),
    0,
    'an unknown organization slug returns no row'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.settings $$,
    '42501',
    'permission denied for table settings',
    'anonymous clients are denied access to the underlying settings table'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE 'Organization branding owners can %'
    ),
    4,
    'branding storage has operation-specific owner and admin policies'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT throws_ok(
    $$
    UPDATE public.settings
    SET value = '"staff-overwrite"'::jsonb
    WHERE organization_id = 'b1111111-1111-1111-1111-111111111111'
      AND key = 'business_logo'
    $$,
    '42501',
    'new row violates row-level security policy for table "settings"',
    'staff members cannot overwrite public login branding'
);

SELECT * FROM finish();
ROLLBACK;

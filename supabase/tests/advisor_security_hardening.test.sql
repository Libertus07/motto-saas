BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
    (
        'b1111111-1111-1111-1111-111111111111',
        'authenticated',
        'authenticated',
        'advisor-owner@example.com',
        now(),
        now()
    ),
    (
        'b2222222-2222-2222-2222-222222222222',
        'authenticated',
        'authenticated',
        'advisor-outsider@example.com',
        now(),
        now()
    );

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        'b3333333-3333-3333-3333-333333333333',
        'Advisor Primary',
        'advisor-primary',
        'b1111111-1111-1111-1111-111111111111'
    ),
    (
        'b4444444-4444-4444-4444-444444444444',
        'Advisor Active',
        'advisor-active',
        'b1111111-1111-1111-1111-111111111111'
    ),
    (
        'b5555555-5555-5555-5555-555555555555',
        'Advisor Outsider',
        'advisor-outsider',
        'b2222222-2222-2222-2222-222222222222'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    (
        'b3333333-3333-3333-3333-333333333333',
        'b1111111-1111-1111-1111-111111111111',
        'owner',
        'active'
    ),
    (
        'b4444444-4444-4444-4444-444444444444',
        'b1111111-1111-1111-1111-111111111111',
        'admin',
        'active'
    ),
    (
        'b5555555-5555-5555-5555-555555555555',
        'b2222222-2222-2222-2222-222222222222',
        'owner',
        'active'
    );

INSERT INTO public.profiles (id, active_organization_id)
VALUES
    (
        'b1111111-1111-1111-1111-111111111111',
        'b4444444-4444-4444-4444-444444444444'
    ),
    (
        'b2222222-2222-2222-2222-222222222222',
        'b5555555-5555-5555-5555-555555555555'
    )
ON CONFLICT (id)
DO UPDATE SET active_organization_id = EXCLUDED.active_organization_id;

INSERT INTO public.products (
    id,
    name,
    category,
    sale_price,
    estimated_monthly_sales,
    user_id,
    organization_id
)
VALUES
    (
        'b6666666-6666-6666-6666-666666666666',
        'Inactive Context Product',
        'Test',
        100,
        1,
        'b1111111-1111-1111-1111-111111111111',
        'b3333333-3333-3333-3333-333333333333'
    ),
    (
        'b7777777-7777-7777-7777-777777777777',
        'Active Context Product',
        'Test',
        200,
        1,
        'b1111111-1111-1111-1111-111111111111',
        'b4444444-4444-4444-4444-444444444444'
    );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    (public.get_dashboard_stats(30, 35)->>'totalProducts')::integer,
    1,
    'dashboard statistics include only the selected active organization'
);

SELECT throws_ok(
    $$
        SELECT public.get_users_info(
            ARRAY['b2222222-2222-2222-2222-222222222222'::uuid]
        )
    $$,
    '42501',
    'permission denied for function get_users_info',
    'authenticated users cannot execute the directory RPC'
);

SELECT ok(
    has_function_privilege('service_role', 'public.get_users_info(uuid[])', 'EXECUTE'),
    'service role retains directory RPC execution'
);

SELECT ok(
    NOT public.is_organization_member(
        'b5555555-5555-5555-5555-555555555555',
        'b2222222-2222-2222-2222-222222222222'
    ),
    'membership helper cannot be used to inspect another user'
);

SELECT ok(
    NOT public.has_organization_role(
        'b5555555-5555-5555-5555-555555555555',
        ARRAY['owner'],
        'b2222222-2222-2222-2222-222222222222'
    ),
    'role helper cannot be used to inspect another user'
);

SELECT ok(public.check_ai_quota(), 'AI quota accepts the selected organization first request');

RESET ROLE;

SELECT is(
    (SELECT count(*)::integer FROM public.ai_usage_logs WHERE organization_id = 'b4444444-4444-4444-4444-444444444444'),
    1,
    'AI quota is charged to the selected active organization'
);

SELECT ok(
    NOT has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
    'authenticated users cannot execute the RLS event trigger function'
);

SELECT ok(
    NOT has_function_privilege('authenticated', 'public.set_default_organization()', 'EXECUTE'),
    'authenticated users cannot execute the tenant default trigger function'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname IN (
              'Giris Yapanlar Yukleyebilir',
              'Sahibi Guncelleyebilir',
              'Sahibi Silebilir',
              'Allow Uploads 1lnm9mj_0',
              'Allow Uploads 1lnm9mj_1',
              'Public Okuma Izinleri'
          )
    ),
    0,
    'financial document buckets remove every known broad legacy policy while tenant-scoped policies remain'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;

SELECT plan(9);

SELECT ok(
    NOT has_function_privilege('anon', 'public.apply_stock_count(jsonb)', 'EXECUTE'),
    'anonymous users cannot execute stock counts'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.process_receipt_upload(json)', 'EXECUTE'),
    'anonymous users cannot execute receipt uploads'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.process_investment_rent(uuid,uuid,numeric,uuid)', 'EXECUTE'),
    'anonymous users cannot execute rent collection'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    '81111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'rpc-hardening-test@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        '82222222-2222-2222-2222-222222222222',
        'RPC Hardening Test',
        'rpc-hardening-test',
        '81111111-1111-1111-1111-111111111111'
    ),
    (
        '83333333-3333-3333-3333-333333333333',
        'RPC Hardening Other',
        'rpc-hardening-other',
        '81111111-1111-1111-1111-111111111111'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (
    '82222222-2222-2222-2222-222222222222',
    '81111111-1111-1111-1111-111111111111',
    'owner',
    'active'
);

INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES (
    '84444444-4444-4444-4444-444444444444',
    'Test Kasa',
    'cash',
    100,
    '82222222-2222-2222-2222-222222222222'
);

INSERT INTO public.investments (id, asset_type, name, organization_id)
VALUES (
    '85555555-5555-5555-5555-555555555555',
    'real_estate',
    'Test Dükkanı',
    '82222222-2222-2222-2222-222222222222'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '81111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$
    SELECT public.process_investment_rent(
        '85555555-5555-5555-5555-555555555555',
        '84444444-4444-4444-4444-444444444444',
        50,
        '82222222-2222-2222-2222-222222222222'
    )
    $$,
    'rent collection uses the tenant-scoped four-argument signature'
);

SELECT is(
    (SELECT balance FROM public.accounts WHERE id = '84444444-4444-4444-4444-444444444444'),
    150::numeric,
    'rent collection updates the account balance'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.account_movements
        WHERE source_id = '85555555-5555-5555-5555-555555555555'
          AND organization_id = '82222222-2222-2222-2222-222222222222'
    ),
    1,
    'rent collection writes an organization-scoped account movement'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.investment_transactions
        WHERE investment_id = '85555555-5555-5555-5555-555555555555'
          AND organization_id = '82222222-2222-2222-2222-222222222222'
    ),
    1,
    'rent collection writes an organization-scoped investment transaction'
);

SELECT throws_ok(
    $$
    SELECT public.process_investment_rent(
        '85555555-5555-5555-5555-555555555555',
        '84444444-4444-4444-4444-444444444444',
        50,
        '83333333-3333-3333-3333-333333333333'
    )
    $$,
    '42501',
    'Bu organizasyonda işlem yetkiniz yok.',
    'rent collection rejects another organization'
);

SELECT throws_ok(
    $$
    SELECT public.process_investment_rent(
        '85555555-5555-5555-5555-555555555555',
        '84444444-4444-4444-4444-444444444444',
        0,
        '82222222-2222-2222-2222-222222222222'
    )
    $$,
    '22023',
    'Kira tutarı sıfırdan büyük olmalıdır.',
    'rent collection rejects invalid amounts'
);

SELECT * FROM finish();
ROLLBACK;

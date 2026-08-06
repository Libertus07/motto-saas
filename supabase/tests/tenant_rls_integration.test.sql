BEGIN;

SELECT plan(7);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    '91111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'tenant-rls-test@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        '92222222-2222-2222-2222-222222222222',
        'Tenant RLS Primary',
        'tenant-rls-primary',
        '91111111-1111-1111-1111-111111111111'
    ),
    (
        '93333333-3333-3333-3333-333333333333',
        'Tenant RLS Other',
        'tenant-rls-other',
        '91111111-1111-1111-1111-111111111111'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (
    '92222222-2222-2222-2222-222222222222',
    '91111111-1111-1111-1111-111111111111',
    'owner',
    'active'
);

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
        '94444444-4444-4444-4444-444444444444',
        'Visible Tenant Product',
        'Test',
        100,
        10,
        '91111111-1111-1111-1111-111111111111',
        '92222222-2222-2222-2222-222222222222'
    ),
    (
        '95555555-5555-5555-5555-555555555555',
        'Hidden Tenant Product',
        'Test',
        200,
        20,
        '91111111-1111-1111-1111-111111111111',
        '93333333-3333-3333-3333-333333333333'
    );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.products
        WHERE id = '94444444-4444-4444-4444-444444444444'
    ),
    1,
    'a tenant can read its own product'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.products
        WHERE id = '95555555-5555-5555-5555-555555555555'
    ),
    0,
    'a tenant cannot read another tenant product'
);

SELECT lives_ok(
    $$
    INSERT INTO public.products (
        id,
        name,
        category,
        sale_price,
        estimated_monthly_sales,
        user_id,
        organization_id
    )
    VALUES (
        '96666666-6666-6666-6666-666666666666',
        'Inserted Tenant Product',
        'Test',
        75,
        5,
        '91111111-1111-1111-1111-111111111111',
        '92222222-2222-2222-2222-222222222222'
    )
    $$,
    'a tenant can insert a product into its own organization'
);

SELECT throws_ok(
    $$
    INSERT INTO public.products (
        id,
        name,
        category,
        sale_price,
        estimated_monthly_sales,
        user_id,
        organization_id
    )
    VALUES (
        '97777777-7777-7777-7777-777777777777',
        'Rejected Tenant Product',
        'Test',
        50,
        1,
        '91111111-1111-1111-1111-111111111111',
        '93333333-3333-3333-3333-333333333333'
    )
    $$,
    '42501',
    'new row violates row-level security policy for table "products"',
    'a tenant cannot insert a product into another organization'
);

UPDATE public.products
SET sale_price = 999
WHERE id = '95555555-5555-5555-5555-555555555555';

RESET ROLE;

SELECT is(
    (
        SELECT sale_price
        FROM public.products
        WHERE id = '95555555-5555-5555-5555-555555555555'
    ),
    200::numeric,
    'a tenant cannot update another tenant product'
);

SET LOCAL ROLE authenticated;

DELETE FROM public.products
WHERE id = '95555555-5555-5555-5555-555555555555';

RESET ROLE;

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.products
        WHERE id = '95555555-5555-5555-5555-555555555555'
    ),
    1,
    'a tenant cannot delete another tenant product'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
    $$
    UPDATE public.products
    SET organization_id = '93333333-3333-3333-3333-333333333333'
    WHERE id = '94444444-4444-4444-4444-444444444444'
    $$,
    'P0001',
    'organization_id cannot be changed on public.products.',
    'tenant immutability prevents moving a product into another organization'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;

SELECT plan(12);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'product-rpc-test@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        '22222222-2222-2222-2222-222222222222',
        'Product RPC Test',
        'product-rpc-test',
        '11111111-1111-1111-1111-111111111111'
    ),
    (
        '33333333-3333-3333-3333-333333333333',
        'Other Organization',
        'product-rpc-other',
        '11111111-1111-1111-1111-111111111111'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'owner',
    'active'
);

INSERT INTO public.materials (id, name, unit, price_per_unit, user_id, organization_id)
VALUES (
    '44444444-4444-4444-4444-444444444444',
    'Test Kahvesi',
    'g',
    0.50,
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
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
        '55555555-5555-5555-5555-555555555555',
        'Test Latte',
        'Sıcak Kahveler',
        100,
        10,
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
    ),
    (
        '66666666-6666-6666-6666-666666666666',
        'Silinecek Ürün',
        'Diğer',
        25,
        2,
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
    );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$
    SELECT public.save_product_with_recipe(
        '22222222-2222-2222-2222-222222222222',
        '55555555-5555-5555-5555-555555555555',
        'Test Latte',
        'Sıcak Kahveler',
        110,
        12,
        '[{"type":"material","item_id":"44444444-4444-4444-4444-444444444444","quantity":18}]'::jsonb,
        '{"detay":"RPC test güncellemesi"}'::jsonb
    )
    $$,
    'product and recipe are saved in one RPC'
);

SELECT is(
    (SELECT sale_price FROM public.products WHERE id = '55555555-5555-5555-5555-555555555555'),
    110::numeric,
    'product price is updated'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.product_ingredients
        WHERE product_id = '55555555-5555-5555-5555-555555555555'
    ),
    1,
    'recipe ingredient is inserted'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE details->>'productId' = '55555555-5555-5555-5555-555555555555'
          AND action_type = 'GUNCELLEME'
    ),
    1,
    'product save writes its audit log'
);

SELECT lives_ok(
    $$
    SELECT public.bulk_update_products(
        '22222222-2222-2222-2222-222222222222',
        '[{"id":"55555555-5555-5555-5555-555555555555","sale_price":125,"estimated_monthly_sales":15,"category":"Kahveler"}]'::jsonb,
        'Bir ürün topluca güncellendi.',
        '{"kaynak":"pgtap"}'::jsonb
    )
    $$,
    'bulk update succeeds atomically'
);

SELECT is(
    (SELECT sale_price FROM public.products WHERE id = '55555555-5555-5555-5555-555555555555'),
    125::numeric,
    'bulk update changes the product'
);

SELECT throws_ok(
    $$
    SELECT public.bulk_update_products(
        '22222222-2222-2222-2222-222222222222',
        '[{"id":"55555555-5555-5555-5555-555555555555","sale_price":150,"estimated_monthly_sales":20,"category":"Kahveler"},{"id":"77777777-7777-7777-7777-777777777777","sale_price":10,"estimated_monthly_sales":1,"category":"Diğer"}]'::jsonb,
        'Başarısız olması gereken güncelleme.',
        '{}'::jsonb
    )
    $$,
    'P0002',
    'Güncellenecek ürünlerden biri bulunamadı veya başka organizasyona ait.',
    'missing products abort the entire batch'
);

SELECT is(
    (SELECT sale_price FROM public.products WHERE id = '55555555-5555-5555-5555-555555555555'),
    125::numeric,
    'failed batch leaves the existing product unchanged'
);

SELECT lives_ok(
    $$
    SELECT public.delete_product(
        '22222222-2222-2222-2222-222222222222',
        '66666666-6666-6666-6666-666666666666'
    )
    $$,
    'tenant product can be deleted'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.products
        WHERE id = '66666666-6666-6666-6666-666666666666'
    ),
    0,
    'product is deleted'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE details->>'productId' = '66666666-6666-6666-6666-666666666666'
          AND action_type = 'SILME'
    ),
    1,
    'product deletion writes its audit log'
);

SELECT throws_ok(
    $$
    SELECT public.delete_product(
        '33333333-3333-3333-3333-333333333333',
        '55555555-5555-5555-5555-555555555555'
    )
    $$,
    '42501',
    'Bu organizasyonda işlem yetkiniz yok.',
    'a user cannot mutate another organization'
);

SELECT * FROM finish();
ROLLBACK;

BEGIN;

SELECT plan(38);

SELECT ok(
    NOT has_function_privilege(
        'anon',
        'public.buy_investment_transaction(text,text,numeric,numeric,uuid,text,date,text,uuid,uuid)',
        'EXECUTE'
    ),
    'anonymous users cannot execute atomic investment replacement'
);

SELECT ok(
    NOT has_function_privilege('anon', 'public.delete_receipt_transaction(uuid,uuid)', 'EXECUTE'),
    'anonymous users cannot execute legacy receipt deletion'
);

SELECT is(
    (
        SELECT format('%s|%s', prosecdef, array_to_string(proconfig, ','))
        FROM pg_proc
        WHERE oid = 'public.process_receipt_upload(json)'::regprocedure
    ),
    'f|search_path=pg_catalog, public',
    'receipt upload is invoker-rights with a controlled search path'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM pg_proc AS procedure
        INNER JOIN pg_namespace AS namespace
            ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname = 'process_receipt_upload'
    ),
    1,
    'receipt upload exposes exactly one schema-cache-visible signature'
);

SELECT is(
    (
        SELECT format('%s|%s', prosecdef, array_to_string(proconfig, ','))
        FROM pg_proc
        WHERE oid =
            'public.buy_investment_transaction(text,text,numeric,numeric,uuid,text,date,text,uuid,uuid)'::regprocedure
    ),
    'f|search_path=pg_catalog, public',
    'investment replacement is invoker-rights with a controlled search path'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    '91111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'financial-writes@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        '92222222-2222-4222-8222-222222222222',
        'Financial Writes First',
        'financial-writes-first',
        '91111111-1111-4111-8111-111111111111'
    ),
    (
        '93333333-3333-4333-8333-333333333333',
        'Financial Writes Selected',
        'financial-writes-selected',
        '91111111-1111-4111-8111-111111111111'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    (
        '92222222-2222-4222-8222-222222222222',
        '91111111-1111-4111-8111-111111111111',
        'owner',
        'active'
    ),
    (
        '93333333-3333-4333-8333-333333333333',
        '91111111-1111-4111-8111-111111111111',
        'owner',
        'active'
    );

INSERT INTO public.profiles (id, active_organization_id)
VALUES (
    '91111111-1111-4111-8111-111111111111',
    '93333333-3333-4333-8333-333333333333'
)
ON CONFLICT (id) DO UPDATE
SET active_organization_id = EXCLUDED.active_organization_id;

INSERT INTO public.suppliers (id, name, total_debt, user_id, organization_id)
VALUES (
    '94444444-4444-4444-8444-444444444444',
    'Selected Org Supplier',
    25,
    '91111111-1111-4111-8111-111111111111',
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.supplier_transactions (
    id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES (
    '95555555-5555-4555-8555-555555555555',
    '96666666-6666-4666-8666-666666666666',
    '94444444-4444-4444-8444-444444444444',
    CURRENT_DATE,
    25,
    'invoice',
    'Original receipt',
    '91111111-1111-4111-8111-111111111111',
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.materials (
    id, name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
)
VALUES (
    '9eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'Original Material',
    'Test',
    'Adet',
    5,
    10,
    '91111111-1111-4111-8111-111111111111',
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.stock_movements (
    id, batch_id, material_id, supplier_id, movement_type, quantity, unit_price,
    note, user_id, organization_id
)
VALUES (
    '9fffffff-ffff-4fff-8fff-ffffffffffff',
    '96666666-6666-4666-8666-666666666666',
    '9eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '94444444-4444-4444-8444-444444444444',
    'giris',
    2,
    5,
    'Original receipt movement',
    '91111111-1111-4111-8111-111111111111',
    '93333333-3333-4333-8333-333333333333'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'batch_id', '97777777-7777-4777-8777-777777777777',
            'image_url', 'storage://motto_assets/93333333-3333-4333-8333-333333333333/supplier-receipt/97777777-7777-4777-8777-777777777777.json',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object(
                    'name', 'Scoped Material',
                    'category', 'Test',
                    'unit', 'Adet',
                    'quantity', 1,
                    'unitPrice', 2
                )
            )
        )
    )
    $$,
    'receipt upload accepts an explicitly selected active organization'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.stock_movements
        WHERE batch_id = '97777777-7777-4777-8777-777777777777'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'receipt writes are scoped to the explicitly selected organization'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = '93333333-3333-4333-8333-333333333333'
          AND details->>'batch_id' = '97777777-7777-4777-8777-777777777777'
    ),
    1,
    'receipt write creates its audit record in the same transaction'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'replace_batch_id', '96666666-6666-4666-8666-666666666666',
            'batch_id', '98888888-8888-4888-8888-888888888888',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object('name', 'Invalid', 'quantity', 0, 'unitPrice', 1)
            )
        )
    )
    $$,
    '22023',
    'Geçerli malzeme miktarı ve fiyatı gereklidir.',
    'failed receipt replacement raises after its in-transaction delete'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.supplier_transactions
        WHERE batch_id = '96666666-6666-4666-8666-666666666666'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'failed receipt replacement rolls the original receipt back'
);

SELECT is(
    (
        SELECT total_debt
        FROM public.suppliers
        WHERE id = '94444444-4444-4444-8444-444444444444'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    25::numeric,
    'failed receipt replacement rolls the supplier debt back'
);

SELECT is(
    (
        SELECT stock_quantity
        FROM public.materials
        WHERE id = '9eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    10::numeric,
    'failed receipt replacement rolls the material stock back'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.stock_movements
        WHERE id = '9fffffff-ffff-4fff-8fff-ffffffffffff'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'failed receipt replacement rolls the original stock movement back'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '9ccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'batch_id', '9ddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'supplier', NULL,
            'items', json_build_array()
        )
    )
    $$,
    '42501',
    'Bu organizasyonda işlem yetkiniz yok.',
    'receipt upload rejects an organization without active membership'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'batch_id', '90000000-0000-4000-8000-000000000001',
            'image_url', 'https://attacker.example/public-receipt.pdf',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object(
                    'name', 'Invalid Reference Material',
                    'category', 'Test',
                    'unit', 'Adet',
                    'quantity', 1,
                    'unitPrice', 2
                )
            )
        )
    )
    $$,
    '22023',
    'Geçerli bir tedarikçi fişi belge referansı gereklidir.',
    'receipt writes reject a new unscoped document reference'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'batch_id', '90000000-0000-4000-8000-000000000002',
            'image_url', 'storage://motto_assets/92222222-2222-4222-8222-222222222222/supplier-receipt/90000000-0000-4000-8000-000000000002.pdf',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object(
                    'name', 'Cross Tenant Reference Material',
                    'category', 'Test',
                    'unit', 'Adet',
                    'quantity', 1,
                    'unitPrice', 2
                )
            )
        )
    )
    $$,
    '22023',
    'Geçerli bir tedarikçi fişi belge referansı gereklidir.',
    'receipt writes reject a stable reference for another organization'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'batch_id', '90000000-0000-4000-8000-000000000003',
            'image_url', 'storage://receipts/93333333-3333-4333-8333-333333333333/supplier-receipt/90000000-0000-4000-8000-000000000003.pdf',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object(
                    'name', 'Wrong Bucket Reference Material',
                    'category', 'Test',
                    'unit', 'Adet',
                    'quantity', 1,
                    'unitPrice', 2
                )
            )
        )
    )
    $$,
    '22023',
    'Geçerli bir tedarikçi fişi belge referansı gereklidir.',
    'receipt writes reject a stable reference from another bucket'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'batch_id', '90000000-0000-4000-8000-000000000004',
            'image_url', 'storage://motto_assets/93333333-3333-4333-8333-333333333333/investment-document/90000000-0000-4000-8000-000000000004.pdf',
            'supplier', NULL,
            'items', json_build_array(
                json_build_object(
                    'name', 'Wrong Kind Reference Material',
                    'category', 'Test',
                    'unit', 'Adet',
                    'quantity', 1,
                    'unitPrice', 2
                )
            )
        )
    )
    $$,
    '22023',
    'Geçerli bir tedarikçi fişi belge referansı gereklidir.',
    'receipt writes reject a stable reference for another document kind'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'replace_batch_id', '96666666-6666-4666-8666-666666666666',
            'batch_id', '90000000-0000-4000-8000-000000000006',
            'image_url', 'storage://motto_assets/92222222-2222-4222-8222-222222222222/supplier-receipt/90000000-0000-4000-8000-000000000006.pdf',
            'supplier', NULL,
            'items', json_build_array()
        )
    )
    $$,
    '22023',
    'Geçerli bir tedarikçi fişi belge referansı gereklidir.',
    'receipt replacement validates its tenant-scoped document before mutating the original receipt'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'replace_batch_id', '96666666-6666-4666-8666-666666666666',
            'batch_id', '90000000-0000-4000-8000-000000000007',
            'image_url', 'storage://motto_assets/93333333-3333-4333-8333-333333333333/supplier-receipt/90000000-0000-4000-8000-000000000007.pdf',
            'supplier', NULL,
            'items', json_build_array()
        )
    )
    $$,
    '22023',
    'En az bir geçerli malzeme gereklidir.',
    'receipt replacement requires a non-empty valid item list before mutating the original receipt'
);

SELECT throws_ok(
    $$
    SELECT public.process_receipt_upload(
        json_build_object(
            'organization_id', '93333333-3333-4333-8333-333333333333',
            'replace_batch_id', '96666666-6666-4666-8666-666666666666',
            'batch_id', '90000000-0000-4000-8000-000000000008',
            'image_url', 'storage://motto_assets/93333333-3333-4333-8333-333333333333/supplier-receipt/90000000-0000-4000-8000-000000000008.pdf',
            'supplier', NULL
        )
    )
    $$,
    '22023',
    'Geçerli fiş bilgileri gereklidir.',
    'receipt replacement rejects an omitted item list before mutating the original receipt'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.supplier_transactions
        WHERE batch_id = '96666666-6666-4666-8666-666666666666'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'rejected empty receipt replacement preserves the original supplier transaction'
);

SELECT is(
    (
        SELECT total_debt
        FROM public.suppliers
        WHERE id = '94444444-4444-4444-8444-444444444444'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    25::numeric,
    'rejected empty receipt replacement preserves the supplier balance'
);

SELECT is(
    (
        SELECT stock_quantity
        FROM public.materials
        WHERE id = '9eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    10::numeric,
    'rejected empty receipt replacement preserves the material stock balance'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.stock_movements
        WHERE id = '9fffffff-ffff-4fff-8fff-ffffffffffff'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'rejected empty receipt replacement preserves the original stock movement'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = '93333333-3333-4333-8333-333333333333'
          AND details->>'batch_id' IN (
              '90000000-0000-4000-8000-000000000006',
              '90000000-0000-4000-8000-000000000007',
              '90000000-0000-4000-8000-000000000008'
          )
    ),
    0,
    'rejected empty receipt replacement does not create a success audit record'
);

RESET ROLE;

INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES (
    '99999999-9999-4999-8999-999999999999',
    'Investment Test Account',
    'cash',
    900,
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.investments (
    id, asset_type, name, quantity, average_cost, purchase_date, organization_id
)
VALUES (
    '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'gold',
    'Original Gold',
    1,
    100,
    CURRENT_DATE,
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.investment_transactions (
    id, investment_id, transaction_type, quantity, price_per_unit, total_amount,
    account_id, transaction_date, organization_id
)
VALUES (
    '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'buy',
    1,
    100,
    100,
    '99999999-9999-4999-8999-999999999999',
    CURRENT_DATE,
    '93333333-3333-4333-8333-333333333333'
);

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    '99999999-9999-4999-8999-999999999999',
    'cikis',
    100,
    'Original investment',
    'investment',
    '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '93333333-3333-4333-8333-333333333333'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '91111111-1111-4111-8111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT throws_ok(
    $$
    SELECT public.buy_investment_transaction(
        'gold', 'Unscoped Investment', 1, 10,
        '99999999-9999-4999-8999-999999999999',
        NULL, CURRENT_DATE, 'https://attacker.example/investment.pdf',
        '93333333-3333-4333-8333-333333333333'
    )
    $$,
    '22023',
    'Geçerli bir yatırım belge referansı gereklidir.',
    'base investment writes reject a new unscoped document reference'
);

SELECT throws_ok(
    $$
    SELECT public.buy_investment_transaction(
        'gold', 'Unscoped Replacement', 1, 10,
        '99999999-9999-4999-8999-999999999999',
        NULL, CURRENT_DATE, 'https://attacker.example/investment-receipt.pdf',
        '93333333-3333-4333-8333-333333333333',
        NULL
    )
    $$,
    '22023',
    'Geçerli bir yatırım belge referansı gereklidir.',
    'replacement investment writes reject a new unscoped document reference'
);

SELECT throws_ok(
    $$
    SELECT public.update_investment(
        '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '93333333-3333-4333-8333-333333333333',
        'Original Gold', 1, 100, NULL, CURRENT_DATE,
        'https://attacker.example/replacement-document.pdf'
    )
    $$,
    '22023',
    'Geçerli bir yatırım belge referansı gereklidir.',
    'investment updates reject a changed unscoped document reference'
);

SELECT throws_ok(
    $$
    SELECT public.buy_investment_transaction(
        'gold', 'Replacement Gold', 1, 2000,
        '99999999-9999-4999-8999-999999999999',
        NULL, CURRENT_DATE, NULL,
        '93333333-3333-4333-8333-333333333333',
        '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
    $$,
    '22023',
    'Hesap bulunamadı veya bakiyesi yetersiz.',
    'failed investment replacement raises after its in-transaction delete'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.investment_transactions
        WHERE id = '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'failed investment replacement rolls the original transaction back'
);

SELECT is(
    (
        SELECT quantity
        FROM public.investments
        WHERE id = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1::numeric,
    'failed investment replacement rolls the investment aggregate back'
);

SELECT is(
    (
        SELECT balance
        FROM public.accounts
        WHERE id = '99999999-9999-4999-8999-999999999999'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    900::numeric,
    'failed investment replacement rolls the account balance back'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.account_movements
        WHERE source_id = '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    1,
    'failed investment replacement rolls the account movement back'
);

SELECT lives_ok(
    $$
    SELECT public.buy_investment_transaction(
        'gold', 'Replacement Gold', 1, 200,
        '99999999-9999-4999-8999-999999999999',
        NULL, CURRENT_DATE,
        'storage://motto_assets/93333333-3333-4333-8333-333333333333/investment-receipt/90000000-0000-4000-8000-000000000005.pdf',
        '93333333-3333-4333-8333-333333333333',
        '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
    $$,
    'a valid stable reference completes an atomic investment replacement'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.investment_transactions
        WHERE id = '9bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    0,
    'successful replacement removes the original investment transaction'
);

SELECT is(
    (
        SELECT count(*)::integer
        FROM public.investment_transactions
        WHERE organization_id = '93333333-3333-4333-8333-333333333333'
          AND document_url = 'storage://motto_assets/93333333-3333-4333-8333-333333333333/investment-receipt/90000000-0000-4000-8000-000000000005.pdf'
    ),
    1,
    'successful replacement persists the new stable investment receipt reference'
);

SELECT is(
    (
        SELECT balance
        FROM public.accounts
        WHERE id = '99999999-9999-4999-8999-999999999999'
          AND organization_id = '93333333-3333-4333-8333-333333333333'
    ),
    800::numeric,
    'successful replacement refunds the original purchase and charges the replacement atomically'
);

SELECT * FROM finish();
ROLLBACK;

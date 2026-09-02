BEGIN;

SELECT plan(26);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    'e1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'destructive-integrity@example.com',
    now(),
    now()
);

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES (
    'e2000000-0000-4000-8000-000000000001',
    'Destructive integrity org',
    'destructive-integrity-org',
    'e1000000-0000-4000-8000-000000000001'
);

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (
    'e2000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000001',
    'owner',
    'active'
);

INSERT INTO public.profiles (id, active_organization_id)
VALUES (
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
)
ON CONFLICT (id) DO UPDATE
SET active_organization_id = EXCLUDED.active_organization_id;

INSERT INTO public.suppliers (id, name, total_debt, user_id, organization_id)
VALUES
    (
        'e3000000-0000-4000-8000-000000000001',
        'Invoice supplier',
        250,
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e3000000-0000-4000-8000-000000000002',
        'Payment supplier',
        40,
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e3000000-0000-4000-8000-000000000003',
        'Malformed fixture supplier',
        0,
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES
    (
        'e4000000-0000-4000-8000-000000000001',
        'Integrity account one',
        'cash',
        70,
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000002',
        'Integrity account two',
        'bank',
        85,
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000003',
        'Malformed fixture account',
        'cash',
        0,
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000004',
        'Integrity Z account one',
        'cash',
        120,
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000005',
        'Integrity Z account two',
        'bank',
        80,
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.materials (
    id, name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
)
VALUES
    (
        'e6000000-0000-4000-8000-000000000001',
        'Integrity material one',
        'Test',
        'Adet',
        1,
        5,
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e6000000-0000-4000-8000-000000000002',
        'Integrity material two',
        'Test',
        'Adet',
        1,
        6,
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.supplier_transactions (
    id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES
    (
        'e5000000-0000-4000-8000-000000000001',
        'e3000000-0000-4000-8000-000000000001',
        CURRENT_DATE,
        50,
        'invoice',
        'Invoice reversal fixture',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000002',
        'e3000000-0000-4000-8000-000000000002',
        CURRENT_DATE,
        60,
        'payment',
        'Grouped payment reversal fixture',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES
    (
        'e4000000-0000-4000-8000-000000000001',
        'cikis',
        20,
        'Repeated supplier payment one',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000001',
        'cikis',
        10,
        'Repeated supplier payment two',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000002',
        'cikis',
        15,
        'Second account supplier payment',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000002',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, note, user_id, organization_id
)
VALUES
    (
        'e7000000-0000-4000-8000-000000000001',
        'e9000000-0000-4000-8000-000000000001',
        'e6000000-0000-4000-8000-000000000001',
        'cikis',
        2,
        'Repeated material deduction one',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e7000000-0000-4000-8000-000000000002',
        'e9000000-0000-4000-8000-000000000001',
        'e6000000-0000-4000-8000-000000000001',
        'cikis',
        3,
        'Repeated material deduction two',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e7000000-0000-4000-8000-000000000003',
        'e9000000-0000-4000-8000-000000000001',
        'e6000000-0000-4000-8000-000000000002',
        'cikis',
        4,
        'Second material deduction',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.sales (id, quantity, unit_price, total_price, batch_id, organization_id)
VALUES (
    'e8000000-0000-4000-8000-000000000001',
    1,
    50,
    50,
    'e9000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.expenses (id, name, category, amount, batch_id, organization_id)
VALUES (
    'e8000000-0000-4000-8000-000000000002',
    'Integrity expense',
    'Test',
    10,
    'e9000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES
    (
        'e4000000-0000-4000-8000-000000000004',
        'giris',
        50,
        'Repeated Z income',
        'z_report',
        'e9000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000004',
        'cikis',
        30,
        'Mixed Z expense',
        'z_report',
        'e9000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000005',
        'cikis',
        20,
        'Second account Z expense',
        'z_report',
        'e9000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

ALTER TABLE public.supplier_transactions ALTER COLUMN transaction_type DROP NOT NULL;
ALTER TABLE public.stock_movements ALTER COLUMN movement_type DROP NOT NULL;
ALTER TABLE public.account_movements ALTER COLUMN movement_type DROP NOT NULL;

INSERT INTO public.supplier_transactions (
    id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES
    (
        'e5000000-0000-4000-8000-000000000011',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        'credit_note',
        'Unsupported supplier transaction type',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000012',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        NULL,
        'Null supplier transaction type',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000013',
        NULL,
        CURRENT_DATE,
        1,
        'invoice',
        'Null supplier key',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000014',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        'payment',
        'Unsupported supplier movement type',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000015',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        'payment',
        'Null supplier movement type',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000016',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        'payment',
        'Null supplier movement account',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e5000000-0000-4000-8000-000000000018',
        'e3000000-0000-4000-8000-000000000003',
        CURRENT_DATE,
        1,
        'payment',
        'Missing supplier movement account',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES
    (
        'e4000000-0000-4000-8000-000000000003',
        'giris',
        1,
        'Unsupported supplier movement',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000014',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000003',
        NULL,
        1,
        'Null supplier movement type',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000015',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        NULL,
        'cikis',
        1,
        'Null supplier movement account',
        'supplier_payment',
        'e5000000-0000-4000-8000-000000000016',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, note, user_id, organization_id
)
VALUES
    (
        'e7000000-0000-4000-8000-000000000011',
        'e9000000-0000-4000-8000-000000000011',
        'e6000000-0000-4000-8000-000000000001',
        'giris',
        1,
        'Unsupported Z stock movement',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e7000000-0000-4000-8000-000000000012',
        'e9000000-0000-4000-8000-000000000012',
        'e6000000-0000-4000-8000-000000000001',
        NULL,
        1,
        'Null Z stock movement type',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e7000000-0000-4000-8000-000000000013',
        'e9000000-0000-4000-8000-000000000013',
        NULL,
        'cikis',
        1,
        'Null Z material key',
        'e1000000-0000-4000-8000-000000000001',
        'e2000000-0000-4000-8000-000000000001'
    );

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES
    (
        'e4000000-0000-4000-8000-000000000003',
        'transfer',
        1,
        'Unsupported Z account movement',
        'z_report',
        'e9000000-0000-4000-8000-000000000014',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        'e4000000-0000-4000-8000-000000000003',
        NULL,
        1,
        'Null Z account movement type',
        'z_report',
        'e9000000-0000-4000-8000-000000000015',
        'e2000000-0000-4000-8000-000000000001'
    ),
    (
        NULL,
        'giris',
        1,
        'Null Z account key',
        'z_report',
        'e9000000-0000-4000-8000-000000000016',
        'e2000000-0000-4000-8000-000000000001'
    );

SET LOCAL session_replication_role = replica;
INSERT INTO public.supplier_transactions (
    id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES (
    'e5000000-0000-4000-8000-000000000017',
    'ef000000-0000-4000-8000-000000000001',
    CURRENT_DATE,
    1,
    'invoice',
    'Missing supplier parent',
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'ef000000-0000-4000-8000-000000000002',
    'cikis',
    1,
    'Missing supplier account parent',
    'supplier_payment',
    'e5000000-0000-4000-8000-000000000018',
    'e2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, note, user_id, organization_id
)
VALUES (
    'e7000000-0000-4000-8000-000000000017',
    'e9000000-0000-4000-8000-000000000017',
    'ef000000-0000-4000-8000-000000000003',
    'cikis',
    1,
    'Missing Z material parent',
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'ef000000-0000-4000-8000-000000000004',
    'giris',
    1,
    'Missing Z account parent',
    'z_report',
    'e9000000-0000-4000-8000-000000000018',
    'e2000000-0000-4000-8000-000000000001'
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001') $$,
    'invoice deletion completes'
);
SELECT is(
    (SELECT total_debt FROM public.suppliers WHERE id = 'e3000000-0000-4000-8000-000000000001'),
    200::numeric,
    'invoice deletion reverses supplier debt'
);

SELECT lives_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001') $$,
    'multi-account supplier payment deletion completes'
);
SELECT ok(
    (SELECT balance = 100 FROM public.accounts WHERE id = 'e4000000-0000-4000-8000-000000000001')
    AND (SELECT balance = 100 FROM public.accounts WHERE id = 'e4000000-0000-4000-8000-000000000002'),
    'repeated supplier movements are aggregated for every account'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.account_movements
        WHERE source_type = 'supplier_payment'
          AND source_id = 'e5000000-0000-4000-8000-000000000002'
    ),
    0,
    'multi-account supplier movements are deleted'
);

SELECT lives_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001') $$,
    'multi-parent Z deletion completes'
);
SELECT ok(
    (SELECT stock_quantity = 10 FROM public.materials WHERE id = 'e6000000-0000-4000-8000-000000000001')
    AND (SELECT stock_quantity = 10 FROM public.materials WHERE id = 'e6000000-0000-4000-8000-000000000002'),
    'repeated stock movements are aggregated for every material'
);
SELECT ok(
    (SELECT balance = 100 FROM public.accounts WHERE id = 'e4000000-0000-4000-8000-000000000004')
    AND (SELECT balance = 100 FROM public.accounts WHERE id = 'e4000000-0000-4000-8000-000000000005'),
    'mixed giris and cikis movements are reversed for every account'
);
SELECT ok(
    (SELECT count(*) = 0 FROM public.stock_movements WHERE batch_id = 'e9000000-0000-4000-8000-000000000001')
    AND (SELECT count(*) = 0 FROM public.sales WHERE batch_id = 'e9000000-0000-4000-8000-000000000001')
    AND (SELECT count(*) = 0 FROM public.expenses WHERE batch_id = 'e9000000-0000-4000-8000-000000000001')
    AND (
        SELECT count(*) = 0
        FROM public.account_movements
        WHERE source_type = 'z_report'
          AND source_id = 'e9000000-0000-4000-8000-000000000001'
    ),
    'multi-parent Z deletion removes every batch row'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE module = 'Z-Raporu'
          AND action_type = 'SILME'
          AND organization_id = 'e2000000-0000-4000-8000-000000000001'
          AND details @> '{"batch_id":"e9000000-0000-4000-8000-000000000001","stock_movements_deleted":3,"sales_deleted":1,"expenses_deleted":1,"account_movements_deleted":3,"stock_quantity_restored":9,"account_balance_reversed":40}'::jsonb
    ),
    1,
    'multi-parent Z audit records the complete aggregate reversal'
);

SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'unsupported supplier transaction type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null supplier transaction type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000013', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null supplier key is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000014', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'unsupported supplier account movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000015', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null supplier account movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000016', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null supplier account key is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000017', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'missing supplier parent is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('e5000000-0000-4000-8000-000000000018', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'missing supplier account parent is rejected'
);

SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000011', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'unsupported Z stock movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000012', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null Z stock movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000013', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null Z material key is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000014', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'unsupported Z account movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000015', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null Z account movement type is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000016', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'null Z account key is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000017', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'missing Z material parent is rejected'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('e9000000-0000-4000-8000-000000000018', 'e2000000-0000-4000-8000-000000000001') $$,
    '22023', NULL, 'missing Z account parent is rejected'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;

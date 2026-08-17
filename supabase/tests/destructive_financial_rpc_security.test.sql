BEGIN;

SELECT plan(40);

SELECT ok(
    NOT has_function_privilege(
        'anon', 'public.delete_supplier_transaction(uuid,uuid)', 'EXECUTE'
    ),
    'anon cannot delete supplier transaction'
);

SELECT ok(
    NOT has_function_privilege(
        'anon', 'public.delete_z_report_transaction(uuid,uuid)', 'EXECUTE'
    ),
    'anon cannot delete Z report'
);

INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES
    (
        'c1000000-0000-4000-8000-000000000001',
        'authenticated',
        'authenticated',
        'destructive-rpc-org-a@example.com',
        now(),
        now()
    ),
    (
        'd1000000-0000-4000-8000-000000000002',
        'authenticated',
        'authenticated',
        'destructive-rpc-org-b@example.com',
        now(),
        now()
    );

INSERT INTO public.organizations (id, name, slug, created_by)
VALUES
    (
        'c2000000-0000-4000-8000-000000000001',
        'Destructive RPC Org A',
        'destructive-rpc-org-a',
        'c1000000-0000-4000-8000-000000000001'
    ),
    (
        'd2000000-0000-4000-8000-000000000002',
        'Destructive RPC Org B',
        'destructive-rpc-org-b',
        'd1000000-0000-4000-8000-000000000002'
    );

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
    (
        'c2000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001',
        'owner',
        'active'
    ),
    (
        'd2000000-0000-4000-8000-000000000002',
        'd1000000-0000-4000-8000-000000000002',
        'owner',
        'active'
    );

INSERT INTO public.profiles (id, active_organization_id)
VALUES
    (
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001'
    ),
    (
        'd1000000-0000-4000-8000-000000000002',
        'd2000000-0000-4000-8000-000000000002'
    )
ON CONFLICT (id) DO UPDATE
SET active_organization_id = EXCLUDED.active_organization_id;

INSERT INTO public.suppliers (id, name, total_debt, user_id, organization_id)
VALUES (
    'c3000000-0000-4000-8000-000000000001',
    'Org A supplier',
    100,
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES (
    'c4000000-0000-4000-8000-000000000001',
    'Org A cash account',
    'cash',
    75,
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.supplier_transactions (
    id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES (
    'c5000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    CURRENT_DATE,
    25,
    'payment',
    'Initial supplier payment',
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'c4000000-0000-4000-8000-000000000001',
    'cikis',
    25,
    'Initial supplier payment cash movement',
    'supplier_payment',
    'c5000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.materials (
    id, name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
)
VALUES (
    'c6000000-0000-4000-8000-000000000001',
    'Org A Z material',
    'Test',
    'Adet',
    10,
    7,
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, unit_price, note, user_id, organization_id
)
VALUES (
    'c7000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000001',
    'cikis',
    3,
    10,
    'Initial Z stock deduction',
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.sales (id, quantity, unit_price, total_price, batch_id, organization_id)
VALUES (
    'c8000000-0000-4000-8000-000000000001',
    1,
    40,
    40,
    'c9000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.expenses (id, name, category, amount, batch_id, organization_id)
VALUES (
    'c8000000-0000-4000-8000-000000000002',
    'Initial Z expense',
    'Test',
    10,
    'c9000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES (
    'c4000000-0000-4000-8000-000000000002',
    'Org A Z report account',
    'cash',
    130,
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'c4000000-0000-4000-8000-000000000002',
    'giris',
    30,
    'Initial Z report cash movement',
    'z_report',
    'c9000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);

INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
VALUES
    (
        'Tedarikçi',
        'EKLEME',
        'Historical supplier audit',
        jsonb_build_object('transaction_id', 'c5000000-0000-4000-8000-000000000001'),
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001'
    ),
    (
        'Z-Raporu',
        'EKLEME',
        'Historical Z audit',
        jsonb_build_object('batch_id', 'c9000000-0000-4000-8000-000000000001'),
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001'
    );

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501',
    NULL,
    'unauthenticated supplier deletion is denied by ACL'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501',
    'Bu işletmede işlem yetkiniz yok.',
    'cross-tenant supplier deletion is denied'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('c9000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501',
    'Bu işletmede işlem yetkiniz yok.',
    'cross-tenant Z deletion is denied'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('c9000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501',
    NULL,
    'unauthenticated Z deletion is denied by ACL'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT lives_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    'authorized supplier deletion completes'
);
SELECT is(
    (SELECT count(*)::integer FROM public.supplier_transactions WHERE id = 'c5000000-0000-4000-8000-000000000001'),
    0,
    'supplier deletion removes the target transaction'
);
SELECT is(
    (SELECT total_debt FROM public.suppliers WHERE id = 'c3000000-0000-4000-8000-000000000001'),
    125::numeric,
    'supplier deletion restores the payment to supplier debt'
);
SELECT is(
    (SELECT count(*)::integer FROM public.account_movements WHERE source_id = 'c5000000-0000-4000-8000-000000000001'),
    0,
    'supplier deletion removes the payment account movement'
);
SELECT is(
    (SELECT balance FROM public.accounts WHERE id = 'c4000000-0000-4000-8000-000000000001'),
    100::numeric,
    'supplier deletion restores the payment account balance'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND action_type = 'EKLEME'
          AND details->>'transaction_id' = 'c5000000-0000-4000-8000-000000000001'
    ),
    1,
    'supplier deletion preserves the historical audit event'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Tedarikçi'
          AND action_type = 'SILME'
          AND details->>'transaction_id' = 'c5000000-0000-4000-8000-000000000001'
    ),
    1,
    'supplier deletion appends one tenant audit event'
);
SELECT is(
    (
        SELECT details->>'transaction_id'
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Tedarikçi'
          AND action_type = 'SILME'
    ),
    'c5000000-0000-4000-8000-000000000001',
    'supplier deletion audit identifies the deleted transaction'
);
SELECT is(
    (
        SELECT details->>'organization_id'
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Tedarikçi'
          AND action_type = 'SILME'
    ),
    'c2000000-0000-4000-8000-000000000001',
    'supplier deletion audit identifies its organization'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Tedarikçi'
          AND action_type = 'SILME'
          AND details ?& ARRAY['transaction_id', 'organization_id']
    ),
    1,
    'supplier deletion audit has the required immutable identifiers'
);

SELECT lives_ok(
    $$ SELECT public.delete_z_report_transaction('c9000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    'authorized Z deletion completes'
);
SELECT is(
    (SELECT stock_quantity FROM public.materials WHERE id = 'c6000000-0000-4000-8000-000000000001'),
    10::numeric,
    'Z deletion restores material stock'
);
SELECT is(
    (SELECT count(*)::integer FROM public.stock_movements WHERE batch_id = 'c9000000-0000-4000-8000-000000000001'),
    0,
    'Z deletion removes stock movements'
);
SELECT is(
    (SELECT count(*)::integer FROM public.sales WHERE batch_id = 'c9000000-0000-4000-8000-000000000001'),
    0,
    'Z deletion removes sales'
);
SELECT is(
    (SELECT count(*)::integer FROM public.expenses WHERE batch_id = 'c9000000-0000-4000-8000-000000000001'),
    0,
    'Z deletion removes expenses'
);
SELECT is(
    (
        SELECT count(*)::integer FROM public.account_movements
        WHERE source_type = 'z_report' AND source_id = 'c9000000-0000-4000-8000-000000000001'
    ),
    0,
    'Z deletion removes account movements'
);
SELECT is(
    (SELECT balance FROM public.accounts WHERE id = 'c4000000-0000-4000-8000-000000000002'),
    100::numeric,
    'Z deletion reverses the account balance'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND action_type = 'EKLEME'
          AND details->>'batch_id' = 'c9000000-0000-4000-8000-000000000001'
    ),
    1,
    'Z deletion preserves the historical audit event'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Z-Raporu'
          AND action_type = 'SILME'
          AND details->>'batch_id' = 'c9000000-0000-4000-8000-000000000001'
          AND details ?& ARRAY[
              'stock_movements_deleted',
              'sales_deleted',
              'expenses_deleted',
              'account_movements_deleted',
              'stock_quantity_restored',
              'account_balance_reversed'
          ]
    ),
    1,
    'Z deletion appends one complete tenant audit event'
);
SELECT is(
    (
        SELECT details->>'batch_id'
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Z-Raporu'
          AND action_type = 'SILME'
    ),
    'c9000000-0000-4000-8000-000000000001',
    'Z deletion audit identifies the deleted batch'
);
SELECT ok(
    (
        SELECT details->>'stock_movements_deleted' = '1'
           AND details->>'sales_deleted' = '1'
           AND details->>'expenses_deleted' = '1'
           AND details->>'account_movements_deleted' = '1'
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Z-Raporu'
          AND action_type = 'SILME'
    ),
    'Z deletion audit records affected row counts'
);
SELECT ok(
    (
        SELECT details->>'stock_quantity_restored' = '3'
           AND details->>'account_balance_reversed' = '30'
        FROM public.activity_logs
        WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
          AND module = 'Z-Raporu'
          AND action_type = 'SILME'
    ),
    'Z deletion audit records reversal totals'
);

RESET ROLE;

INSERT INTO public.supplier_transactions (
    id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
)
VALUES (
    'c5000000-0000-4000-8000-000000000002',
    'c3000000-0000-4000-8000-000000000001',
    CURRENT_DATE,
    25,
    'payment',
    'Rollback supplier payment',
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);
UPDATE public.suppliers SET total_debt = 100 WHERE id = 'c3000000-0000-4000-8000-000000000001';
UPDATE public.accounts SET balance = 75 WHERE id = 'c4000000-0000-4000-8000-000000000001';
INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'c4000000-0000-4000-8000-000000000001',
    'cikis',
    25,
    'Rollback supplier payment cash movement',
    'supplier_payment',
    'c5000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001'
);

UPDATE public.materials SET stock_quantity = 7 WHERE id = 'c6000000-0000-4000-8000-000000000001';
INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, unit_price, note, user_id, organization_id
)
VALUES (
    'c7000000-0000-4000-8000-000000000002',
    'c9000000-0000-4000-8000-000000000002',
    'c6000000-0000-4000-8000-000000000001',
    'cikis',
    3,
    10,
    'Rollback Z stock deduction',
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.sales (id, quantity, unit_price, total_price, batch_id, organization_id)
VALUES (
    'c8000000-0000-4000-8000-000000000003',
    1,
    40,
    40,
    'c9000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.expenses (id, name, category, amount, batch_id, organization_id)
VALUES (
    'c8000000-0000-4000-8000-000000000004',
    'Rollback Z expense',
    'Test',
    10,
    'c9000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001'
);
UPDATE public.accounts SET balance = 130 WHERE id = 'c4000000-0000-4000-8000-000000000002';
INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'c4000000-0000-4000-8000-000000000002',
    'giris',
    30,
    'Rollback Z report cash movement',
    'z_report',
    'c9000000-0000-4000-8000-000000000002',
    'c2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
VALUES
    (
        'Tedarikçi',
        'EKLEME',
        'Rollback supplier historical audit',
        jsonb_build_object('transaction_id', 'c5000000-0000-4000-8000-000000000002'),
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001'
    ),
    (
        'Z-Raporu',
        'EKLEME',
        'Rollback Z historical audit',
        jsonb_build_object('batch_id', 'c9000000-0000-4000-8000-000000000002'),
        'c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-000000000001'
    );

CREATE OR REPLACE FUNCTION private.test_reject_delete_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF NEW.action_type = 'SILME' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'forced audit failure';
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER test_reject_delete_audit
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION private.test_reject_delete_audit();

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001') $$,
    'P0001',
    'forced audit failure',
    'supplier deletion rolls back when its audit append fails'
);
SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('c9000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000001') $$,
    'P0001',
    'forced audit failure',
    'Z deletion rolls back when its audit append fails'
);
RESET ROLE;

DROP TRIGGER test_reject_delete_audit ON public.activity_logs;
DROP FUNCTION private.test_reject_delete_audit();

SELECT is(
    (SELECT count(*)::integer FROM public.supplier_transactions WHERE id = 'c5000000-0000-4000-8000-000000000002'),
    1,
    'failed supplier deletion preserves the original transaction'
);
SELECT is(
    (SELECT total_debt FROM public.suppliers WHERE id = 'c3000000-0000-4000-8000-000000000001'),
    100::numeric,
    'failed supplier deletion preserves supplier debt'
);
SELECT ok(
    (SELECT balance = 75 FROM public.accounts WHERE id = 'c4000000-0000-4000-8000-000000000001')
    AND (SELECT count(*) = 1 FROM public.account_movements WHERE source_type = 'supplier_payment' AND source_id = 'c5000000-0000-4000-8000-000000000002'),
    'failed supplier deletion preserves account balance and movement'
);
SELECT ok(
    (SELECT count(*) = 1 FROM public.activity_logs WHERE action_type = 'EKLEME' AND details->>'transaction_id' = 'c5000000-0000-4000-8000-000000000002')
    AND (SELECT count(*) = 0 FROM public.activity_logs WHERE action_type = 'SILME' AND details->>'transaction_id' = 'c5000000-0000-4000-8000-000000000002'),
    'failed supplier deletion preserves history and appends no success audit'
);
SELECT is(
    (SELECT stock_quantity FROM public.materials WHERE id = 'c6000000-0000-4000-8000-000000000001'),
    7::numeric,
    'failed Z deletion preserves material stock'
);
SELECT is(
    (SELECT count(*)::integer FROM public.stock_movements WHERE batch_id = 'c9000000-0000-4000-8000-000000000002'),
    1,
    'failed Z deletion preserves its stock movement'
);
SELECT is(
    (SELECT count(*)::integer FROM public.sales WHERE batch_id = 'c9000000-0000-4000-8000-000000000002'),
    1,
    'failed Z deletion preserves its sale'
);
SELECT is(
    (SELECT count(*)::integer FROM public.expenses WHERE batch_id = 'c9000000-0000-4000-8000-000000000002'),
    1,
    'failed Z deletion preserves its expense'
);
SELECT ok(
    (SELECT balance = 130 FROM public.accounts WHERE id = 'c4000000-0000-4000-8000-000000000002')
    AND (SELECT count(*) = 1 FROM public.account_movements WHERE source_type = 'z_report' AND source_id = 'c9000000-0000-4000-8000-000000000002'),
    'failed Z deletion preserves account balance and movement'
);
SELECT ok(
    (SELECT count(*) = 1 FROM public.activity_logs WHERE action_type = 'EKLEME' AND details->>'batch_id' = 'c9000000-0000-4000-8000-000000000002')
    AND (SELECT count(*) = 0 FROM public.activity_logs WHERE action_type = 'SILME' AND details->>'batch_id' = 'c9000000-0000-4000-8000-000000000002'),
    'failed Z deletion preserves history and appends no success audit'
);

SELECT * FROM finish();
ROLLBACK;

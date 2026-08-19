CREATE TEMP TABLE z_concurrency_extension_state (was_present boolean NOT NULL);
INSERT INTO z_concurrency_extension_state
SELECT pg_catalog.to_regprocedure('extensions.dblink_connect(text,text)') IS NOT NULL;

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

SELECT plan(6);

DELETE FROM public.activity_logs
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.account_movements
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.stock_movements
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.expenses
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.sales
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.materials
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.accounts
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.profiles
WHERE id = 'f1000000-0000-4000-8000-000000000001';
DELETE FROM public.organization_members
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.organizations
WHERE id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM auth.users
WHERE id = 'f1000000-0000-4000-8000-000000000001';

BEGIN;
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
VALUES (
    'f1000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'z-concurrency@example.com',
    now(),
    now()
);
INSERT INTO public.organizations (id, name, slug, created_by)
VALUES (
    'f2000000-0000-4000-8000-000000000001',
    'Z concurrency org',
    'z-concurrency-org',
    'f1000000-0000-4000-8000-000000000001'
);
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    'owner',
    'active'
);
INSERT INTO public.profiles (id, active_organization_id)
VALUES (
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.materials (
    id, name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
)
VALUES (
    'f6000000-0000-4000-8000-000000000001',
    'Concurrency material',
    'Test',
    'Adet',
    1,
    8,
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.accounts (id, name, type, balance, organization_id)
VALUES (
    'f4000000-0000-4000-8000-000000000001',
    'Concurrency cash account',
    'cash',
    110,
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.sales (
    id, quantity, unit_price, total_price, sale_date, batch_id, organization_id
)
VALUES (
    'f8000000-0000-4000-8000-000000000001',
    1,
    10,
    10,
    CURRENT_DATE,
    'f9000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.stock_movements (
    id, batch_id, material_id, movement_type, quantity, note, user_id, organization_id
)
VALUES (
    'f7000000-0000-4000-8000-000000000001',
    'f9000000-0000-4000-8000-000000000001',
    'f6000000-0000-4000-8000-000000000001',
    'cikis',
    2,
    'Concurrent delete restoration fixture',
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.account_movements (
    account_id, movement_type, amount, description, source_type, source_id, organization_id
)
VALUES (
    'f4000000-0000-4000-8000-000000000001',
    'giris',
    10,
    'Concurrent delete balance fixture',
    'z_report',
    'f9000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
INSERT INTO public.activity_logs (
    module, action_type, description, details, user_id, organization_id
)
VALUES (
    'Z-Raporu',
    'EKLEME',
    'replaced batch historical audit',
    '{"batchId":"f9000000-0000-4000-8000-000000000001"}'::jsonb,
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001'
);
COMMIT;

SELECT extensions.dblink_connect(
    'z_delete',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable'
);
SELECT extensions.dblink_connect(
    'z_writer',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable'
);

SELECT extensions.dblink_exec(
    'z_delete',
    $$SET request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001'$$
);
SELECT extensions.dblink_exec('z_delete', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT extensions.dblink_exec('z_delete', 'SET ROLE authenticated');
CREATE TEMP TABLE z_delete_session (backend_pid integer NOT NULL);
INSERT INTO z_delete_session (backend_pid)
SELECT session.backend_pid
FROM extensions.dblink('z_delete', 'SELECT pg_catalog.pg_backend_pid()')
    AS session(backend_pid integer);

BEGIN;
SELECT 1
FROM public.sales
WHERE id = 'f8000000-0000-4000-8000-000000000001'
FOR UPDATE;

SELECT extensions.dblink_send_query(
    'z_delete',
    $$
    SELECT public.delete_z_report_transaction(
        'f9000000-0000-4000-8000-000000000001',
        'f2000000-0000-4000-8000-000000000001'
    )::text
    $$
);

DO $wait_for_delete_lock$
DECLARE
    v_attempt integer := 0;
BEGIN
    WHILE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_locks
        WHERE pid = (SELECT backend_pid FROM z_delete_session)
          AND locktype = 'advisory'
          AND granted
    ) AND v_attempt < 100 LOOP
        PERFORM pg_catalog.pg_sleep(0.05);
        v_attempt := v_attempt + 1;
    END LOOP;
END;
$wait_for_delete_lock$;

SELECT ok(
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_locks
        WHERE pid = (SELECT backend_pid FROM z_delete_session)
          AND locktype = 'advisory'
          AND granted
    ),
    'delete RPC acquires the tenant and batch advisory lock before waiting on batch rows'
);

SELECT extensions.dblink_exec(
    'z_writer',
    $$SET request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001'$$
);
SELECT extensions.dblink_exec('z_writer', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT extensions.dblink_exec('z_writer', 'SET ROLE authenticated');
CREATE TEMP TABLE z_writer_session (backend_pid integer NOT NULL);
INSERT INTO z_writer_session (backend_pid)
SELECT session.backend_pid
FROM extensions.dblink('z_writer', 'SELECT pg_catalog.pg_backend_pid()')
    AS session(backend_pid integer);
SELECT extensions.dblink_send_query(
    'z_writer',
    $$
    SELECT public.process_z_report_atomic(
        'f2000000-0000-4000-8000-000000000001',
        CURRENT_DATE,
        '[{"product_id":null,"quantity":1,"total_price":42}]'::jsonb,
        '[]'::jsonb,
        '{}'::jsonb,
        NULL,
        true,
        '{"source":"concurrency-test"}'::jsonb
    )::text
    $$
);

DO $wait_for_writer_lock$
DECLARE
    v_attempt integer := 0;
BEGIN
    WHILE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_locks
        WHERE pid = (SELECT backend_pid FROM z_writer_session)
          AND locktype = 'advisory'
          AND NOT granted
    ) AND v_attempt < 100 LOOP
        PERFORM pg_catalog.pg_sleep(0.05);
        v_attempt := v_attempt + 1;
    END LOOP;
END;
$wait_for_writer_lock$;

SELECT ok(
    extensions.dblink_is_busy('z_writer') = 1
    AND EXISTS (
        SELECT 1
        FROM pg_catalog.pg_locks
        WHERE pid = (SELECT backend_pid FROM z_writer_session)
          AND locktype = 'advisory'
          AND NOT granted
    ),
    'replacement writer waits on the tenant and existing-batch advisory lock'
);

COMMIT;

DO $wait_for_rpcs$
DECLARE
    v_attempt integer := 0;
BEGIN
    WHILE (
        extensions.dblink_is_busy('z_delete') = 1
        OR extensions.dblink_is_busy('z_writer') = 1
    ) AND v_attempt < 100 LOOP
        PERFORM pg_catalog.pg_sleep(0.05);
        v_attempt := v_attempt + 1;
    END LOOP;

    IF extensions.dblink_is_busy('z_delete') = 1
       OR extensions.dblink_is_busy('z_writer') = 1 THEN
        RAISE EXCEPTION 'Delete and writer RPCs did not finish after the row lock release.';
    END IF;
END;
$wait_for_rpcs$;

CREATE TEMP TABLE z_concurrency_writer_result (batch_id uuid NOT NULL);
CREATE TEMP TABLE z_concurrency_delete_result (deleted boolean NOT NULL);
INSERT INTO z_concurrency_delete_result (deleted)
SELECT result.deleted::boolean
FROM extensions.dblink_get_result('z_delete') AS result(deleted text);
INSERT INTO z_concurrency_writer_result (batch_id)
SELECT result.batch_id::uuid
FROM extensions.dblink_get_result('z_writer') AS result(batch_id text);

SELECT ok(
    (SELECT deleted FROM z_concurrency_delete_result)
    AND (SELECT batch_id <> 'f9000000-0000-4000-8000-000000000001'::uuid FROM z_concurrency_writer_result),
    'delete and writer RPCs both complete without deadlock after the blocker releases'
);
SELECT is(
    (
        SELECT
            (SELECT count(*) FROM public.stock_movements WHERE batch_id = 'f9000000-0000-4000-8000-000000000001')
            + (SELECT count(*) FROM public.sales WHERE batch_id = 'f9000000-0000-4000-8000-000000000001')
            + (SELECT count(*) FROM public.expenses WHERE batch_id = 'f9000000-0000-4000-8000-000000000001')
            + (
                SELECT count(*)
                FROM public.account_movements
                WHERE source_type = 'z_report'
                  AND source_id = 'f9000000-0000-4000-8000-000000000001'
            )
    )::integer,
    0,
    'delete removes the old batch while the writer creates no orphaned old rows'
);
SELECT ok(
    (SELECT count(*) = 1 FROM public.sales
     WHERE batch_id = (SELECT batch_id FROM z_concurrency_writer_result)
       AND organization_id = 'f2000000-0000-4000-8000-000000000001'
       AND total_price = 42)
    AND (SELECT stock_quantity = 10 FROM public.materials
         WHERE id = 'f6000000-0000-4000-8000-000000000001')
    AND (SELECT balance = 100 FROM public.accounts
         WHERE id = 'f4000000-0000-4000-8000-000000000001'),
    'writer completes a new batch and delete conserves stock and account balances'
);
SELECT ok(
    (SELECT count(*) = 1 FROM public.activity_logs
     WHERE organization_id = 'f2000000-0000-4000-8000-000000000001'
       AND details->>'batchId' = 'f9000000-0000-4000-8000-000000000001')
    AND (SELECT count(*) = 1 FROM public.activity_logs
         WHERE organization_id = 'f2000000-0000-4000-8000-000000000001'
           AND action_type = 'SILME'
           AND details->>'batch_id' = 'f9000000-0000-4000-8000-000000000001')
    AND (SELECT count(*) = 1 FROM public.activity_logs
         WHERE organization_id = 'f2000000-0000-4000-8000-000000000001'
           AND details->>'batchId' = (SELECT batch_id::text FROM z_concurrency_writer_result)),
    'interleaving preserves history and appends one delete and one writer audit'
);

SELECT extensions.dblink_disconnect('z_writer');
SELECT extensions.dblink_disconnect('z_delete');

BEGIN;
DELETE FROM public.activity_logs
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.account_movements
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.stock_movements
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.expenses
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.sales
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.materials
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.accounts
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.profiles
WHERE id = 'f1000000-0000-4000-8000-000000000001';
DELETE FROM public.organization_members
WHERE organization_id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM public.organizations
WHERE id = 'f2000000-0000-4000-8000-000000000001';
DELETE FROM auth.users
WHERE id = 'f1000000-0000-4000-8000-000000000001';
COMMIT;

SELECT * FROM finish();

DO $drop_test_extension$
BEGIN
    IF NOT (SELECT was_present FROM z_concurrency_extension_state) THEN
        EXECUTE 'DROP EXTENSION dblink';
    END IF;
END;
$drop_test_extension$;

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
    'z_lock_holder',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable'
);
SELECT extensions.dblink_connect(
    'z_writer',
    'host=host.docker.internal port=54322 dbname=postgres user=postgres password=postgres sslmode=disable'
);

SELECT extensions.dblink_exec('z_lock_holder', 'BEGIN');
SELECT acquired
FROM extensions.dblink(
    'z_lock_holder',
    pg_catalog.format(
        'SELECT true FROM pg_catalog.pg_advisory_xact_lock(%s)',
        pg_catalog.hashtextextended(
            'f2000000-0000-4000-8000-000000000001:f9000000-0000-4000-8000-000000000001',
            0
        )
    )
) AS lock_result(acquired boolean);

SELECT extensions.dblink_exec(
    'z_writer',
    $$SET request.jwt.claim.sub = 'f1000000-0000-4000-8000-000000000001'$$
);
SELECT extensions.dblink_exec('z_writer', $$SET request.jwt.claim.role = 'authenticated'$$);
SELECT extensions.dblink_exec('z_writer', 'SET ROLE authenticated');
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

SELECT pg_catalog.pg_sleep(0.5);
SELECT is(
    extensions.dblink_is_busy('z_writer'),
    1,
    'replacement writer waits on the tenant and existing-batch advisory lock'
);

SELECT extensions.dblink_exec('z_lock_holder', 'COMMIT');

DO $wait_for_writer$
DECLARE
    v_attempt integer := 0;
BEGIN
    WHILE extensions.dblink_is_busy('z_writer') = 1 AND v_attempt < 100 LOOP
        PERFORM pg_catalog.pg_sleep(0.05);
        v_attempt := v_attempt + 1;
    END LOOP;

    IF extensions.dblink_is_busy('z_writer') = 1 THEN
        RAISE EXCEPTION 'Z writer did not finish after advisory lock release.';
    END IF;
END;
$wait_for_writer$;

CREATE TEMP TABLE z_concurrency_writer_result (batch_id uuid NOT NULL);
INSERT INTO z_concurrency_writer_result (batch_id)
SELECT result.batch_id::uuid
FROM extensions.dblink_get_result('z_writer') AS result(batch_id text);

SELECT isnt(
    (SELECT batch_id FROM z_concurrency_writer_result),
    'f9000000-0000-4000-8000-000000000001'::uuid,
    'replacement writer returns a new batch identifier after the lock is released'
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
    'replacement leaves no rows from the replaced batch'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.sales
        WHERE batch_id = (SELECT batch_id FROM z_concurrency_writer_result)
          AND organization_id = 'f2000000-0000-4000-8000-000000000001'
          AND total_price = 42
    ),
    1,
    'replacement creates exactly one complete new sales batch'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'f2000000-0000-4000-8000-000000000001'
          AND module = 'Z-Raporu'
          AND details->>'batchId' = (SELECT batch_id::text FROM z_concurrency_writer_result)
    ),
    1,
    'replacement appends the audit row for the new batch'
);
SELECT is(
    (
        SELECT count(*)::integer
        FROM public.activity_logs
        WHERE organization_id = 'f2000000-0000-4000-8000-000000000001'
          AND details->>'batchId' = 'f9000000-0000-4000-8000-000000000001'
    ),
    1,
    'replacement preserves the historical audit row for the replaced batch'
);

SELECT extensions.dblink_disconnect('z_writer');
SELECT extensions.dblink_disconnect('z_lock_holder');

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

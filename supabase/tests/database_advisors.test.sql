BEGIN;

SELECT plan(10);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  ),
  3,
  'profiles keeps exactly one policy per supported operation'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND roles <> ARRAY['authenticated']::name[]
  ),
  'profile policies apply only to authenticated users'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can insert own profile'
      AND lower(with_check) LIKE '%select auth.uid()%'
  ),
  'profile insert caches auth.uid per statement'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Users can update own profile'
      AND lower(qual) LIKE '%select auth.uid()%'
      AND lower(with_check) LIKE '%select auth.uid()%'
  ),
  'profile update checks old and new rows with cached auth.uid'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND cmd = 'ALL'
  ),
  0,
  'organization members has no overlapping FOR ALL policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND cmd = 'SELECT'
      AND roles = ARRAY['authenticated']::name[]
  ),
  1,
  'organization members has one authenticated read policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_members'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND roles = ARRAY['authenticated']::name[]
  ),
  3,
  'organization member writes use operation-specific policies'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
      AND conname = ANY (ARRAY[
        'accounts_org_id_unique',
        'cash_reconciliations_org_date_unique',
        'investments_org_id_unique',
        'materials_org_id_unique',
        'products_org_id_unique',
        'sub_recipes_org_id_unique',
        'suppliers_org_id_unique'
      ])
  ),
  0,
  'redundant unique constraints are removed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_namespace AS index_schema
      ON index_schema.oid = index_relation.relnamespace
    WHERE index_schema.nspname = 'public'
      AND index_relation.relname = ANY (ARRAY[
        'sec_102_accounts_organization_id_id_uidx',
        'sec_102_cash_reconciliations_organization_date_key',
        'sec_102_investments_organization_id_id_uidx',
        'sec_102_materials_organization_id_id_uidx',
        'sec_102_products_organization_id_id_uidx',
        'sec_102_sub_recipes_organization_id_id_uidx',
        'sec_102_suppliers_organization_id_id_uidx'
      ])
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indisready
  ),
  7,
  'all retained tenant indexes remain unique and valid'
);

SELECT is(
  (
    SELECT count(DISTINCT constraint_definition.conindid)::integer
    FROM pg_constraint AS constraint_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = constraint_definition.conindid
    WHERE constraint_definition.contype = 'f'
      AND index_relation.relname = ANY (ARRAY[
        'sec_102_accounts_organization_id_id_uidx',
        'sec_102_investments_organization_id_id_uidx',
        'sec_102_materials_organization_id_id_uidx',
        'sec_102_products_organization_id_id_uidx',
        'sec_102_sub_recipes_organization_id_id_uidx',
        'sec_102_suppliers_organization_id_id_uidx'
      ])
  ),
  6,
  'composite foreign keys still reference the retained indexes'
);

SELECT * FROM finish();
ROLLBACK;

-- Keep authorization semantics intact while allowing PostgreSQL to evaluate
-- the caller identity once per statement instead of once per row.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

-- A FOR ALL policy also participates in SELECT, which made PostgreSQL evaluate
-- two permissive read policies for every organization member row. Keep one
-- read policy and separate the privileged write operations explicitly.
DROP POLICY IF EXISTS "View own organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can manage organization members"
ON public.organization_members;

CREATE POLICY "View own organization members"
ON public.organization_members
FOR SELECT
TO authenticated
USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Owners and admins can insert organization members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations())
  AND public.get_user_org_role(organization_id) IN ('owner', 'admin')
);

CREATE POLICY "Owners and admins can update organization members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  organization_id IN (SELECT public.get_user_organizations())
  AND public.get_user_org_role(organization_id) IN ('owner', 'admin')
)
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations())
  AND public.get_user_org_role(organization_id) IN ('owner', 'admin')
);

CREATE POLICY "Owners and admins can delete organization members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  organization_id IN (SELECT public.get_user_organizations())
  AND public.get_user_org_role(organization_id) IN ('owner', 'admin')
);

-- The baseline SEC-102 unique indexes are referenced by composite foreign
-- keys. Later migrations added equivalent UNIQUE constraints, causing seven
-- duplicate-index warnings. Remove only the redundant constraint-owned index,
-- and abort if the retained index is missing or no longer structurally equal.
DO $$
DECLARE
  candidate record;
  has_equivalent_index boolean;
BEGIN
  FOR candidate IN
    SELECT *
    FROM (VALUES
      ('accounts', 'accounts_org_id_unique', 'sec_102_accounts_organization_id_id_uidx'),
      ('cash_reconciliations', 'cash_reconciliations_org_date_unique', 'sec_102_cash_reconciliations_organization_date_key'),
      ('investments', 'investments_org_id_unique', 'sec_102_investments_organization_id_id_uidx'),
      ('materials', 'materials_org_id_unique', 'sec_102_materials_organization_id_id_uidx'),
      ('products', 'products_org_id_unique', 'sec_102_products_organization_id_id_uidx'),
      ('sub_recipes', 'sub_recipes_org_id_unique', 'sec_102_sub_recipes_organization_id_id_uidx'),
      ('suppliers', 'suppliers_org_id_unique', 'sec_102_suppliers_organization_id_id_uidx')
    ) AS targets(table_name, constraint_name, retained_index_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      JOIN pg_class AS table_definition
        ON table_definition.oid = constraint_definition.conrelid
      JOIN pg_namespace AS table_schema
        ON table_schema.oid = table_definition.relnamespace
      WHERE table_schema.nspname = 'public'
        AND table_definition.relname = candidate.table_name
        AND constraint_definition.conname = candidate.constraint_name
        AND constraint_definition.contype = 'u'
    ) THEN
      SELECT
        retained_index.indisunique
        AND retained_index.indisvalid
        AND retained_index.indisready
        AND constraint_index.indkey = retained_index.indkey
        AND constraint_index.indclass = retained_index.indclass
        AND constraint_index.indcollation = retained_index.indcollation
        AND constraint_index.indoption = retained_index.indoption
        AND constraint_index.indpred IS NOT DISTINCT FROM retained_index.indpred
        AND constraint_index.indexprs IS NOT DISTINCT FROM retained_index.indexprs
      INTO has_equivalent_index
      FROM pg_constraint AS constraint_definition
      JOIN pg_class AS table_definition
        ON table_definition.oid = constraint_definition.conrelid
      JOIN pg_namespace AS table_schema
        ON table_schema.oid = table_definition.relnamespace
      JOIN pg_index AS constraint_index
        ON constraint_index.indexrelid = constraint_definition.conindid
      JOIN pg_class AS retained_index_definition
        ON retained_index_definition.relname = candidate.retained_index_name
        AND retained_index_definition.relnamespace = table_schema.oid
      JOIN pg_index AS retained_index
        ON retained_index.indexrelid = retained_index_definition.oid
        AND retained_index.indrelid = table_definition.oid
      WHERE table_schema.nspname = 'public'
        AND table_definition.relname = candidate.table_name
        AND constraint_definition.conname = candidate.constraint_name
        AND constraint_definition.contype = 'u';

      IF NOT COALESCE(has_equivalent_index, false) THEN
        RAISE EXCEPTION
          'Cannot remove %.%: retained index % is missing or not equivalent',
          candidate.table_name,
          candidate.constraint_name,
          candidate.retained_index_name;
      END IF;

      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        candidate.table_name,
        candidate.constraint_name
      );
    END IF;
  END LOOP;
END;
$$;

# SECURITY DEFINER Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the externally reachable `SECURITY DEFINER` surface to six intentional RPCs while preserving tenant-safe compatibility wrappers and making supplier/Z-report deletion, compensation, and audit writes one atomic database action.

**Architecture:** Use a two-layer database boundary. Caller-aware authorization helpers live in the non-exposed `private` schema as fixed-search-path definers, while existing public helper signatures become invoker wrappers so RLS policy OIDs and application contracts remain stable; the two destructive public RPCs remain narrowly granted definers because they must compensate multiple RLS-protected financial tables atomically.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.111.0, Supabase Auth/RLS/PostgREST, pgTAP, Next.js 16 App Router, React 19, TypeScript 5, Vitest, Graphify, codebase-memory.

## Global Constraints

- Implement only on a `codex/` branch or isolated worktree; do not push, merge, deploy, apply a live migration, alter Auth settings, or mutate production data without a separate explicit approval.
- Never rewrite an applied migration. Add only the two forward migrations named in this plan under the flat `supabase/migrations/` directory.
- Treat `auth.uid()`, `profiles.active_organization_id`, active `organization_members` rows, and database-side checks as authorization sources; never trust browser organization state by itself.
- Preserve every existing public function identity argument list and return type named in this plan; use `CREATE OR REPLACE FUNCTION` so dependent RLS policy and SQL object OIDs remain valid.
- Every definer uses `SET search_path = ''`, schema-qualifies every object, rejects unauthenticated callers, and receives only exact-signature grants.
- `PUBLIC` and `anon` must not execute any function changed here. `service_role` is retained only on documented server/RPC boundaries.
- `private` is not added to Supabase exposed schemas. Schema `USAGE` does not imply table or function access; exact helper `EXECUTE` grants remain mandatory.
- Successful compound mutations must append their audit record in the same PostgreSQL statement/transaction. Existing audit history is never deleted or rewritten.
- Unexpected database details and raw `SQLERRM` text are logged only through the established technical logger and are never shown to users.
- Use RED/GREEN TDD for every behavior change. Do not weaken RLS, lint, React, TypeScript, pgTAP, roadmap, or build checks.
- Use the pinned CLI at `C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe` when the global `npx` launcher hangs.
- The optional local Vector log collector may be excluded with the already verified official `start --exclude vector` option; Postgres, Auth, Storage, PostgREST, migrations, RLS, advisors, and pgTAP must remain enabled.
- Official references: [Database Functions](https://supabase.com/docs/guides/database/functions), [Advisor 0029](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable), [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api), and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

---

## File Map

- Create `supabase/tests/security_definer_boundaries.test.sql`: exact catalog, ACL, overload, identity, active-membership, and compatibility-wrapper contracts.
- Create `supabase/migrations/20260817180000_isolate_security_definer_helpers.sql`: five private helpers, five public invoker wrappers, schema/function ACLs, and unused-surface revocations.
- Create `supabase/tests/destructive_financial_rpc_security.test.sql`: supplier/Z-report success, denial, compensation, immutable audit history, and forced rollback contracts.
- Create `supabase/migrations/20260817183000_harden_destructive_financial_rpcs.sql`: the two atomic destructive RPC definitions and exact grants.
- Create `src/app/api/delete-z-report/route.test.ts`: server-route error masking and one-RPC-only audit behavior.
- Modify `src/app/api/delete-z-report/route.ts`: remove the post-commit audit insert and return a stable Turkish error.
- Modify `src/app/dashboard/tedarikciler/page.tsx`: stop exposing RPC details and stop issuing the duplicate client audit call.
- Modify `src/app/dashboard/raporlar/gecmis/page.tsx`: stop issuing the duplicate client audit call and keep only safe user-facing failure copy.
- Modify `src/lib/rpc-signature.test.ts`: enforce exact caller parameter names and the absence of client-side audit/error-detail regressions.
- Modify `docs/security/SEC-02-security-definer-review.md`: append implemented signatures, advisor delta, RED/GREEN evidence, and residual risks.
- Modify `docs/superpowers/ROADMAP.md`: keep `SEC-02` active until all local gates and independent review pass; record commit evidence only after completion.
- Refresh generated `.codebase-memory/artifact.json` and `.codebase-memory/graph.db.zst` only through their supported tools and only if the final graph actually changes.

---

### Task 1: Prove the helper boundary is unsafe before changing it

**Files:**

- Create: `supabase/tests/security_definer_boundaries.test.sql`
- Read: `supabase/tests/advisor_security_hardening.test.sql`
- Read: `supabase/tests/active_organization_selection.test.sql`

**Interfaces:**

- Consumes: existing signatures `public.current_organization_id()`, `public.get_user_organizations()`, `public.get_user_org_role(uuid)`, `public.is_organization_member(uuid,uuid)`, `public.has_organization_role(uuid,text[],uuid)`, `public.get_users_info(uuid[])`, and `private.get_user_organizations()`.
- Produces: a failing pgTAP contract for the exact helper/ACL architecture consumed by Task 2.

- [ ] **Step 1: Create deterministic pgTAP identities and tenant fixtures**

  Start the file with a transaction, pgTAP, and 34 assertions. Use these stable identities throughout the file:

  ```sql
  BEGIN;
  CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
  SELECT plan(34);

  INSERT INTO auth.users (id, email)
  VALUES
    ('a1000000-0000-4000-8000-000000000001', 'owner-a@example.test'),
    ('b1000000-0000-4000-8000-000000000002', 'owner-b@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name)
  VALUES
    ('a2000000-0000-4000-8000-000000000001', 'Helper Org A'),
    ('b2000000-0000-4000-8000-000000000002', 'Helper Org B')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, active_organization_id)
  VALUES
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001'),
    ('b1000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002')
  ON CONFLICT (id) DO UPDATE
  SET active_organization_id = EXCLUDED.active_organization_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES
    ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner', 'active'),
    ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner', 'active')
  ON CONFLICT (organization_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, status = EXCLUDED.status;
  ```

- [ ] **Step 2: Add exact catalog and ACL assertions**

  Assert that the five private signatures exist, are definers, have `search_path` exactly `"search_path=\"\""` in `proconfig`, and are not executable by `PUBLIC` or `anon`. Assert that all five public compatibility signatures are invokers with the same empty path, `private.get_user_organizations()` and `public.get_users_info(uuid[])` are not executable by `authenticated`, and only `service_role` can retain `get_users_info` execution.

  ```sql
  SELECT has_function('private', 'current_organization_id', ARRAY[]::text[], 'private current organization helper exists');
  SELECT has_function('private', 'active_organization_ids', ARRAY[]::text[], 'private active organizations helper exists');
  SELECT has_function('private', 'current_user_organization_role', ARRAY['uuid'], 'private role helper exists');
  SELECT has_function('private', 'is_current_user_organization_member', ARRAY['uuid'], 'private membership helper exists');
  SELECT has_function('private', 'current_user_has_organization_role', ARRAY['uuid','text[]'], 'private role allowlist helper exists');

  SELECT results_eq(
    $$
      SELECT p.proname::text
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'private'
        AND p.proname IN (
          'current_organization_id', 'active_organization_ids',
          'current_user_organization_role', 'is_current_user_organization_member',
          'current_user_has_organization_role'
        )
        AND p.prosecdef
        AND p.proconfig = ARRAY['search_path=""']::text[]
      ORDER BY p.proname
    $$,
    $$ VALUES
      ('active_organization_ids'::text),
      ('current_organization_id'::text),
      ('current_user_has_organization_role'::text),
      ('current_user_organization_role'::text),
      ('is_current_user_organization_member'::text)
    $$,
    'all private helpers are fixed-path definers'
  );

  SELECT results_eq(
    $$
      SELECT p.oid::regprocedure::text
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.oid::regprocedure::text IN (
          'current_organization_id()', 'get_user_organizations()',
          'get_user_org_role(uuid)', 'is_organization_member(uuid,uuid)',
          'has_organization_role(uuid,text[],uuid)'
        )
        AND NOT p.prosecdef
        AND p.proconfig = ARRAY['search_path=""']::text[]
      ORDER BY 1
    $$,
    $$ VALUES
      ('current_organization_id()'::text),
      ('get_user_org_role(uuid)'::text),
      ('get_user_organizations()'::text),
      ('has_organization_role(uuid,text[],uuid)'::text),
      ('is_organization_member(uuid,uuid)'::text)
    $$,
    'all public compatibility helpers are fixed-path invokers'
  );

  SELECT is(
    (
      SELECT count(*)::integer
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
      WHERE p.oid = 'private.current_organization_id()'::regprocedure
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ),
    0,
    'PUBLIC cannot execute private helper'
  );
  SELECT ok(NOT has_function_privilege('anon', 'private.current_organization_id()', 'EXECUTE'), 'anon cannot execute private helper');
  SELECT ok(NOT has_function_privilege('authenticated', 'private.get_user_organizations()', 'EXECUTE'), 'legacy private helper is revoked from authenticated');
  SELECT ok(NOT has_function_privilege('authenticated', 'public.get_users_info(uuid[])', 'EXECUTE'), 'unused directory RPC is revoked from authenticated');
  SELECT ok(has_function_privilege('service_role', 'public.get_users_info(uuid[])', 'EXECUTE'), 'service role retains the reviewed directory RPC');
  ```

- [ ] **Step 3: Add wrapper behavior and legacy user-ID denial assertions**

  Set `request.jwt.claim.sub`, use `SET LOCAL ROLE authenticated`, and assert Org A resolves only itself, sees role `owner`, cannot ask membership/role questions for Owner B, and returns no active organization after its membership is changed to `inactive`.

  ```sql
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

  SELECT is(public.current_organization_id(), 'a2000000-0000-4000-8000-000000000001'::uuid, 'wrapper resolves selected active organization');
  SELECT results_eq(
    $$ SELECT * FROM public.get_user_organizations() ORDER BY 1 $$,
    $$ VALUES ('a2000000-0000-4000-8000-000000000001'::uuid) $$,
    'wrapper returns caller active organizations only'
  );
  SELECT is(public.get_user_org_role('a2000000-0000-4000-8000-000000000001'), 'owner', 'wrapper returns caller role');
  SELECT is(public.is_organization_member('a2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002'), false, 'legacy membership wrapper rejects another user id');
  SELECT is(public.has_organization_role('a2000000-0000-4000-8000-000000000001', ARRAY['owner'], 'b1000000-0000-4000-8000-000000000002'), false, 'legacy role wrapper rejects another user id');

  RESET ROLE;
  UPDATE public.organization_members
  SET status = 'inactive'
  WHERE organization_id = 'a2000000-0000-4000-8000-000000000001'
    AND user_id = 'a1000000-0000-4000-8000-000000000001';
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
  SELECT is(public.current_organization_id(), NULL::uuid, 'inactive membership cannot resolve tenant context');
  RESET ROLE;
  SELECT * FROM finish();
  ROLLBACK;
  ```

- [ ] **Step 4: Run the focused test and capture RED**

  Run:

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local supabase/tests/security_definer_boundaries.test.sql
  ```

  Expected: FAIL because the five private helpers do not exist, the five public helpers are still definers, and the two obsolete authenticated grants still exist. If fixture setup fails before these assertions, correct the fixture rather than treating harness failure as RED.

- [ ] **Step 5: Commit the RED contract**

  ```powershell
  git add -- supabase/tests/security_definer_boundaries.test.sql
  git commit -m "test: define security definer boundaries"
  ```

---

### Task 2: Isolate private helpers and preserve public invoker contracts

**Files:**

- Create: `supabase/migrations/20260817180000_isolate_security_definer_helpers.sql`
- Test: `supabase/tests/security_definer_boundaries.test.sql`
- Test: `supabase/tests/advisor_security_hardening.test.sql`

**Interfaces:**

- Consumes: Task 1's exact signatures and tests.
- Produces: five private fixed-path definers and five same-signature public invoker wrappers; Tasks 3 and 4 use `private.current_organization_id()` and `private.is_current_user_organization_member(uuid)`.

- [ ] **Step 1: Add a predecessor guard and the five private helpers**

  Begin the migration with a catalog guard that raises SQLSTATE `55000` unless each exact public predecessor exists exactly once. Then create these functions with the shown return contracts:

  ```sql
  DO $migration_guard$
  DECLARE
    v_missing text[];
  BEGIN
    SELECT array_agg(required.signature ORDER BY required.signature)
    INTO v_missing
    FROM (VALUES
      ('public.current_organization_id()'),
      ('public.get_user_organizations()'),
      ('public.get_user_org_role(uuid)'),
      ('public.is_organization_member(uuid,uuid)'),
      ('public.has_organization_role(uuid,text[],uuid)')
    ) AS required(signature)
    WHERE to_regprocedure(required.signature) IS NULL;

    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'SECURITY DEFINER helper predecessors are incomplete.',
        DETAIL = array_to_string(v_missing, ', ');
    END IF;
  END
  $migration_guard$;

  CREATE OR REPLACE FUNCTION private.active_organization_ids()
  RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $function$
    SELECT membership.organization_id
    FROM public.organization_members AS membership
    WHERE membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active';
  $function$;

  CREATE OR REPLACE FUNCTION private.is_current_user_organization_member(p_organization_id uuid)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organization_members AS membership
        WHERE membership.organization_id = p_organization_id
          AND membership.user_id = (SELECT auth.uid())
          AND membership.status = 'active'
      );
  $function$;

  CREATE OR REPLACE FUNCTION private.current_user_organization_role(p_organization_id uuid)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $function$
    SELECT membership.role
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
    LIMIT 1;
  $function$;

  CREATE OR REPLACE FUNCTION private.current_user_has_organization_role(p_organization_id uuid, p_roles text[])
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.organization_members AS membership
        WHERE membership.organization_id = p_organization_id
          AND membership.user_id = (SELECT auth.uid())
          AND membership.status = 'active'
          AND membership.role = ANY (coalesce(p_roles, ARRAY[]::text[]))
      );
  $function$;

  CREATE OR REPLACE FUNCTION private.current_organization_id()
  RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
  AS $function$
    SELECT coalesce(
      (
        SELECT profile.active_organization_id
        FROM public.profiles AS profile
        JOIN public.organization_members AS membership
          ON membership.organization_id = profile.active_organization_id
         AND membership.user_id = profile.id
         AND membership.status = 'active'
        WHERE profile.id = (SELECT auth.uid())
      ),
      (
        SELECT membership.organization_id
        FROM public.organization_members AS membership
        WHERE membership.user_id = (SELECT auth.uid())
          AND membership.status = 'active'
        ORDER BY
          CASE membership.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
          membership.created_at,
          membership.organization_id
        LIMIT 1
      )
    );
  $function$;
  ```

- [ ] **Step 2: Replace the five public bodies with invoker wrappers**

  Preserve identity arguments and return types exactly. The two legacy user-ID wrappers fail closed by returning `false` when `p_user_id` differs from `auth.uid()`.

  ```sql
  CREATE OR REPLACE FUNCTION public.current_organization_id()
  RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
  AS $function$ SELECT private.current_organization_id(); $function$;

  CREATE OR REPLACE FUNCTION public.get_user_organizations()
  RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
  AS $function$ SELECT * FROM private.active_organization_ids(); $function$;

  CREATE OR REPLACE FUNCTION public.get_user_org_role(target_org_id uuid)
  RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
  AS $function$ SELECT private.current_user_organization_role(target_org_id); $function$;

  CREATE OR REPLACE FUNCTION public.is_organization_member(p_organization_id uuid, p_user_id uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
  AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
      AND p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())
      AND private.is_current_user_organization_member(p_organization_id);
  $function$;

  CREATE OR REPLACE FUNCTION public.has_organization_role(p_organization_id uuid, p_roles text[], p_user_id uuid DEFAULT auth.uid())
  RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
  AS $function$
    SELECT (SELECT auth.uid()) IS NOT NULL
      AND p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())
      AND private.current_user_has_organization_role(p_organization_id, p_roles);
  $function$;
  ```

- [ ] **Step 3: Apply exact schema and function ACLs**

  End the migration with explicit ACLs; do not use a broad `GRANT EXECUTE ON ALL FUNCTIONS` statement.

  ```sql
  REVOKE ALL ON SCHEMA private FROM PUBLIC;
  REVOKE ALL ON SCHEMA private FROM anon;
  GRANT USAGE ON SCHEMA private TO authenticated, service_role;

  REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION private.active_organization_ids() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION private.current_user_organization_role(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION private.is_current_user_organization_member(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION private.current_user_has_organization_role(uuid, text[]) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION private.active_organization_ids() TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION private.current_user_organization_role(uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION private.is_current_user_organization_member(uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION private.current_user_has_organization_role(uuid, text[]) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.get_user_organizations() FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.get_user_org_role(uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[], uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.get_user_organizations() TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[], uuid) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION private.get_user_organizations() FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.get_users_info(uuid[]) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.get_users_info(uuid[]) TO service_role;
  NOTIFY pgrst, 'reload schema';
  ```

- [ ] **Step 4: Update the pre-existing advisor test for the intentional revoke**

  In `supabase/tests/advisor_security_hardening.test.sql`, replace the authenticated positive call to `public.get_users_info(uuid[])` with `throws_ok(..., '42501', ...)` or the PostgreSQL permission-denied code/message emitted locally. Add a service-role catalog privilege assertion; do not assert that a null-`auth.uid()` service request returns user data.

- [ ] **Step 5: Replay and prove GREEN**

  Run:

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' db reset --local --no-seed
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local supabase/tests/security_definer_boundaries.test.sql
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local
  ```

  Expected: clean replay succeeds, helper-boundary test passes 34/34, and the complete pgTAP suite passes. Verify with a catalog query that the five wrapper OIDs still exist and their dependent policy/function counts did not drop.

- [ ] **Step 6: Commit the helper boundary**

  ```powershell
  git add -- supabase/migrations/20260817180000_isolate_security_definer_helpers.sql supabase/tests/security_definer_boundaries.test.sql supabase/tests/advisor_security_hardening.test.sql
  git commit -m "fix: isolate security definer helpers"
  ```

---

### Task 3: Prove destructive RPC denial, audit, and rollback gaps

**Files:**

- Create: `supabase/tests/destructive_financial_rpc_security.test.sql`
- Read: `supabase/tests/financial_receipt_writes.test.sql`
- Read: `supabase/tests/rpc_hardening.test.sql`

**Interfaces:**

- Consumes: Task 2 helpers and current public signatures `delete_supplier_transaction(uuid,uuid)` and `delete_z_report_transaction(uuid,uuid)`.
- Produces: a RED contract that Task 4 must satisfy without changing RPC signatures.

- [ ] **Step 1: Build two-tenant financial fixtures**

  Use a transaction and fixed UUID families `c1..c9` for Org A and `d1..d9` for Org B. Insert two auth users, organizations, profiles, active owner memberships, one supplier with debt `100`, one supplier payment of `25`, one account with balance `75`, and one `supplier_payment` account movement of `25` in Org A. Insert a Z batch with one material stock `7`, one stock deduction `3`, one sale `40`, one expense `10`, one account balance `130`, and a `z_report` entry movement `30`. Insert one historical audit row for each target before testing.

  The plan count must cover: 2 catalog/ACL, 4 unauth/cross-tenant, 10 supplier state/audit, 12 Z-report state/audit, and 12 forced-failure rollback assertions. Use `SELECT plan(40);` and finish with `SELECT * FROM finish(); ROLLBACK;`.

- [ ] **Step 2: Add exact ACL and denial tests**

  ```sql
  SELECT ok(NOT has_function_privilege('anon', 'public.delete_supplier_transaction(uuid,uuid)', 'EXECUTE'), 'anon cannot delete supplier transaction');
  SELECT ok(NOT has_function_privilege('anon', 'public.delete_z_report_transaction(uuid,uuid)', 'EXECUTE'), 'anon cannot delete Z report');

  SET LOCAL ROLE anon;
  SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501', NULL, 'unauthenticated supplier deletion is denied by ACL'
  );
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000002', true);
  SELECT throws_ok(
    $$ SELECT public.delete_supplier_transaction('c5000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501', 'Bu işletmede işlem yetkiniz yok.', 'cross-tenant supplier deletion is denied'
  );
  SELECT throws_ok(
    $$ SELECT public.delete_z_report_transaction('c9000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001') $$,
    '42501', 'Bu işletmede işlem yetkiniz yok.', 'cross-tenant Z deletion is denied'
  );
  RESET ROLE;
  ```

- [ ] **Step 3: Add success-state and immutable-audit assertions**

  For the Org A user, call each RPC once. Supplier expectations are: transaction count `0`, supplier debt `125` for a deleted payment, account movement count `0`, account balance `100`, historical audit count still `1`, and exactly one new `module='Tedarikçi'`, `action_type='SILME'` event whose details contain the transaction and organization IDs. Z expectations are: material stock `10`, target stock/sale/expense/account-movement counts `0`, account balance `100`, historical audit count still `1`, and one new `module='Z-Raporu'`, `action_type='SILME'` event with batch ID, affected counts, and reversal totals.

  Assert details with exact JSON keys:

  ```sql
  SELECT is(
    (SELECT count(*)::integer FROM public.activity_logs
     WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
       AND module = 'Tedarikçi' AND action_type = 'SILME'
       AND details->>'transaction_id' = 'c5000000-0000-4000-8000-000000000001'),
    1,
    'supplier deletion appends one tenant audit event'
  );

  SELECT is(
    (SELECT count(*)::integer FROM public.activity_logs
     WHERE organization_id = 'c2000000-0000-4000-8000-000000000001'
       AND module = 'Z-Raporu' AND action_type = 'SILME'
       AND details->>'batch_id' = 'c9000000-0000-4000-8000-000000000001'
       AND details ?& ARRAY['stock_movements_deleted','sales_deleted','expenses_deleted','account_movements_deleted','stock_quantity_restored','account_balance_reversed']),
    1,
    'Z deletion appends one complete tenant audit event'
  );
  ```

- [ ] **Step 4: Add an audit-failure trigger and prove full rollback**

  Seed a second supplier payment and a second Z batch. Create a test-only trigger function as postgres that raises SQLSTATE `P0001` for every new `SILME` audit event, install it only around the two failure calls, then remove it before any later assertion. Call each RPC with `throws_ok` and assert every original transaction, supplier debt, account balance/movement, material stock/movement, sale, expense, and historical audit row remains unchanged and no new success audit exists.

  ```sql
  CREATE OR REPLACE FUNCTION private.test_reject_delete_audit()
  RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
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
  ```

- [ ] **Step 5: Run focused RED**

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local supabase/tests/destructive_financial_rpc_security.test.sql
  ```

  Expected: denial assertions may already pass, but success audit/history assertions fail because current RPCs delete historical audit rows and do not insert the required event; forced-audit rollback assertions fail because no in-RPC audit insert reaches the trigger. Record those failures as RED.

- [ ] **Step 6: Commit the RED contract**

  ```powershell
  git add -- supabase/tests/destructive_financial_rpc_security.test.sql
  git commit -m "test: define destructive financial RPC invariants"
  ```

---

### Task 4: Harden the two destructive RPCs atomically

**Files:**

- Create: `supabase/migrations/20260817183000_harden_destructive_financial_rpcs.sql`
- Test: `supabase/tests/destructive_financial_rpc_security.test.sql`

**Interfaces:**

- Consumes: Task 2 private helpers and Task 3 exact audit keys.
- Produces: unchanged public RPC signatures returning `boolean`; each successful call appends exactly one tenant audit row in the same transaction.

- [ ] **Step 1: Guard the two exact predecessors and define shared authorization order**

  Abort migration with SQLSTATE `55000` unless each exact predecessor exists exactly once and no one-argument overload exists. Both bodies must perform this order before business mutations:

  ```sql
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid := coalesce(p_organization_id, private.current_organization_id());

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Oturum açmanız gerekiyor.';
  END IF;
  IF v_org_id IS NULL OR NOT private.is_current_user_organization_member(v_org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Bu işletmede işlem yetkiniz yok.';
  END IF;
  ```

- [ ] **Step 2: Replace supplier deletion with locked, set-based compensation**

  Define `public.delete_supplier_transaction(uuid,uuid)` as `LANGUAGE plpgsql SECURITY DEFINER SET search_path=''`. Select the transaction `FOR UPDATE`; raise `P0002` with `Cari işlem bulunamadı.` if missing. Delete the target, update debt based on `invoice`/`payment`, aggregate deleted `supplier_payment` movements by account, update each matching tenant account using the reversed `cikis` total, and insert the audit last.

  ```sql
  INSERT INTO public.activity_logs (
    module, action_type, description, details, user_id, organization_id
  ) VALUES (
    'Tedarikçi',
    'SILME',
    'Tedarikçi cari işlemi silindi ve finansal etkileri geri alındı.',
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'supplier_id', v_tx.supplier_id,
      'transaction_type', v_tx.transaction_type,
      'amount', v_tx.amount,
      'account_movements_deleted', v_account_movement_count,
      'account_balance_reversed', v_account_balance_reversed
    ),
    v_user_id::text,
    v_org_id
  );
  RETURN true;
  ```

  Do not add `EXCEPTION WHEN OTHERS`; PostgreSQL already rolls the complete function statement back, and a catch-all would leak or destroy safe SQLSTATE semantics.

- [ ] **Step 3: Replace Z-report deletion with locked, set-based compensation**

  Define `public.delete_z_report_transaction(uuid,uuid)` with the same security attributes. Require the batch to exist in at least one of `stock_movements`, `sales`, `expenses`, or `account_movements` for the same tenant; otherwise raise `P0002` with `Z-Raporu bulunamadı.`. Aggregate quantities by material before restoring stock, aggregate reversal deltas by account before changing balances, capture deleted row counts with `GET DIAGNOSTICS`, then append:

  ```sql
  INSERT INTO public.activity_logs (
    module, action_type, description, details, user_id, organization_id
  ) VALUES (
    'Z-Raporu',
    'SILME',
    'Z-Raporu silindi; stok ve finansal etkiler geri alındı.',
    jsonb_build_object(
      'batch_id', p_batch_id,
      'stock_movements_deleted', v_stock_count,
      'sales_deleted', v_sales_count,
      'expenses_deleted', v_expense_count,
      'account_movements_deleted', v_account_movement_count,
      'stock_quantity_restored', v_stock_quantity_restored,
      'account_balance_reversed', v_account_balance_reversed
    ),
    v_user_id::text,
    v_org_id
  );
  RETURN true;
  ```

  Before reading or mutating batch rows, take a transaction-scoped advisory lock derived from the organization and batch IDs, then lock the matching stock, sale, expense, and account-movement rows. Do not delete any existing `activity_logs` row and do not add any test-only branch to the production function.

  ```sql
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org_id::text || ':' || p_batch_id::text, 0)
  );
  PERFORM 1 FROM public.stock_movements
  WHERE batch_id = p_batch_id AND organization_id = v_org_id FOR UPDATE;
  PERFORM 1 FROM public.sales
  WHERE batch_id = p_batch_id AND organization_id = v_org_id FOR UPDATE;
  PERFORM 1 FROM public.expenses
  WHERE batch_id = p_batch_id AND organization_id = v_org_id FOR UPDATE;
  PERFORM 1 FROM public.account_movements
  WHERE source_type = 'z_report'
    AND source_id = p_batch_id::text
    AND organization_id = v_org_id FOR UPDATE;
  ```

- [ ] **Step 4: Reassert exact ACLs and reload PostgREST**

  ```sql
  REVOKE ALL ON FUNCTION public.delete_supplier_transaction(uuid, uuid) FROM PUBLIC, anon;
  REVOKE ALL ON FUNCTION public.delete_z_report_transaction(uuid, uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.delete_supplier_transaction(uuid, uuid) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.delete_z_report_transaction(uuid, uuid) TO authenticated, service_role;
  NOTIFY pgrst, 'reload schema';
  ```

- [ ] **Step 5: Prove focused and full database GREEN from a clean replay**

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' db reset --local --no-seed
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local supabase/tests/destructive_financial_rpc_security.test.sql
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local
  ```

  Expected: destructive suite passes 40/40 and the full suite passes with zero failures. Query `pg_proc`, `aclexplode(proacl)`, and `pg_get_functiondef` to prove one exact signature each, invoker/definer flags, `search_path=''`, owner, and grants.

- [ ] **Step 6: Run local security and performance advisors**

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' inspect db lint --local --level warning
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' inspect db table-stats --local
  ```

  If CLI help shows different supported advisor commands, record the verified 2.111.0 command in the task report before running it. Do not accept a new warning without classification.

- [ ] **Step 7: Commit the atomic RPC migration**

  ```powershell
  git add -- supabase/migrations/20260817183000_harden_destructive_financial_rpcs.sql supabase/tests/destructive_financial_rpc_security.test.sql
  git commit -m "fix: harden destructive financial RPCs"
  ```

---

### Task 5: Remove duplicate client audit writes and mask technical failures

**Files:**

- Create: `src/app/api/delete-z-report/route.test.ts`
- Modify: `src/app/api/delete-z-report/route.ts`
- Modify: `src/app/dashboard/tedarikciler/page.tsx`
- Modify: `src/app/dashboard/raporlar/gecmis/page.tsx`
- Modify: `src/lib/rpc-signature.test.ts`

**Interfaces:**

- Consumes: Task 4's guarantee that each successful RPC writes one audit record atomically.
- Produces: callers that make one business RPC, never issue a second audit insert/log, and show only stable Turkish errors.

- [ ] **Step 1: Write failing route tests**

  Mock `requireUser`, `devError`, and the Supabase client. Assert a successful request calls only `rpc('delete_z_report_transaction', {p_batch_id,p_organization_id})`, never calls `from('activity_logs').insert`, and returns `{success:true}`. Assert an RPC rejection logs the technical object but responds status `500` with exactly:

  ```json
  { "error": "Z-Raporu silinemedi. Lütfen tekrar deneyin." }
  ```

  Run:

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/app/api/delete-z-report/route.test.ts
  ```

  Expected: FAIL because the route currently inserts `activity_logs` separately and returns the raw error message.

- [ ] **Step 2: Add source-boundary regression assertions for both pages**

  Extend `src/lib/rpc-signature.test.ts` to extract the source text of `handleDeleteTransaction` and the Z-report delete handler. Assert the supplier handler contains the generic text `Cari işlem silinemedi. Lütfen tekrar deneyin.`, calls `devError`, and does not contain `getErrorMessage(error)` or `logActivity(`. Assert the Z-report handler contains `Z-Raporu silinemedi. Lütfen tekrar deneyin.` and no `logActivity(`.

  Run:

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/lib/rpc-signature.test.ts
  ```

  Expected: FAIL on the raw error and duplicate audit calls.

- [ ] **Step 3: Make the route a single-RPC boundary**

  Remove the `activity_logs` insert and IP/user-agent collection. Keep `devError('Delete Z-Report Error:', error)` and replace raw exception serialization with:

  ```ts
  return NextResponse.json({ error: 'Z-Raporu silinemedi. Lütfen tekrar deneyin.' }, { status: 500 })
  ```

  Keep the existing 401 and request-validation responses because they are safe input/authentication messages.

- [ ] **Step 4: Make the pages presentation-only after success**

  In `tedarikciler/page.tsx`, remove the post-success `logActivity` call from `handleDeleteTransaction`; in the catch block call `devError('Supplier transaction delete failed:', error)` and show exactly `Cari işlem silinemedi. Lütfen tekrar deneyin.`. In `raporlar/gecmis/page.tsx`, remove its post-success `logActivity` call; log technical detail with `devError` and show exactly `Z-Raporu silinemedi. Lütfen tekrar deneyin.`.

- [ ] **Step 5: Prove focused GREEN and full application GREEN**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/app/api/delete-z-report/route.test.ts src/lib/rpc-signature.test.ts
  npm run check
  npm run build
  ```

  If the global npm shim hangs, run `.cmd` binaries directly for Prettier, ESLint, `tsc`, Vitest, and Next, and record each equivalent command. Build with only the local Supabase URL and anon key in process memory; never print or commit credentials.

- [ ] **Step 6: Commit the caller contract**

  ```powershell
  git add -- src/app/api/delete-z-report/route.ts src/app/api/delete-z-report/route.test.ts src/app/dashboard/tedarikciler/page.tsx src/app/dashboard/raporlar/gecmis/page.tsx src/lib/rpc-signature.test.ts
  git commit -m "fix: mask destructive RPC failures"
  ```

---

### Task 6: Reconcile documentation, indexes, and delivery evidence

**Files:**

- Modify: `docs/security/SEC-02-security-definer-review.md`
- Modify: `docs/superpowers/ROADMAP.md`
- Modify conditionally through tools: `.codebase-memory/artifact.json`
- Modify conditionally through tools: `.codebase-memory/graph.db.zst`
- Create ignored local report: `.superpowers/sdd/2026-08-17-security-definer-remediation/final-report.md`

**Interfaces:**

- Consumes: Tasks 1-5 commits and fresh verification evidence.
- Produces: an independently reviewable local branch with honest roadmap state; no push or production action.

- [ ] **Step 1: Re-run the entire database proof from empty local state**

  ```powershell
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' db reset --local --no-seed
  & 'C:\Users\Emrullah\AppData\Local\npm-cache\_npx\b96a6bd565c470ce\node_modules\@supabase\cli-windows-x64\bin\supabase.exe' test db --local
  ```

  Record migration count, test-file count, assertion count, and zero-failure result. Query the final 18-function classification and prove the public definer advisor set is limited to the six approved exact signatures in the design.

- [ ] **Step 2: Re-run repository gates after the final edit**

  ```powershell
  npm run check
  npm run build
  git diff --check
  ```

  Expected: format, roadmap validation, lint, types, Vitest, build, and whitespace checks pass. Existing environment-gated integration skips may remain only if their established gate is unchanged and recorded.

- [ ] **Step 3: Update the review report and roadmap without claiming deployment**

  Append to the SEC-02 report: both migration filenames, exact retained definer allowlist, wrapper/private/revoked signatures, RED failures, GREEN totals, advisor output, caller error behavior, and residual production rollout gate. Mark `SEC-02` `Yerelde tamam` only after independent review accepts the complete diff; do not mark it `Tamamlandı` until the approved migration is deployed and verified in production.

- [ ] **Step 4: Refresh Graphify and codebase-memory**

  ```powershell
  graphify update .
  ```

  Refresh codebase-memory with the existing `motto-saas` project identity and `moderate` persistence. Query for `private.current_organization_id`, `delete_supplier_transaction`, and `delete_z_report_transaction`; confirm the new migrations/tests/callers are discoverable. Do not manually edit generated artifacts, and restore them if the supported refresh reports no meaningful graph change.

- [ ] **Step 5: Perform an independent security review**

  Review the complete base-to-HEAD diff against:

  ```text
  exact ACLs and overloads
  invoker/definer/search_path catalog state
  auth.uid and active membership checks
  cross-tenant denial
  set-based financial compensation
  immutable historical audit
  audit-in-transaction rollback
  technical error masking
  migration replay and advisor evidence
  no live or unrelated changes
  ```

  Any Critical or Important finding returns to RED/GREEN implementation and requires a separate fix commit plus re-review.

- [ ] **Step 6: Write the ignored report and commit documentation**

  Write the exact commands/results, known Windows Husky `/bin/bash` limitation, local-only status, and production rollout prerequisites in the ignored report. Then:

  ```powershell
  git add -- docs/security/SEC-02-security-definer-review.md docs/superpowers/ROADMAP.md .codebase-memory/artifact.json .codebase-memory/graph.db.zst
  .\node_modules\.bin\lint-staged.cmd
  git diff --cached --check
  git commit -m "docs: record security definer remediation"
  ```

  Include generated graph files only when changed by supported refresh. If the Husky shell hook alone cannot start on Windows, use `git commit --no-verify` only after the manual staged hook and staged diff checks pass, and record that evidence.

- [ ] **Step 7: Stop before external delivery**

  Report the local commit hashes, clean/dirty state, database/application gate totals, advisor residuals, and exact production prerequisites. Do not push, open a PR, merge, deploy, or apply linked migrations until the user grants that separate authority.

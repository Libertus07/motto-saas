# Supabase and Postgres Guidelines

These instructions apply to `supabase/` and extend the repository contract in
the root `AGENTS.md`. This project uses imperative, timestamped migrations under
`supabase/migrations/`; `schema_paths` is currently empty.

## Migration Workflow

- Treat checked-in migrations as the reproducible source of truth. Do not make a
  live-only schema change or rely on a dashboard edit that cannot be replayed.
- Create each schema change as a new, timestamped SQL file in
  `supabase/migrations/`. Keep migrations flat in that directory; do not create a
  separate `migrations/functions/` history.
- Never rewrite a migration that may already have been applied to a shared or
  production environment. Add a forward-only corrective migration instead.
- Make migrations deterministic, reviewable, and safe on the expected prior
  schema. Use explicit object names and schema qualification.
- Pair destructive or irreversible operations with an explicit data-preservation
  and rollback/forward-recovery plan. Never delete production data merely to make
  a migration pass.
- Keep client calls, generated/declared TypeScript contracts, tests, and
  documentation synchronized with schema or RPC changes.

## Tenant Isolation and Authorization

- Enable RLS on every table in an exposed schema. A grant makes an object
  reachable; RLS determines which rows are reachable. Review both.
- Scope tenant-owned rows by verified organization membership. `TO authenticated`
  alone is not authorization. Do not trust a client-provided
  `p_organization_id` without checking membership against `auth.uid()` inside the
  policy or function.
- `UPDATE` policies need a compatible `SELECT` policy and both `USING` and
  `WITH CHECK` predicates. Test cross-tenant reads and writes explicitly.
- Never use editable `user_metadata` for authorization. Use server-controlled
  membership data or appropriate `app_metadata`, accounting for JWT refresh
  behavior.
- Prefer `SECURITY INVOKER`. When `SECURITY DEFINER` is genuinely necessary,
  document why, set a safe explicit `search_path`, validate the authenticated
  caller and tenant, schema-qualify objects, revoke default `PUBLIC` execute, and
  grant only the required roles.
- Views exposed through the API must obey caller security (for supported Postgres
  versions, use `security_invoker = true`) or be moved/revoked from exposed
  schemas.
- Never expose `service_role`, database passwords, or other secrets to browser
  code or committed SQL fixtures.

## Functions, RPCs, and Transactions

- Treat an RPC name plus its parameter names/types as a public API contract.
  Client argument keys must exactly match the deployed function signature.
- Avoid ambiguous overloads exposed through PostgREST. When changing a function
  signature, deliberately drop/replace obsolete overloads, update all callers,
  and verify schema-cache-visible behavior.
- Use one atomic database transaction/RPC for a business action that changes
  multiple related tables. Do not orchestrate partial multi-table writes from the
  browser.
- Validate quantities, monetary values, identifiers, ownership, and allowed state
  transitions inside the trusted boundary. Fail the transaction as a unit.
- Record the required audit event for successful mutations. For compound actions,
  prefer writing the business mutation and its audit record in the same
  transaction; otherwise follow the established `logActivity` contract without
  masking a successful write as a failed one.
- Return the smallest stable result contract needed by the client. Do not expose
  internal authorization or diagnostic details.

## SQL Quality and Performance

- Use schema-qualified references and set-based SQL. Avoid per-row loops and
  repeated policy subqueries when a safe indexed predicate or `(select auth.uid())`
  pattern is appropriate.
- Index foreign keys and tenant/filter columns based on actual query and policy
  paths. Do not add speculative or duplicate indexes.
- Use constraints for invariants that must hold regardless of caller. Name
  constraints, policies, indexes, triggers, and functions descriptively.
- Preserve least privilege. Explicitly review grants for tables, sequences,
  views, and functions after changing exposed objects.

## Verification

For every database change:

1. Review the current Supabase documentation/changelog relevant to the change.
2. Start or reset the local Supabase stack from migrations when practical.
3. Test the intended authenticated tenant path.
4. Test unauthenticated and cross-tenant denial paths.
5. Exercise changed RPCs using the exact client parameter names.
6. Verify atomic rollback for a forced mid-operation failure when applicable.
7. Run database tests under `supabase/tests/` and relevant application tests.
8. Run Supabase/Postgres advisors when available and review security and
   performance findings rather than accepting them blindly.
9. Run the repository quality gate and production build when application
   contracts changed.

Never declare a database fix complete based only on static SQL review. If a live
environment cannot be safely accessed, state which local checks ran and which
deployment verification remains.

## Database Review Checklist

Flag migrations that can cause tenant leakage, rely on browser authorization,
expose privileged functions, leave old RPC overloads callable, perform partial
multi-table writes, omit audit records, weaken RLS, introduce unindexed policy
paths, change live schema without migration history, or lack positive and denial
tests. Explain the failure mode and the safe migration pattern.

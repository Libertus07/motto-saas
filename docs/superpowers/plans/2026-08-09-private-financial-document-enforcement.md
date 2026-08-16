# Private Financial Document Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two production financial-document buckets private while preserving every supported document flow and enforcing tenant-scoped signed access.

**Architecture:** Bucket configuration supplies the outer private/size/MIME boundary. Existing path-aware database helpers and four operation-specific RLS policies remain the stricter inner boundary for organization, document kind, extension, MIME, ownership, and size. The rollout is forward-only, backup-gated, TDD-driven, and verified locally before one exact production migration.

**Tech Stack:** Supabase CLI `2.111.0`, PostgreSQL 17, Supabase Storage/RLS, pgTAP, Next.js/TypeScript/Vitest, PowerShell/Windows DPAPI.

## Global Constraints

- Target only Supabase project `zahdmrvhxsmqpeesrfkt` and Vercel project `prj_M4FNu5TW4yZXE8s746Eae3xMNqmH` under team `team_bARJVzxMCMrSBx1pugvzyhUZ`.
- Do not move, copy, convert, or delete customer documents.
- Do not directly mutate `storage.objects` in the migration or create custom objects in the managed `storage` schema.
- Keep the exact stable-reference contract `organization-uuid/document-kind/random-uuid.mime-derived-extension`.
- Keep `motto_assets` at 3 MiB and `receipts` at 10 MiB.
- Keep XML, JSON, XLS, and XLSX support for supplier receipts and Z reports.
- Keep investment receipts and investment documents restricted to JPEG, PNG, WebP, and PDF through the existing path-aware validator.
- Never make a bucket public as a routine rollback; use a forward policy/configuration correction.
- Never persist secrets, connection strings, signed URLs, document bytes, or raw customer rows in Git or reports.
- Use only `apply_patch` for tracked file edits and the pinned CLI for migration generation and database commands.

---

### Task 1: Synchronize release authority and add enforcement RED tests

**Files:**

- Modify: `docs/superpowers/plans/2026-08-07-private-financial-document-storage.md`
- Modify: `supabase/tests/private_financial_documents.test.sql`
- Modify: `supabase/tests/advisor_security_hardening.test.sql`
- Record only: `.superpowers/sdd/2026-08-07-private-financial-document-storage/task-8-live-report.md` (ignored)

**Interfaces:**

- Consumes: approved design `docs/superpowers/specs/2026-08-09-private-financial-document-enforcement-design.md`.
- Produces: executable pgTAP contract for final bucket configuration and policy removal.

- [x] **Step 1: Record the explicit Task 8 approval and correct the original MIME requirement**

Mark completed Task 7 evidence boxes only where the live report already proves completion. Mark the explicit Task 8 approval box complete with the 2026-08-09 approval record. Replace the original `motto_assets` four-MIME requirement with the approved nine-MIME union while retaining the 3 MiB limit and the stricter per-kind validator requirement.

- [x] **Step 2: Add two failing bucket-contract assertions**

Increase `private_financial_documents.test.sql` from `plan(54)` to `plan(56)` and add literal assertions equivalent to:

```sql
SELECT is(
    (
        SELECT jsonb_build_array(public, file_size_limit, allowed_mime_types)
        FROM storage.buckets
        WHERE id = 'motto_assets'
    ),
    jsonb_build_array(
        false,
        3145728::bigint,
        ARRAY[
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
            'application/xml', 'text/xml', 'application/json',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]::text[]
    ),
    'motto_assets is private and keeps the exact supported 3 MiB MIME contract'
);

SELECT is(
    (
        SELECT jsonb_build_array(public, file_size_limit, allowed_mime_types)
        FROM storage.buckets
        WHERE id = 'receipts'
    ),
    jsonb_build_array(
        false,
        10485760::bigint,
        ARRAY[
            'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
            'application/xml', 'text/xml', 'application/json',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ]::text[]
    ),
    'receipts is private and keeps the exact supported 10 MiB MIME contract'
);
```

These tests catch a public bucket, wrong byte limit, missing structured format, unsupported added format, or order drift in the persisted allowlist.

- [x] **Step 3: Expand the existing legacy-policy denial assertion**

Keep `advisor_security_hardening.test.sql` at `plan(9)` and replace the existing two-name query with all six prohibited names:

```sql
AND policyname IN (
    'Giris Yapanlar Yukleyebilir',
    'Sahibi Guncelleyebilir',
    'Sahibi Silebilir',
    'Allow Uploads 1lnm9mj_0',
    'Allow Uploads 1lnm9mj_1',
    'Public Okuma Izinleri'
)
```

The existing exact-four-policy assertion remains unchanged and proves the tenant policies survive.

- [x] **Step 4: Run RED and record the expected failures**

Run:

```text
npx supabase@2.111.0 test db --local supabase/tests/private_financial_documents.test.sql supabase/tests/advisor_security_hardening.test.sql
```

Expected: exactly the two bucket assertions and the broad-policy assertion fail because both buckets are public/unlimited and four broad policies still exist. Any parser/setup error or unrelated failure must be fixed before proceeding.

- [x] **Step 5: Commit the RED contract and plan correction**

```text
git add -- docs/superpowers/plans/2026-08-07-private-financial-document-storage.md supabase/tests/private_financial_documents.test.sql supabase/tests/advisor_security_hardening.test.sql
git commit -m "test: define private financial bucket enforcement"
```

---

### Task 2: Generate and implement the forward-only enforcement migration

**Files:**

- Create via CLI: the exact `supabase/migrations/*_enforce_private_financial_documents.sql` path printed by `migration new`

**Interfaces:**

- Consumes: the Task 1 pgTAP contract and the existing four financial-document policies.
- Produces: one replayable migration containing bucket configuration and legacy-policy removal only.

- [x] **Step 1: Generate the migration filename with pinned CLI**

Run:

```text
npx supabase@2.111.0 migration new enforce_private_financial_documents
```

Use the exact emitted filename. Do not invent or rename its timestamp.

- [x] **Step 2: Implement the minimal bucket update**

Write the following shape with schema qualification and deterministic literals:

```sql
DO $migration$
DECLARE
    updated_bucket_count integer;
BEGIN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
        (
            'motto_assets', 'motto_assets', false, 3145728,
            ARRAY[
                'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
                'application/xml', 'text/xml', 'application/json',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]::text[]
        ),
        (
            'receipts', 'receipts', false, 10485760,
            ARRAY[
                'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
                'application/xml', 'text/xml', 'application/json',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]::text[]
        )
    ON CONFLICT (id)
    DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

    GET DIAGNOSTICS updated_bucket_count = ROW_COUNT;
    IF updated_bucket_count <> 2 THEN
        RAISE EXCEPTION 'Expected to enforce exactly two financial document buckets, wrote %',
            updated_bucket_count;
    END IF;
END;
$migration$;
```

- [x] **Step 3: Remove only the known broad financial policies**

Use exactly:

```sql
DROP POLICY IF EXISTS "Giris Yapanlar Yukleyebilir" ON storage.objects;
DROP POLICY IF EXISTS "Sahibi Guncelleyebilir" ON storage.objects;
DROP POLICY IF EXISTS "Sahibi Silebilir" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads 1lnm9mj_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads 1lnm9mj_1" ON storage.objects;
DROP POLICY IF EXISTS "Public Okuma Izinleri" ON storage.objects;
```

Do not touch the four policies beginning `Financial documents can be ...` or organization-branding policies. Do not mutate object rows.

- [x] **Step 4: Reset the local stack and verify GREEN**

Run:

```text
npx supabase@2.111.0 db reset --local
npx supabase@2.111.0 test db --local
npx supabase@2.111.0 db lint --local --schema public,private,storage --level warning --fail-on error
```

Expected: every pgTAP file passes; the two buckets have exact configuration; all six legacy names are absent; the exact four tenant policies remain.

- [x] **Step 5: Review migration safety and commit GREEN**

Verify the migration contains no `storage.objects` DML, no custom `storage` function/table, no object move/delete, and no unrelated policy. Then:

Copy the exact path printed by `migration new`, verify it is the only untracked migration, stage that literal path, and commit with:

```text
git commit -m "feat: enforce private financial document buckets"
```

---

### Task 3: Complete local verification and create a fresh recovery artifact

**Files:**

- Update: `.superpowers/sdd/2026-08-07-private-financial-document-storage/task-8-live-report.md` (ignored)
- Create outside Git/workspace from `$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')`: `C:\Users\Emrullah\Documents\Motto SaaS Backups\private-financial-documents\motto-saas-enforcement-$stamp.zip.dpapi`
- Create outside Git/workspace: matching redacted manifest JSON

**Interfaces:**

- Consumes: Task 2 migration and the current production database.
- Produces: reproducible local quality evidence plus a fresh encrypted, restore-tested logical backup.

- [x] **Step 1: Run the full local database and application gates**

Run `npm run check`, the full local pgTAP suite, local security/performance advisors, targeted Prettier/diff checks, and `npm run build`. Record the known `/dashboard/kasa/sayim` missing-env prerender boundary only if compile and TypeScript pass and the same unrelated environment condition remains.

- [x] **Step 2: Export a fresh logical backup outside the repository**

Using the verified live session-pooler connection assembled in memory from the ignored local environment file, export roles, Auth data, public/private schemas, and public/private data with Supabase CLI `2.111.0`. Do not echo the connection string or password. Write plaintext only to a newly created temporary directory outside the repository.

- [x] **Step 3: Encrypt and validate the artifact**

Zip the dump files, compute SHA-256, encrypt the archive with Windows DPAPI `CurrentUser` plus a versioned project-specific entropy value, write a redacted manifest, immediately decrypt to memory, and assert the plaintext hash matches. Clear plaintext byte arrays and delete plaintext staging files after verification.

- [x] **Step 4: Restore into an isolated local database**

Restore roles, schemas, Auth data, and public/private data into a disposable local database. Compare table inventory, aggregate row counts, constraints, both migration records, bucket configuration baseline, and the four document-column reference distributions. Destroy the disposable database and plaintext files; retain only the DPAPI artifact and manifest.

- [x] **Step 5: Record recovery ownership and limitations**

Record the Windows restore owner, retention review date, encrypted/plain hashes, restore result, and the fact that logical database backups contain Storage metadata but not underlying object bytes. Do not record secrets or customer rows.

---

### Task 4: Apply one exact migration to the approved production target

**Files:**

- Update: `.superpowers/sdd/2026-08-07-private-financial-document-storage/task-8-live-report.md` (ignored)

**Interfaces:**

- Consumes: clean commits, fresh backup evidence, exact linked target, and local GREEN gates.
- Produces: private production buckets with preserved objects and tenant policies.

- [x] **Step 1: Reconfirm immutable target and baseline**

Confirm Supabase project name/ref/org/region/health, Vercel project/team/deployment commit, local branch HEAD, remote migration list, bucket/object counts, exact policies, advisors, and one-hour Storage/API/Vercel error baseline. Stop on any drift.

- [x] **Step 2: Run exact linked dry-run**

Run:

```text
npx supabase@2.111.0 migration list --linked
npx supabase@2.111.0 db push --linked --dry-run
```

Expected: the dry-run lists exactly one migration, the CLI-generated `enforce_private_financial_documents` file. Any other migration is NO-GO.

- [x] **Step 3: Apply the approved migration**

Run:

```text
npx supabase@2.111.0 db push --linked --yes
npx supabase@2.111.0 migration list --linked
```

Record timestamps and redacted output. Do not repair migration history or run ad hoc reverse SQL.

- [x] **Step 4: Verify the production catalog immediately**

Read-only checks must prove exact private/limit/MIME configuration, absence of all six broad policies, presence of the exact four tenant policies, unchanged object counts, unchanged stable-reference hashes, and no new advisor finding attributable to enforcement.

---

### Task 5: Run production security smoke, observation, and delivery review

**Files:**

- Modify: `docs/superpowers/plans/2026-08-07-private-financial-document-storage.md` (completed boxes only)
- Modify generated graph artifacts only through their tools if functional source/SQL edges changed
- Update ignored Task 8 report

**Interfaces:**

- Consumes: Task 4 private production buckets.
- Produces: final GO/NO-GO evidence and a reviewable delivery commit history.

- [ ] **Step 1: Verify authorized production behavior**

Post-enforcement signed previews were verified for all four existing document kinds on desktop. The plan remains open for a fresh post-enforcement upload plus the explicit mobile/download/open-in-new-tab matrix.

With the synthetic tenant and test document, verify supplier receipt, Z report, investment receipt, and investment document upload/history/signed-preview behavior. Verify desktop/mobile initial preview, download, and open-in-new-tab behavior without persisting signed URLs.

- [x] **Step 2: Verify denial boundaries**

Use rollback-only database security fixtures and safe HTTP/browser probes to prove outsider, suspended, anonymous, wrong-tenant, traversal, wrong-kind, unsupported-MIME, and oversize requests are denied. Do not create persistent synthetic memberships or customer-facing rows.

- [x] **Step 3: Verify private access semantics**

Confirm a copied raw public object URL now fails without authorization while the application obtains a short-lived signed URL for an authorized active member. Confirm existing legacy references remain unchanged in the database.

- [x] **Step 4: Observe release health**

Compare Supabase Storage/API/Postgres and Vercel runtime errors with the pre-apply baseline. Any new authorization regression, 5xx cluster, legitimate signed-access failure, object-count drift, or reference-hash drift is NO-GO and triggers a forward-fix decision.

- [x] **Step 5: Refresh architecture evidence and perform final review**

Run `graphify update .`, refresh codebase-memory in fast persistent mode, restore incidental generated changes that are not intended for commit, run `git diff --check`, inspect every Task 8 commit, and keep the worktree clean.

- [ ] **Step 6: Record final GO and delivery state**

Mark only proven Task 7/8 plan boxes complete, record migration/backup/test/observation evidence without secrets, and report commit/push/deployment status separately. Do not merge to the main branch without separate authorization.

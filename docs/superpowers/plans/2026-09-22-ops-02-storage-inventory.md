# OPS-02 Storage Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, secret-safe inventory tool that reconciles Supabase Storage metadata with every durable financial-document reference before any physical backup or restore work begins.

**Architecture:** A pure contract module canonicalizes `storage://` references, pseudonymizes object identities with HMAC-SHA256, and produces a deterministic aggregate manifest. A PostgreSQL adapter reads bucket, object, and reference metadata through an explicitly read-only transaction with keyset pagination; a separate CLI validates production scope and writes the manifest atomically outside the repository. A Windows wrapper loads a dedicated DPAPI-protected inventory key without exposing it in source, logs, or command arguments.

**Tech Stack:** Node.js 22+, ECMAScript modules, existing `pg` dependency, Vitest, PowerShell 5.1+, Supabase Postgres/Storage metadata.

**Spec:** `docs/security/OPS-02-storage-backup-design.md`

## Global Constraints

- This plan inventories metadata only; it does not download object bytes and cannot prove that a physical backup exists.
- Production access is read-only. Every database session must enter `BEGIN TRANSACTION READ ONLY` before querying application or `storage` schemas.
- Never write directly to `storage.objects` or `storage.buckets`.
- Never print database URLs, passwords, S3 credentials, raw object paths, organization IDs, document URLs, or the inventory HMAC key.
- The output path is mandatory and must resolve outside the Git repository and every linked worktree.
- The manifest uses schema version `motto-saas-storage-inventory-v1` and marks `physical_bytes_verified: false`.
- The target project reference is exactly `zahdmrvhxsmqpeesrfkt`; a different target fails closed.
- Inventory identities use a dedicated, DPAPI-protected key. The production database backup-attestation key is not reused.
- No package dependency is added; use the repository's existing `pg` and Vitest packages.
- Production execution, S3 key creation, object copying, deletion, restore, push, merge, and deploy remain outside this plan.

## Review Focus

- Malformed or traversal-bearing `storage://` values must be classified as invalid without leaking the original value; Task 1 tests this.
- Duplicate object rows or references must not inflate reconciliation counts; Task 1 tests deterministic deduplication.
- A connection that is not actually read-only must stop before inventory queries run; Task 2 tests the transaction guard.
- Pagination boundaries must neither skip nor repeat `(bucket_id, name)` rows; Task 2 tests multi-page keyset traversal.
- Output inside the repository, partial output after failure, or secret-bearing output must be rejected; Task 3 tests path containment, atomic write cleanup, and redaction.

---

### Task 1: Deterministic inventory contract

**Files:**

- Create: `scripts/security/storage-inventory-contract.mjs`
- Create: `scripts/security/storage-inventory-contract.test.ts`

**Interfaces:**

- Consumes: bucket rows `{ id, public, file_size_limit, allowed_mime_types }`, object rows `{ bucket_id, name, size_bytes, updated_at }`, and reference rows `{ source_table, source_id, organization_id, document_url }`.
- Produces: `parseStorageReference(value)`, `createIdentityHasher(key)`, and `buildStorageInventory({ projectRef, capturedAt, buckets, objects, references, hashIdentity })`.

- [ ] **Step 1: Write failing reference and manifest tests**

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { buildStorageInventory, createIdentityHasher, parseStorageReference } from './storage-inventory-contract.mjs'

describe('OPS-02 storage inventory contract', () => {
  it.each([
    'storage://motto_assets/../secret.pdf',
    'storage://motto_assets/a//b.pdf',
    'storage://motto_assets/a%2F..%2Fsecret.pdf',
    'https://example.com/file.pdf',
  ])('rejects an unsafe durable reference without echoing it: %s', (value) => {
    expect(parseStorageReference(value)).toEqual({ status: 'invalid' })
  })

  it('builds stable deduplicated reconciliation counts and pseudonymous identities', () => {
    const key = Buffer.alloc(32, 7)
    const hashIdentity = createIdentityHasher(key)
    const expectedId = createHmac('sha256', key)
      .update('motto_assets\u0000org-a/investment-document/a.pdf')
      .digest('hex')

    const manifest = buildStorageInventory({
      projectRef: 'zahdmrvhxsmqpeesrfkt',
      capturedAt: '2026-09-22T12:00:00.000Z',
      hashIdentity,
      buckets: [
        { id: 'motto_assets', public: false, file_size_limit: 3145728, allowed_mime_types: ['application/pdf'] },
      ],
      objects: [
        {
          bucket_id: 'motto_assets',
          name: 'org-a/investment-document/a.pdf',
          size_bytes: 12,
          updated_at: '2026-09-22T11:00:00.000Z',
        },
        {
          bucket_id: 'motto_assets',
          name: 'org-a/investment-document/a.pdf',
          size_bytes: 12,
          updated_at: '2026-09-22T11:00:00.000Z',
        },
      ],
      references: [
        {
          source_table: 'investments',
          source_id: 'row-1',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/org-a/investment-document/a.pdf',
        },
        {
          source_table: 'investments',
          source_id: 'row-1',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/org-a/investment-document/a.pdf',
        },
      ],
    })

    expect(manifest).toMatchObject({
      schema_version: 'motto-saas-storage-inventory-v1',
      project_ref: 'zahdmrvhxsmqpeesrfkt',
      physical_bytes_verified: false,
      totals: {
        buckets: 1,
        objects: 1,
        references: 1,
        referenced_missing_objects: 0,
        unreferenced_objects: 0,
        invalid_references: 0,
      },
      referenced_missing_object_ids: [],
      unreferenced_object_ids: [],
    })
    expect(manifest.object_ids).toEqual([expectedId])
    expect(JSON.stringify(manifest)).not.toContain('org-a')
    expect(JSON.stringify(manifest)).not.toContain('a.pdf')
  })
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/storage-inventory-contract.test.ts`

Expected: FAIL because `storage-inventory-contract.mjs` does not exist.

- [ ] **Step 3: Implement canonical parsing, HMAC identity, deduplication, and deterministic sorting**

```js
import { createHmac } from 'node:crypto'

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const SAFE_SEGMENT_PATTERN = /^[^/\\?#%\u0000-\u001f]+$/u

export function parseStorageReference(value) {
  if (typeof value !== 'string' || !value.startsWith('storage://')) return { status: 'invalid' }
  const remainder = value.slice('storage://'.length)
  const slash = remainder.indexOf('/')
  if (slash < 1) return { status: 'invalid' }
  const bucket = remainder.slice(0, slash)
  const path = remainder.slice(slash + 1)
  const segments = path.split('/')
  if (!SAFE_SEGMENT_PATTERN.test(bucket) || segments.length === 0) return { status: 'invalid' }
  if (segments.some((segment) => !SAFE_SEGMENT_PATTERN.test(segment) || segment === '.' || segment === '..')) {
    return { status: 'invalid' }
  }
  return { status: 'storage', bucket, path: segments.join('/') }
}

export function createIdentityHasher(key) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('inventory_hmac_key_invalid')
  return (bucket, objectPath) => createHmac('sha256', key).update(`${bucket}\u0000${objectPath}`).digest('hex')
}
```

Implement `buildStorageInventory` so it:

- validates the exact project ref and ISO-8601 capture time;
- deduplicates objects by `bucket_id + NUL + name` and references by `source_table + NUL + source_id`;
- reports conflicting duplicate object metadata as `conflicting_object_rows` instead of silently selecting a value;
- classifies `data:` and approved legacy public URLs separately from invalid values;
- emits only aggregate bucket facts and HMAC identities, never raw paths, URLs, row IDs, or organization IDs;
- sorts every array lexicographically so identical input produces byte-stable JSON.

- [ ] **Step 4: Add failure-mode tests and confirm GREEN**

Add tests for conflicting duplicates, missing objects, unreferenced objects, `data:` legacy rows, approved Supabase public URLs, invalid project refs, short keys, and shuffled input order.

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/storage-inventory-contract.test.ts`

Expected: PASS with all Task 1 cases.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- scripts/security/storage-inventory-contract.mjs scripts/security/storage-inventory-contract.test.ts
git commit -m "feat: define storage inventory contract"
```

### Task 2: Read-only PostgreSQL inventory adapter

**Files:**

- Create: `scripts/security/storage-inventory-postgres.mjs`
- Create: `scripts/security/storage-inventory-postgres.test.ts`

**Interfaces:**

- Consumes: an existing `pg.Client`-compatible object and `{ pageSize }`.
- Produces: `collectStorageInventoryRows(client, { pageSize })` returning `{ buckets, objects, references }` only after a verified read-only transaction.

- [ ] **Step 1: Write failing transaction and pagination tests**

Create a scripted fake client that records SQL and returns two object pages plus two reference pages. Assert:

```ts
expect(client.sql[0]).toBe('BEGIN TRANSACTION READ ONLY')
expect(client.sql[1]).toContain("SET LOCAL statement_timeout = '30s'")
expect(client.sql[2]).toBe('SHOW transaction_read_only')
expect(result.objects.map((row) => `${row.bucket_id}/${row.name}`)).toEqual([
  'motto_assets/a.pdf',
  'motto_assets/b.pdf',
  'receipts/c.pdf',
])
expect(client.sql.at(-1)).toBe('COMMIT')
```

Add a test where `SHOW transaction_read_only` returns `off`; assert rejection with `read_only_transaction_required`, `ROLLBACK`, and zero inventory queries.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/storage-inventory-postgres.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the adapter with exact query boundaries**

Use these read surfaces:

```sql
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;
```

Objects use keyset pagination ordered by `(bucket_id, name)` and never `OFFSET`:

```sql
SELECT bucket_id,
       name,
       CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END AS size_bytes,
       updated_at
FROM storage.objects
WHERE ($1::text IS NULL)
   OR bucket_id > $1
   OR (bucket_id = $1 AND name > $2)
ORDER BY bucket_id, name
LIMIT $3;
```

References are a fixed source-code-owned union, not a dynamic schema scan:

```sql
SELECT source_table, source_id, organization_id, document_url
FROM (
  SELECT 'investments'::text AS source_table, id::text AS source_id, organization_id::text, document_url FROM public.investments WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'investment_transactions', id::text, organization_id::text, document_url FROM public.investment_transactions WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'sales', id::text, organization_id::text, document_url FROM public.sales WHERE document_url IS NOT NULL
  UNION ALL
  SELECT 'stock_movements', id::text, organization_id::text, document_url FROM public.stock_movements WHERE document_url IS NOT NULL
) AS document_references
WHERE ($1::text IS NULL)
   OR source_table > $1
   OR (source_table = $1 AND source_id > $2)
ORDER BY source_table, source_id
LIMIT $3;
```

Use the same validated keyset page size for objects and references. Always `ROLLBACK` on error. Validate `pageSize` as an integer from `1` through `5000`. Do not log query parameters or returned rows.

- [ ] **Step 4: Run adapter tests and confirm GREEN**

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/storage-inventory-postgres.test.ts`

Expected: PASS, including read-only refusal, rollback, multi-page object coverage, and multi-page reference coverage.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- scripts/security/storage-inventory-postgres.mjs scripts/security/storage-inventory-postgres.test.ts
git commit -m "feat: add read-only storage inventory adapter"
```

### Task 3: Secret-safe inventory CLI and Windows wrapper

**Files:**

- Create: `scripts/security/create-storage-inventory.mjs`
- Create: `scripts/security/create-storage-inventory.test.ts`
- Create: `scripts/security/Initialize-StorageInventoryKey.ps1`
- Create: `scripts/security/New-StorageInventory.ps1`
- Modify: `package.json`

**Interfaces:**

- Consumes environment variables `OPS02_DATABASE_URL`, `OPS02_TARGET_PROJECT_REF`, `OPS02_CAPTURED_AT_UTC`, `OPS02_INVENTORY_HMAC_KEY`, and `OPS02_OUTPUT_FILE`.
- Produces one atomically written JSON manifest and one single-line redacted JSON status record on stdout.

- [ ] **Step 1: Write failing CLI boundary tests**

Use a temporary directory and a child process. Cover:

- missing variables return `{ status: 'FAIL', code: 'required_value_missing' }`;
- a project ref other than `zahdmrvhxsmqpeesrfkt` returns `target_project_mismatch` before connecting;
- an output path under the repository or `.worktrees` returns `unsafe_output_path`;
- an invalid base64 or shorter-than-32-byte key returns `inventory_hmac_key_invalid`;
- a simulated adapter failure leaves no final file and removes the temporary file;
- success prints counts and manifest SHA-256 only, with no URL, password, key, organization ID, or object path.

- [ ] **Step 2: Run the CLI test and confirm RED**

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/create-storage-inventory.test.ts`

Expected: FAIL because the CLI does not exist.

- [ ] **Step 3: Implement fail-closed validation and atomic output**

The CLI must:

1. validate all inputs before importing or constructing `pg.Client`;
2. resolve the Git common directory and reject output within its parent repository or any linked worktree path returned by `git worktree list --porcelain`;
3. connect with `application_name=motto-saas-ops02-readonly-inventory` and a 10-second connection timeout;
4. collect rows through Task 2 only;
5. build the Task 1 manifest;
6. write UTF-8 JSON to `${resolvedOutput}.tmp-${process.pid}` using mode `0600`, `fsync`, close, then rename;
7. hash the final manifest and print only `{ status, schema_version, captured_at_utc, buckets, objects, references, manifest_sha256, output_file_name }`;
8. zero the decoded key buffer and close the database client in `finally`.

Add this package script:

```json
"ops:storage-inventory": "node scripts/security/create-storage-inventory.mjs"
```

- [ ] **Step 4: Implement dedicated DPAPI key wrappers**

`Initialize-StorageInventoryKey.ps1` follows the existing backup-attestation initializer but writes only to:

```powershell
Join-Path $env:LOCALAPPDATA 'MottoSaaS\storage-inventory-hmac-key.dpapi'
```

It refuses overwrite and requires at least 32 decoded bytes. `New-StorageInventory.ps1` unprotects that key, sets process-scoped variables, invokes the Node CLI, restores all previous environment values in `finally`, and clears plaintext key bytes. It requires `-DatabaseUrl`, `-OutputFile`, and `-CapturedAtUtc`; the URL must never be written to output.

- [ ] **Step 5: Run CLI tests and confirm GREEN**

Run: `.\node_modules\.bin\vitest.cmd run scripts/security/create-storage-inventory.test.ts scripts/security/storage-inventory-contract.test.ts scripts/security/storage-inventory-postgres.test.ts`

Expected: PASS with no secret values in stdout/stderr snapshots.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- package.json scripts/security/create-storage-inventory.mjs scripts/security/create-storage-inventory.test.ts scripts/security/Initialize-StorageInventoryKey.ps1 scripts/security/New-StorageInventory.ps1
git commit -m "feat: add secure storage inventory command"
```

### Task 4: Local Supabase proof and operator runbook

**Files:**

- Create: `tests/storage-inventory.integration.test.ts`
- Create: `docs/security/OPS-02-storage-inventory-runbook.md`
- Modify: `docs/security/OPS-02-storage-backup-design.md`
- Modify: `docs/superpowers/ROADMAP.md`

**Interfaces:**

- Consumes: the Task 3 CLI against local Supabase only.
- Produces: repeatable evidence that the database session is read-only and reconciliation works; no production inventory is generated by this task.

- [ ] **Step 1: Write the gated local integration test**

The suite runs only when `RUN_OPS02_STORAGE_INTEGRATION=true`, `TEST_DATABASE_URL`, `TEST_SUPABASE_URL`, and `TEST_SUPABASE_SERVICE_ROLE_KEY` are present. In test setup:

1. create one uniquely named local-only organization through the admin PostgreSQL client;
2. upload two uniquely prefixed byte fixtures to the existing local `motto_assets` bucket through the official Storage API, never through direct `storage.objects` writes;
3. insert two local-only `public.investments` rows, one referencing an uploaded object and one referencing a deliberately absent object;
4. invoke `collectStorageInventoryRows` with a second PostgreSQL client.

Assert:

- `SHOW transaction_read_only` was `on` inside the collector;
- the `motto_assets` bucket appears without assuming that unrelated local buckets are absent;
- one referenced object, one deliberately missing reference, and one unreferenced object reconcile correctly;
- raw synthetic organization IDs and object paths do not appear in the manifest;
- teardown removes both uploaded objects through the Storage API and deletes only the uniquely identified investment and organization rows through the admin client.

- [ ] **Step 2: Run local Supabase and the integration proof**

Discover the installed CLI first:

```powershell
npx supabase --version
npx supabase start --help
```

Start local Supabase using the repository's pinned/approved CLI path. Capture `supabase status -o env` into process memory, map only the three required local values, and never write them to a committed file:

```powershell
$statusLines = npx supabase status -o env
foreach ($line in $statusLines) {
    if ($line -match '^([A-Z_]+)="?(.*?)"?$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
$env:RUN_OPS02_STORAGE_INTEGRATION = 'true'
$env:TEST_DATABASE_URL = $env:DB_URL
$env:TEST_SUPABASE_URL = $env:API_URL
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = $env:SERVICE_ROLE_KEY
.\node_modules\.bin\vitest.cmd run tests/storage-inventory.integration.test.ts
```

Expected: PASS. Production project ref, production database URL, and hosted Storage are not used.

- [ ] **Step 3: Write the runbook with explicit stop conditions**

Document:

- prerequisites, dedicated key custody, and external output directory;
- local proof command and expected redacted output fields;
- production preflight requiring separate authorization;
- stop conditions: target mismatch, read-only guard failure, invalid references, conflicting duplicates, missing referenced objects, incomplete pages, or any secret/path in logs;
- evidence handling: encrypted raw manifest outside Git and only aggregate counts plus SHA-256 in the release record;
- the explicit statement that this inventory is not a physical backup and does not authorize S3 copy or restore.

- [ ] **Step 4: Update design and roadmap truthfully**

Link the runbook from the design. Keep `OPS-02` as `Devam ediyor`; record only “read-only inventory tooling locally verified.” Do not claim object-byte backup, restore proof, production execution, push, merge, or deployment.

- [ ] **Step 5: Run the full verification gate**

```powershell
npm run format:check
npm run roadmap:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit `0`. If the system npm shim is broken, invoke the same workspace binaries through the configured bundled Node runtime; do not weaken checks.

- [ ] **Step 6: Refresh architecture artifacts after code changes**

Run `graphify update .`, verify graph health, then refresh codebase-memory through its MCP workflow. Generated artifacts must describe this branch and current HEAD; do not copy artifacts from another checkout.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- tests/storage-inventory.integration.test.ts docs/security/OPS-02-storage-inventory-runbook.md docs/security/OPS-02-storage-backup-design.md docs/superpowers/ROADMAP.md .codebase-memory/artifact.json .codebase-memory/graph.db.zst
git commit -m "docs: verify OPS-02 storage inventory workflow"
```

## Completion Boundary

Completing this plan proves only that Motto SaaS can safely inventory and reconcile Storage metadata without writing to production. The next plan must separately select the encrypted off-site destination, define approved RPO/RTO/retention values, implement physical byte transfer and SHA-256 verification, and prove an isolated restore before any production rollout is requested.

# drawDB Database Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a local, reproducible drawDB workflow that documents the current Motto SaaS PostgreSQL schema, the approved organization/location target model, and the migration boundary between them without exposing live data or making diagrams a schema authority.

**Architecture:** A pinned drawDB checkout runs outside the application dependency graph under an ignored local tools directory. A data-free catalog extractor reads only a clean local PostgreSQL replay and emits normalized DDL plus a deterministic manifest; verifiers compare migration fingerprints, diagram coverage, and forbidden-content rules. Current and proposed diagrams are stored separately and reviewed as documentation artifacts.

**Tech Stack:** Node.js 22, ECMAScript modules, existing `pg` and Vitest dependencies, Supabase CLI 2.111.0, PostgreSQL 17, Docker, drawDB commit `f15453be0b9a0a8ca99d040256c2d2edf7155510`, Prettier, GitHub Actions.

## Global Constraints

- Complete and deliver the private-financial-document branch before beginning this plan; do not mix a live security rollout with architecture-tool adoption.
- Use drawDB only as a local/self-hosted development tool; do not add it to application dependencies or production images.
- Treat migrations, tests, and a clean local PostgreSQL replay as current-schema authority.
- Never apply drawDB-generated SQL directly.
- Never read from a live database; generation accepts only loopback PostgreSQL hosts.
- Commit no row data, customer identifiers, emails, document references, credentials, tokens, environment files, or managed-schema internals.
- Label target organization/location structures `PROPOSED` until their forward migrations ship.
- Keep current, target, and transitional architecture artifacts physically separate.
- Do not modify drawDB source code or redistribute a modified build without a separate AGPL-3.0 review.

---

## Planned File Structure

```text
tools/drawdb/tool-lock.json
scripts/architecture/drawdb-tool.mjs
scripts/architecture/drawdb-tool.test.ts
scripts/architecture/database/catalog-query.mjs
scripts/architecture/database/schema-model.mjs
scripts/architecture/database/schema-model.test.ts
scripts/architecture/database/generate-current-schema.mjs
scripts/architecture/database/verify-database-architecture.mjs
scripts/architecture/database/verify-database-architecture.test.ts
docs/architecture/database/README.md
docs/architecture/database/current/schema.sql
docs/architecture/database/current/schema-manifest.json
docs/architecture/database/current/diagram-index.json
docs/architecture/database/current/overview.drawdb.json
docs/architecture/database/current/overview.png
docs/architecture/database/target/diagram-index.json
docs/architecture/database/target/platform-overview.drawdb.json
docs/architecture/database/target/tenancy-and-locations.drawdb.json
docs/architecture/database/target/authorization.drawdb.json
docs/architecture/database/target/inventory-and-products.drawdb.json
docs/architecture/database/target/finance-and-documents.drawdb.json
docs/architecture/database/target/diagrams/*.png
docs/architecture/database/migration/current-to-location-foundation.md
```

`scripts/architecture/database/schema-model.mjs` owns normalized catalog types and deterministic DDL rendering. `generate-current-schema.mjs` is the only database-connected command. `verify-database-architecture.mjs` is offline and is the CI entry point.

---

### Task 1: Pin and isolate the local drawDB toolchain

**Files:**

- Create: `tools/drawdb/tool-lock.json`
- Create: `scripts/architecture/drawdb-tool.mjs`
- Create: `scripts/architecture/drawdb-tool.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Produces: `loadDrawDbToolLock(): DrawDbToolLock`
- Produces: `buildDrawDbCommand(action: 'prepare' | 'start' | 'stop' | 'status'): CommandSpec[]`
- Produces: CLI actions `prepare`, `start`, `stop`, and `status` through `node scripts/architecture/drawdb-tool.mjs`

- [ ] **Step 1: Write failing lock and command tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildDrawDbCommand, validateDrawDbToolLock } from './drawdb-tool.mjs'

const lock = {
  repository: 'https://github.com/drawdb-io/drawdb.git',
  commit: 'f15453be0b9a0a8ca99d040256c2d2edf7155510',
  license: 'AGPL-3.0',
}

describe('drawDB tool isolation', () => {
  it('accepts only the reviewed repository and a full commit SHA', () => {
    expect(validateDrawDbToolLock(lock)).toEqual(lock)
    expect(() => validateDrawDbToolLock({ ...lock, commit: 'main' })).toThrow()
  })

  it('clones into the ignored tools directory and checks out the pinned commit', () => {
    expect(buildDrawDbCommand('prepare')).toEqual([
      expect.objectContaining({ command: 'git', args: expect.arrayContaining(['clone']) }),
      expect.objectContaining({ command: 'git', args: ['checkout', '--detach', lock.commit] }),
    ])
  })
})
```

- [ ] **Step 2: Run the test and witness RED**

Run: `npm test -- scripts/architecture/drawdb-tool.test.ts`

Expected: FAIL because `drawdb-tool.mjs` does not exist.

- [ ] **Step 3: Add the reviewed lock file**

```json
{
  "repository": "https://github.com/drawdb-io/drawdb.git",
  "commit": "f15453be0b9a0a8ca99d040256c2d2edf7155510",
  "license": "AGPL-3.0",
  "reviewedAt": "2026-08-10"
}
```

- [ ] **Step 4: Implement the local wrapper**

Implement `validateDrawDbToolLock` with exact repository/license checks and `/^[0-9a-f]{40}$/`. Resolve the checkout only as `path.join(process.cwd(), '.tools', 'drawdb', 'repository')`; reject any resolved path outside `path.join(process.cwd(), '.tools', 'drawdb')`.

Actions:

```text
prepare: clone when absent, fetch the exact SHA, checkout --detach, verify HEAD
start:   docker compose up -d inside the verified checkout
stop:    docker compose down inside the verified checkout
status:  docker compose ps inside the verified checkout
```

Use `spawnSync` with argument arrays and `shell: false`. Never interpolate a command string.

- [ ] **Step 5: Ignore local tool state and expose development commands**

Add to `.gitignore`:

```gitignore
# Local architecture tools
/.tools/
```

Add to `package.json`:

```json
"drawdb:prepare": "node scripts/architecture/drawdb-tool.mjs prepare",
"drawdb:start": "node scripts/architecture/drawdb-tool.mjs start",
"drawdb:stop": "node scripts/architecture/drawdb-tool.mjs stop",
"drawdb:status": "node scripts/architecture/drawdb-tool.mjs status"
```

- [ ] **Step 6: Run GREEN and repository checks**

Run:

```text
npm test -- scripts/architecture/drawdb-tool.test.ts
npm run format:check
git diff --check
```

Expected: all PASS; no `.tools/` file is tracked.

- [ ] **Step 7: Commit**

```text
git add .gitignore package.json tools/drawdb/tool-lock.json scripts/architecture/drawdb-tool.mjs scripts/architecture/drawdb-tool.test.ts
git commit -m "chore: pin local drawdb tooling"
```

---

### Task 2: Generate a deterministic data-free schema artifact

**Files:**

- Create: `scripts/architecture/database/catalog-query.mjs`
- Create: `scripts/architecture/database/schema-model.mjs`
- Create: `scripts/architecture/database/schema-model.test.ts`
- Create: `scripts/architecture/database/generate-current-schema.mjs`
- Create: `docs/architecture/database/current/schema.sql`
- Create: `docs/architecture/database/current/schema-manifest.json`
- Modify: `package.json`

**Interfaces:**

- Produces: `assertLoopbackDatabaseUrl(rawUrl: string): URL`
- Produces: `buildSchemaManifest(rows: CatalogRow[]): SchemaManifest`
- Produces: `renderPostgresDdl(manifest: SchemaManifest): string`
- Produces: CLI `npm run architecture:db:generate`

- [ ] **Step 1: Write failing pure-model and host-guard tests**

```ts
import { describe, expect, it } from 'vitest'
import { assertLoopbackDatabaseUrl, buildSchemaManifest, renderPostgresDdl } from './schema-model.mjs'

describe('schema artifact generation', () => {
  it('rejects non-loopback databases', () => {
    expect(() => assertLoopbackDatabaseUrl('postgresql://u:p@db.example.com/app')).toThrow()
    expect(assertLoopbackDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres').hostname).toBe(
      '127.0.0.1',
    )
  })

  it('orders schemas, tables, columns and foreign keys deterministically', () => {
    const manifest = buildSchemaManifest([
      { schema: 'public', table: 'products', column: 'organization_id', ordinal: 2, dataType: 'uuid', nullable: false },
      {
        schema: 'public',
        table: 'products',
        column: 'id',
        ordinal: 1,
        dataType: 'uuid',
        nullable: false,
        primaryKey: true,
      },
    ])
    expect(manifest.tables[0].columns.map((column) => column.name)).toEqual(['id', 'organization_id'])
    expect(renderPostgresDdl(manifest)).toContain('CREATE TABLE public.products')
  })
})
```

- [ ] **Step 2: Run the tests and witness RED**

Run: `npm test -- scripts/architecture/database/schema-model.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the catalog query**

Query only ordinary/partitioned tables from `public` and `private`. Return columns, defaults, primary keys, unique constraints, and foreign keys through `pg_catalog`; exclude views, functions, policies, row data, `auth`, `storage`, extensions, ownership statements, and privileges.

Use this explicit scope predicate:

```sql
WHERE namespace.nspname IN ('public', 'private')
  AND relation.relkind IN ('r', 'p')
  AND relation.relname NOT LIKE '%\_yedek' ESCAPE '\'
```

- [ ] **Step 4: Implement normalization and rendering**

Use plain JSON objects with this stable contract:

```ts
type SchemaManifest = {
  formatVersion: 1
  generatedFrom: 'clean-local-replay'
  migrationHead: string
  migrationFingerprint: string
  tables: Array<{
    schema: 'public' | 'private'
    name: string
    columns: Array<{ name: string; dataType: string; nullable: boolean; defaultExpression: string | null }>
    primaryKey: string[]
    uniqueConstraints: Array<{ name: string; columns: string[] }>
    foreignKeys: Array<{
      name: string
      columns: string[]
      targetSchema: string
      targetTable: string
      targetColumns: string[]
    }>
  }>
}
```

Quote identifiers with doubled double-quotes. End output with one newline. Do not render defaults containing environment-specific URLs or secrets; reject them instead.

- [ ] **Step 5: Implement the generator**

Read only `MOTTO_ERD_DATABASE_URL`. If absent, use the known local Supabase URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Call `assertLoopbackDatabaseUrl` before connecting. Compute `migrationHead` from the greatest migration filename and `migrationFingerprint` as SHA-256 over ordered `relativePath + NUL + bytes` for all `supabase/migrations/*.sql`.

Write `schema.sql` and `schema-manifest.json` atomically through adjacent `.tmp` files, then rename.

- [ ] **Step 6: Add the generation command and produce artifacts**

Add:

```json
"architecture:db:generate": "node scripts/architecture/database/generate-current-schema.mjs"
```

Run after a clean Supabase replay:

```text
npx supabase@2.111.0 db reset --local --no-seed
npm run architecture:db:generate
```

Expected: no live network connection; both committed artifacts contain DDL/metadata and no row data.

- [ ] **Step 7: Run GREEN and commit**

```text
npm test -- scripts/architecture/database/schema-model.test.ts
npm run format:check
git diff --check
git add package.json scripts/architecture/database docs/architecture/database/current/schema.sql docs/architecture/database/current/schema-manifest.json
git commit -m "feat: generate data-free database architecture"
```

---

### Task 3: Enforce architecture security and drift rules offline

**Files:**

- Create: `scripts/architecture/database/verify-database-architecture.mjs`
- Create: `scripts/architecture/database/verify-database-architecture.test.ts`
- Create: `docs/architecture/database/current/diagram-index.json`
- Modify: `package.json`

**Interfaces:**

- Consumes: `SchemaManifest` from Task 2
- Produces: `verifyArchitectureArtifacts(input): VerificationFinding[]`
- Produces: CLI `npm run architecture:db:verify`

- [ ] **Step 1: Write failing security and drift tests**

```ts
it('rejects migration drift and data-bearing SQL', () => {
  expect(verifyArchitectureArtifacts({ ...validInput, actualMigrationFingerprint: 'different' })).toContainEqual(
    expect.objectContaining({ code: 'MIGRATION_DRIFT' }),
  )
  expect(verifyArchitectureArtifacts({ ...validInput, ddl: 'COPY public.sales FROM stdin;' })).toContainEqual(
    expect.objectContaining({ code: 'ROW_DATA_FORBIDDEN' }),
  )
})

it('requires every current diagram table to exist in the clean schema', () => {
  const findings = verifyArchitectureArtifacts({ ...validInput, diagramTables: ['public.ghost_table'] })
  expect(findings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_CURRENT_TABLE' }))
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- scripts/architecture/database/verify-database-architecture.test.ts`

Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement fail-closed verification**

Return findings for:

```text
MIGRATION_DRIFT
ROW_DATA_FORBIDDEN
SECRET_PATTERN
NON_LOOPBACK_URL
MANAGED_SCHEMA_LEAK
UNKNOWN_CURRENT_TABLE
MISSING_DIAGRAM_FILE
INVALID_DIAGRAM_STATUS
```

Reject `INSERT INTO`, `COPY ... FROM`, email-shaped values, Supabase project URLs, JWT-like strings, `service_role`, database passwords, and `auth.`/`storage.` table definitions. Allow comments that explain managed-schema boundaries only when they do not include identifiers or URLs.

- [ ] **Step 4: Create the current diagram index contract**

```json
{
  "formatVersion": 1,
  "status": "CURRENT",
  "source": "schema-manifest.json",
  "diagrams": []
}
```

Each later diagram entry must contain `id`, `nativeFile`, `imageFile`, `tables`, `toolCommit`, and `migrationHead`.

- [ ] **Step 5: Add the offline command and GREEN checks**

Add:

```json
"architecture:db:verify": "node scripts/architecture/database/verify-database-architecture.mjs"
```

Run:

```text
npm test -- scripts/architecture/database/verify-database-architecture.test.ts
npm run architecture:db:verify
```

Expected: PASS with the empty current diagram list permitted only until Task 4.

- [ ] **Step 6: Commit**

```text
git add package.json scripts/architecture/database/verify-database-architecture.* docs/architecture/database/current/diagram-index.json
git commit -m "test: verify database architecture artifacts"
```

---

### Task 4: Build and verify the current-state diagram pack

**Files:**

- Create: `docs/architecture/database/README.md`
- Create: `docs/architecture/database/current/overview.drawdb.json`
- Create: `docs/architecture/database/current/overview.png`
- Modify: `docs/architecture/database/current/diagram-index.json`
- Modify: `scripts/architecture/database/verify-database-architecture.test.ts`

**Interfaces:**

- Consumes: `current/schema.sql`, `current/schema-manifest.json`
- Produces: reviewed drawDB native export, PNG, and complete current diagram index

- [ ] **Step 1: Tighten the verifier test before adding diagrams**

Change the fixture so an empty `CURRENT` diagram list returns `CURRENT_DIAGRAM_REQUIRED`. Run the focused verifier test and witness RED against the current empty index.

- [ ] **Step 2: Prepare and start the pinned local editor**

Run:

```text
npm run drawdb:prepare
npm run drawdb:start
npm run drawdb:status
```

Verify the checkout HEAD equals `f15453be0b9a0a8ca99d040256c2d2edf7155510` before opening its loopback URL.

- [ ] **Step 3: Import the generated PostgreSQL DDL**

In the local drawDB editor, select PostgreSQL, import `docs/architecture/database/current/schema.sql`, and create one compact current-state overview. Do not connect drawDB to any database and do not paste live query results.

- [ ] **Step 4: Export and classify the diagram**

Export JSON to `current/overview.drawdb.json` and PNG to `current/overview.png`. Add an index entry:

```json
{
  "id": "current-overview",
  "nativeFile": "overview.drawdb.json",
  "imageFile": "overview.png",
  "tables": ["public.organizations", "public.organization_members", "public.products", "public.materials"],
  "toolCommit": "f15453be0b9a0a8ca99d040256c2d2edf7155510",
  "migrationHead": "20260810172845"
}
```

Generate both fields rather than typing them in the diagram editor: `toolCommit` comes from `tool-lock.json` and `migrationHead` comes from `schema-manifest.json`. The concrete migration head shown above is the approved-plan baseline and must move forward automatically if migrations are added before execution. The migration fingerprint in `schema-manifest.json`, rather than an application Git commit, proves the schema source set. The verifier rejects source mismatches and unknown tables.

- [ ] **Step 5: Document the safe workflow**

`README.md` must contain generation, verification, local drawDB start/stop, import/export, current/proposed labeling, data prohibition, AGPL notice, and recovery instructions. It must state that SQL exports are proposals only.

- [ ] **Step 6: Run GREEN and visual review**

```text
npm run architecture:db:verify
npm test -- scripts/architecture/database/verify-database-architecture.test.ts
npm run format:check
```

Visually confirm primary/foreign keys are readable at 1440-pixel desktop width and no customer data appears.

- [ ] **Step 7: Commit**

```text
git add docs/architecture/database scripts/architecture/database/verify-database-architecture.test.ts
git commit -m "docs: add current database architecture"
```

---

### Task 5: Model the target organization/location architecture

**Files:**

- Create: `docs/architecture/database/target/diagram-index.json`
- Create: `docs/architecture/database/target/platform-overview.drawdb.json`
- Create: `docs/architecture/database/target/tenancy-and-locations.drawdb.json`
- Create: `docs/architecture/database/target/authorization.drawdb.json`
- Create: `docs/architecture/database/target/inventory-and-products.drawdb.json`
- Create: `docs/architecture/database/target/finance-and-documents.drawdb.json`
- Create: `docs/architecture/database/target/diagrams/platform-overview.png`
- Create: `docs/architecture/database/target/diagrams/tenancy-and-locations.png`
- Create: `docs/architecture/database/target/diagrams/authorization.png`
- Create: `docs/architecture/database/target/diagrams/inventory-and-products.png`
- Create: `docs/architecture/database/target/diagrams/finance-and-documents.png`
- Create: `docs/architecture/database/migration/current-to-location-foundation.md`
- Modify: `scripts/architecture/database/verify-database-architecture.mjs`
- Modify: `scripts/architecture/database/verify-database-architecture.test.ts`

**Interfaces:**

- Consumes: approved platform architecture spec and current diagram pack
- Produces: five `PROPOSED` diagrams and a non-executable migration impact map

- [ ] **Step 1: Write failing proposed-state classification tests**

Require every target entry to contain `status: "PROPOSED"`, `sourceSpec`, `entities`, `relationships`, `nativeFile`, and `imageFile`. Reject target entries marked `CURRENT` or containing executable SQL.

- [ ] **Step 2: Run RED**

Run: `npm test -- scripts/architecture/database/verify-database-architecture.test.ts`

Expected: FAIL because the target index does not exist.

- [ ] **Step 3: Create the target diagram index**

Use source spec:

```text
docs/superpowers/specs/2026-08-07-motto-saas-platform-architecture-design.md
```

Define entities including `organizations`, `locations`, `organization_members`, `roles`, `permissions`, `role_assignments`, `location_assignments`, `subscriptions`, `entitlements`, and location-owned operational records. The index is descriptive JSON, not SQL.

- [ ] **Step 4: Build five bounded diagrams in local drawDB**

Use synthetic proposed tables with a visible `PROPOSED` annotation. Every operational entity carries `organization_id` and non-null `location_id`; organization-wide entities are labeled explicitly. Export the five JSON and PNG pairs to the exact paths above.

- [ ] **Step 5: Write the migration impact map**

For each current operational table, record:

```text
current scope
target scope
default-location backfill requirement
constraint ordering
RPC/RLS impact
positive and denial tests
rollback or forward-recovery boundary
```

The document must not contain runnable migration SQL.

- [ ] **Step 6: Run GREEN and independent architecture review**

```text
npm run architecture:db:verify
npm test -- scripts/architecture/database/verify-database-architecture.test.ts
git diff --check
```

Request review focused on tenant leakage, nullable location ambiguity, cross-location foreign keys, ownership, and accidental presentation of proposed schema as deployed.

- [ ] **Step 7: Commit**

```text
git add docs/architecture/database/target docs/architecture/database/migration scripts/architecture/database/verify-database-architecture.*
git commit -m "docs: model target location architecture"
```

---

### Task 6: Add CI verification and close the drawDB foundation

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `README.md`
- Review: all files changed in Tasks 1–5

**Interfaces:**

- Produces: offline CI gate `npm run architecture:db:verify`
- Produces: documented contributor workflow

- [ ] **Step 1: Add a failing CI contract test**

Add a pure test that reads `.github/workflows/ci.yml` and `package.json`, then asserts the workflow invokes the exact `architecture:db:verify` script after dependency installation and before build. Witness RED before editing CI.

- [ ] **Step 2: Wire the offline verifier into CI**

Add to the lint-and-test job:

```yaml
- name: Verify database architecture documentation
  run: npm run architecture:db:verify
```

Do not start Docker or require database secrets in CI.

- [ ] **Step 3: Document contributor commands**

Add README entries for:

```text
npm run drawdb:prepare
npm run drawdb:start
npm run architecture:db:generate
npm run architecture:db:verify
npm run drawdb:stop
```

State that generation requires a clean local Supabase replay while verification is offline.

- [ ] **Step 4: Run the complete quality gate**

```text
npm run architecture:db:verify
npm run check
npm run build
git diff --check
```

Run `graphify update .` and refresh codebase-memory. Restore/exclude only incidental generated changes after verifying the architecture artifacts are indexed.

- [ ] **Step 5: Perform final security and license review**

Verify no live URL, environment file, credential, row data, `.tools/` checkout, or modified drawDB source is staged. Confirm `tool-lock.json` still points to the reviewed SHA and AGPL-3.0.

- [ ] **Step 6: Request independent code and architecture review**

Review the complete task range, focusing on command injection, path escape, accidental live DB use, secret scanning, migration drift accuracy, current/proposed ambiguity, and CI determinism. Fix all Critical/Important findings and re-run the gates.

- [ ] **Step 7: Commit verification updates**

```text
git add .github/workflows/ci.yml package.json README.md .codebase-memory
git commit -m "chore: verify database architecture workflow"
```

## Definition of Done

- [ ] drawDB runs only from the pinned local checkout and is absent from production dependencies.
- [ ] Schema generation refuses non-loopback databases and emits no row data.
- [ ] Current diagrams match the clean local migration replay and pass offline drift checks.
- [ ] Target diagrams are visibly and structurally `PROPOSED`.
- [ ] The location migration impact map covers every location-scoped domain without runnable SQL.
- [ ] CI verifies committed architecture artifacts without Docker or secrets.
- [ ] Full quality gates, Graphify/codebase-memory refresh, and independent review pass.

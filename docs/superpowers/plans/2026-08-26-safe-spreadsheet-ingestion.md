# DEP-02B Safe Spreadsheet Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production-reachable `xlsx@0.18.5` parsing paths with a
reproducible, bounded, tenant-safe ingestion boundary for `.xlsx` and `.csv`
without changing financial write semantics.

**Architecture:** Vendor the official SheetJS CE 0.20.3 tarball with an
independently verifiable SHA-256 manifest, validate file identity before
parsing, parse bytes in a terminable Web Worker, normalize into a prototype-safe
neutral table, and let supplier-receipt and Z-report adapters interpret that
table. A generation-scoped coordinator prevents a result created under one
organization from reaching another organization's UI state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Web Workers,
SheetJS CE 0.20.3, Vitest, Supabase, Prettier, ESLint

**Spec:**
`docs/superpowers/specs/2026-08-26-production-dependency-remediation-design.md`

## Global Constraints

- Accept only `.xlsx` and UTF-8 `.csv`; reject `.xls`, `.xlsm`, encrypted
  workbooks, macros, external links, formulas, invalid signatures, and
  prototype-control keys.
- Enforce: XLSX 3 MiB, CSV 1 MiB, at most 5 workbook sheets, first visible
  sheet only, 5,000 rows, 100 columns, 100,000 cells, 10,000 characters per
  cell, 8 seconds for XLSX, and 5 seconds for CSV.
- Treat an empty browser MIME as unknown, not trusted. When MIME exists it must
  agree with the extension and byte signature.
- Never parse a workbook on the browser main thread.
- Never upload a file merely to parse it. XLSX may continue through the
  existing post-save document path; CSV is analysis-only until a separately
  reviewed Storage MIME/RLS migration exists.
- Preserve the existing user review step, tenant-scoped RPCs, audit behavior,
  and atomic financial writes.
- Do not change Supabase schema, RLS, production data, or live configuration.
- Do not fall back to `xlsx@0.18.5`, `npm audit fix --force`, or an unpinned
  network package.
- Do not push, merge, deploy, or claim production verification.

---

### Task 1: Vendor and verify the official SheetJS artifact

**Files:**

- Create: `vendor/xlsx-0.20.3.tgz`
- Create: `vendor/xlsx-0.20.3.sha256`
- Create: `scripts/security/verify-vendored-sheetjs.mjs`
- Create: `scripts/security/verify-vendored-sheetjs.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Supply-chain contract:**

- Package source:
  `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- Manifest format:
  `<64 lowercase hex characters><two spaces>xlsx-0.20.3.tgz`
- `package.json` dependency: `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`
- The verifier checks the archive digest, package name, package version, and
  exact local dependency reference without contacting the network.

- [ ] **Step 1: Write a RED verifier test**

  Create `scripts/security/verify-vendored-sheetjs.test.ts`:

  ```ts
  import { execFileSync } from 'node:child_process'
  import { mkdtempSync, writeFileSync } from 'node:fs'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { describe, expect, it } from 'vitest'

  describe('verify-vendored-sheetjs', () => {
    it('rejects an artifact whose digest does not match the manifest', () => {
      const root = mkdtempSync(join(tmpdir(), 'sheetjs-verifier-'))
      writeFileSync(join(root, 'xlsx-0.20.3.tgz'), 'tampered')
      writeFileSync(join(root, 'xlsx-0.20.3.sha256'), `${'0'.repeat(64)}  xlsx-0.20.3.tgz\n`)

      expect(() =>
        execFileSync(process.execPath, [
          'scripts/security/verify-vendored-sheetjs.mjs',
          '--artifact-dir',
          root,
          '--skip-package-contract',
        ]),
      ).toThrow()
    })
  })
  ```

- [ ] **Step 2: Run the focused test and confirm RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run scripts/security/verify-vendored-sheetjs.test.ts
  ```

  Expected: FAIL because the verifier does not exist.

- [ ] **Step 3: Implement the offline verifier**

  Implement `verify-vendored-sheetjs.mjs` with `node:crypto`, `node:fs`, and
  `node:zlib`. Parse the first tar entry named `package/package.json`; reject
  malformed archives rather than shelling out to a platform-specific tar tool.
  The executable path must expose a reusable function and set a non-zero exit
  code on any mismatch:

  ```js
  export function verifyVendoredSheetJs({
    artifactDir = 'vendor',
    skipPackageContract = false,
    projectDir = process.cwd(),
  } = {})
  ```

  Compare the digest with `timingSafeEqual`, validate the manifest grammar,
  assert `package.name === 'xlsx'`, assert `package.version === '0.20.3'`, and
  unless skipped assert the root dependency is exactly
  `file:vendor/xlsx-0.20.3.tgz`.

- [ ] **Step 4: Run the focused test and confirm GREEN**

  ```powershell
  .\node_modules\.bin\vitest.cmd run scripts/security/verify-vendored-sheetjs.test.ts
  ```

  Expected: PASS; tampering is rejected.

- [ ] **Step 5: Download once with explicit network authorization**

  Ask for approval before running the network command. Download to a temporary
  file, compute SHA-256 twice using independent tools, compare the values, then
  move the exact bytes into `vendor/xlsx-0.20.3.tgz`:

  ```powershell
  curl.exe --fail --location --proto '=https' --tlsv1.2 --output "$env:TEMP\xlsx-0.20.3.tgz" 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'
  certutil.exe -hashfile "$env:TEMP\xlsx-0.20.3.tgz" SHA256
  Get-FileHash -LiteralPath "$env:TEMP\xlsx-0.20.3.tgz" -Algorithm SHA256
  ```

  Record the matching lowercase digest in `vendor/xlsx-0.20.3.sha256`. Do not
  accept a digest copied only from the same download process.

- [ ] **Step 6: Switch the dependency to the local artifact**

  Change only the `xlsx` dependency and add a quality-gate script:

  ```json
  {
    "scripts": {
      "verify:sheetjs": "node scripts/security/verify-vendored-sheetjs.mjs"
    },
    "dependencies": {
      "xlsx": "file:vendor/xlsx-0.20.3.tgz"
    }
  }
  ```

  Regenerate the lockfile with the repository package manager. Do not hand-edit
  package-lock integrity or resolved fields.

- [ ] **Step 7: Verify the exact installed artifact**

  ```powershell
  npm install --package-lock-only --ignore-scripts
  npm ci --ignore-scripts
  npm run verify:sheetjs
  npm ls xlsx --all
  ```

  Expected: one `xlsx@0.20.3`, sourced from the vendored file; no 0.18.5 node.

- [ ] **Step 8: Commit Task 1**

  ```powershell
  git add -- package.json package-lock.json vendor/xlsx-0.20.3.tgz vendor/xlsx-0.20.3.sha256 scripts/security/verify-vendored-sheetjs.mjs scripts/security/verify-vendored-sheetjs.test.ts
  git commit -m "build: vendor verified SheetJS release"
  ```

---

### Task 2: Define the file identity and resource policy

**Files:**

- Create: `src/features/spreadsheets/spreadsheet-types.ts`
- Create: `src/features/spreadsheets/spreadsheet-policy.ts`
- Create: `src/features/spreadsheets/spreadsheet-policy.test.ts`

**Interfaces:**

```ts
export type SpreadsheetKind = 'xlsx' | 'csv'

export type SpreadsheetErrorCode =
  'UNSUPPORTED_TYPE' | 'LIMIT_EXCEEDED' | 'INVALID_WORKBOOK' | 'UNSAFE_CONTENT' | 'ORGANIZATION_CHANGED' | 'TIMEOUT'

export type SpreadsheetCell = string | number | boolean | null

export type SpreadsheetTable = {
  kind: SpreadsheetKind
  sheetName: string
  rows: readonly (readonly SpreadsheetCell[])[]
}

export type SpreadsheetParseResult =
  { ok: true; table: SpreadsheetTable } | { ok: false; code: SpreadsheetErrorCode; message: string }
```

`spreadsheet-policy.ts` exports immutable limits and:

```ts
export function identifySpreadsheetFile(input: {
  name: string
  mimeType: string
  size: number
  prefix: Uint8Array
}): { ok: true; kind: SpreadsheetKind } | { ok: false; result: SpreadsheetParseResult }
```

- [ ] **Step 1: Write RED table-driven identity tests**

  Cover these exact cases: valid ZIP-signature `.xlsx`; valid UTF-8 `.csv`;
  empty MIME accepted only when bytes and extension agree; legacy Compound File
  `.xls`; `.xlsm`; executable renamed `.xlsx`; NUL-containing CSV; mismatched
  MIME; XLSX over 3 MiB; CSV over 1 MiB; and extension matching regardless of
  case.

  Use these signatures:

  ```ts
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
  const compoundFile = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])
  const utf8Csv = new TextEncoder().encode('Tarih,Tutar\n2026-08-26,120')
  ```

- [ ] **Step 2: Run the policy test and confirm RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/spreadsheet-policy.test.ts
  ```

  Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the single-source policy**

  Export frozen constants using byte counts, not decimal labels:

  ```ts
  export const SPREADSHEET_LIMITS = Object.freeze({
    xlsxBytes: 3 * 1024 * 1024,
    csvBytes: 1 * 1024 * 1024,
    workbookSheets: 5,
    rows: 5_000,
    columns: 100,
    cells: 100_000,
    cellCharacters: 10_000,
    xlsxTimeoutMs: 8_000,
    csvTimeoutMs: 5_000,
  })
  ```

  Use an exact MIME allowlist, ZIP local/empty/end signatures for XLSX, strict
  UTF-8 decoding with `{ fatal: true }` for CSV, and reject NUL bytes. Return
  concise Turkish user messages without echoing names or file contents.

- [ ] **Step 4: Run focused tests and typecheck**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/spreadsheet-policy.test.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: policy tests PASS; no TypeScript errors.

- [ ] **Step 5: Commit Task 2**

  ```powershell
  git add -- src/features/spreadsheets/spreadsheet-types.ts src/features/spreadsheets/spreadsheet-policy.ts src/features/spreadsheets/spreadsheet-policy.test.ts
  git commit -m "feat: define spreadsheet ingestion policy"
  ```

---

### Task 3: Build the pure bounded parser core

**Files:**

- Create: `src/features/spreadsheets/spreadsheet-parser-core.ts`
- Create: `src/features/spreadsheets/spreadsheet-parser-core.test.ts`

**Interface:**

```ts
export function parseSpreadsheetBytes(input: { bytes: Uint8Array; kind: SpreadsheetKind }): SpreadsheetParseResult
```

- [ ] **Step 1: Write RED parser fixtures and tests**

  Build tiny workbooks in test memory with the vendored `xlsx` package; do not
  commit customer documents. Cover: first visible sheet chosen, over 5 sheets,
  hidden first sheet, formula cell, `xl/vbaProject.bin`, `xl/externalLinks/`,
  encrypted/invalid workbook, `__proto__`, `prototype`, `constructor`, over
  5,000 rows, over 100 columns, over 100,000 cells, over 10,000 characters,
  and valid booleans/numbers/strings/nulls. Add CSV tests for quoted commas,
  CRLF, UTF-8 Turkish characters, formula-like prefixes, and limits.

  Formula-like CSV cells beginning with `=`, `+`, `-`, or `@` must be rejected
  because downstream export can otherwise turn inert input into spreadsheet
  formulas.

- [ ] **Step 2: Run the parser test and confirm RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/spreadsheet-parser-core.test.ts
  ```

  Expected: FAIL because the parser core does not exist.

- [ ] **Step 3: Implement bounded XLSX parsing**

  Parse with explicit options:

  ```ts
  const workbook = XLSX.read(bytes, {
    type: 'array',
    dense: true,
    raw: true,
    bookFiles: true,
    bookVBA: true,
    sheetRows: SPREADSHEET_LIMITS.rows + 1,
  })
  ```

  Reject more than five workbook sheets before conversion. Inspect workbook
  file keys for `xl/vbaProject.bin`, `xl/externalLinks/`, and encryption
  structures. Determine visibility from `Workbook.Sheets`; select the first
  visible sheet. Scan actual cell objects for `.f` before converting values.
  Convert using `header: 1`, `raw: true`, `defval: null`, and
  `blankrows: false`; apply every limit during normalization, not afterward.

- [ ] **Step 4: Implement strict CSV parsing**

  Decode with fatal UTF-8. Use the same vendored parser in CSV mode with an
  explicit comma delimiter and no automatic type inference, then normalize
  through the same limit and prototype-key checks. Preserve literal dates as
  strings. Never assign untrusted values as object property names.

- [ ] **Step 5: Run focused tests and typecheck**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/spreadsheet-parser-core.test.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: all parser safety and happy-path tests PASS.

- [ ] **Step 6: Commit Task 3**

  ```powershell
  git add -- src/features/spreadsheets/spreadsheet-parser-core.ts src/features/spreadsheets/spreadsheet-parser-core.test.ts
  git commit -m "feat: add bounded spreadsheet parser"
  ```

---

### Task 4: Add the terminable worker and tenant-stale coordinator

**Files:**

- Create: `src/features/spreadsheets/spreadsheet-parser.worker.ts`
- Create: `src/features/spreadsheets/parse-spreadsheet.ts`
- Create: `src/features/spreadsheets/parse-spreadsheet.test.ts`
- Create: `src/features/spreadsheets/spreadsheet-parse-coordinator.ts`
- Create: `src/features/spreadsheets/spreadsheet-parse-coordinator.test.ts`

**Interfaces:**

```ts
export function parseSpreadsheet(
  file: File,
  options?: { signal?: AbortSignal; workerFactory?: () => Worker },
): Promise<SpreadsheetParseResult>

export function createSpreadsheetParseCoordinator(dependencies?: { parse?: typeof parseSpreadsheet }): {
  run(
    file: File,
    organizationId: string,
  ): Promise<{
    organizationId: string
    result: SpreadsheetParseResult
  } | null>
  cancel(): void
}
```

- [ ] **Step 1: Write RED lifecycle tests with a fake Worker**

  Assert that: the byte buffer is transferred, not copied; XLSX times out at
  8 seconds; CSV times out at 5 seconds; abort terminates the worker; success
  terminates it; worker error returns `INVALID_WORKBOOK`; and no listener or
  timer remains after settlement. Use fake timers and a deterministic worker
  test double.

- [ ] **Step 2: Write RED coordinator race tests**

  Start parse A for organization A, then parse B for organization B. Resolve A
  last and assert it returns `null`; only B may return a result. Assert
  `cancel()` invalidates the current generation and aborts the parse.

- [ ] **Step 3: Run both tests and confirm RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/parse-spreadsheet.test.ts src/features/spreadsheets/spreadsheet-parse-coordinator.test.ts
  ```

  Expected: FAIL because the worker boundary and coordinator do not exist.

- [ ] **Step 4: Implement the worker protocol**

  Use discriminated messages containing a request ID, kind, bytes, and result.
  The production factory must be:

  ```ts
  const createWorker = () =>
    new Worker(new URL('./spreadsheet-parser.worker.ts', import.meta.url), {
      type: 'module',
    })
  ```

  The worker invokes only `parseSpreadsheetBytes`. It must not import React,
  Supabase, browser storage, organization context, or notification code.

- [ ] **Step 5: Implement exactly-once cleanup and generation invalidation**

  Read and identify the file before creating the worker. Use one settlement
  function that clears the timer, removes abort handling, and terminates the
  worker exactly once. The coordinator increments a generation counter and
  aborts the preceding request on every `run` or `cancel`.

- [ ] **Step 6: Run focused tests and production build**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/spreadsheets/parse-spreadsheet.test.ts src/features/spreadsheets/spreadsheet-parse-coordinator.test.ts
  npm run build
  ```

  Expected: lifecycle/race tests PASS and Next bundles the module worker.

- [ ] **Step 7: Commit Task 4**

  ```powershell
  git add -- src/features/spreadsheets/spreadsheet-parser.worker.ts src/features/spreadsheets/parse-spreadsheet.ts src/features/spreadsheets/parse-spreadsheet.test.ts src/features/spreadsheets/spreadsheet-parse-coordinator.ts src/features/spreadsheets/spreadsheet-parse-coordinator.test.ts
  git commit -m "feat: isolate spreadsheet parsing in worker"
  ```

---

### Task 5: Migrate supplier receipt ingestion

**Files:**

- Create: `src/features/materials/services/supplier-spreadsheet-adapter.ts`
- Create: `src/features/materials/services/supplier-spreadsheet-adapter.test.ts`
- Modify: `src/app/dashboard/hammaddeler/fis-yukle/page.tsx`
- Modify: `src/features/documents/document-reference.ts`
- Modify: nearest existing tests for both files

**Adapter interface:**

```ts
export function toSupplierReceiptAnalysisInput(
  table: SpreadsheetTable,
): { ok: true; content: string } | { ok: false; message: string }
```

- [ ] **Step 1: Characterize the current supplier flow before editing**

  Add tests proving the current review and save sequence: parse does not write
  financial data, user reviews extracted rows, and the existing save path owns
  persistence/audit behavior. Record the current AI/API payload shape so the
  adapter preserves it.

- [ ] **Step 2: Write RED adapter tests**

  Assert deterministic JSON serialization of neutral rows, rejection of an
  empty table, no prototype-key object construction, and no organization ID in
  the content. The adapter must not import Supabase.

- [ ] **Step 3: Implement the supplier adapter**

  Serialize the already validated two-dimensional rows into the exact current
  analysis contract. Domain naming and validation remain in the materials
  feature; the shared parser remains domain-neutral.

- [ ] **Step 4: Replace direct SheetJS parsing in the page**

  Remove the page-level `xlsx` import. Accept `.xlsx,.csv`, remove `.xls`, run
  through the coordinator stamped with the active organization ID, and clear
  selected file/result state when organization changes or the page unmounts.
  Map typed parser errors to existing Turkish notifications without exposing
  raw exceptions.

  For CSV, pass only parsed content into analysis and set the persisted receipt
  file to `null`; explain in the UI that CSV is analyzed but not stored as an
  original document. This avoids silently expanding private Storage MIME/RLS
  policy. XLSX continues through the existing post-save document path.

- [ ] **Step 5: Remove legacy XLS document acceptance**

  In `document-reference.ts`, remove `application/vnd.ms-excel` and legacy
  `.xls` mapping while preserving XLSX for the existing financial-document
  path. Do not add `text/csv` to Storage policy in this task.

- [ ] **Step 6: Run focused tests and lint**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/materials/services/supplier-spreadsheet-adapter.test.ts
  .\node_modules\.bin\eslint.cmd src/app/dashboard/hammaddeler/fis-yukle/page.tsx src/features/materials src/features/documents/document-reference.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: tests/lint/types PASS; `rg` finds no direct `xlsx` import or `.xls`
  acceptance in the supplier route.

- [ ] **Step 7: Commit Task 5**

  ```powershell
  git add -- src/app/dashboard/hammaddeler/fis-yukle/page.tsx src/features/materials/services/supplier-spreadsheet-adapter.ts src/features/materials/services/supplier-spreadsheet-adapter.test.ts src/features/documents/document-reference.ts
  git commit -m "refactor: secure supplier spreadsheet ingestion"
  ```

---

### Task 6: Migrate Z-report ingestion

**Files:**

- Create: `src/features/z-reports/services/z-report-spreadsheet-adapter.ts`
- Create: `src/features/z-reports/services/z-report-spreadsheet-adapter.test.ts`
- Modify: `src/features/z-reports/hooks/useZReportWorkspace.ts`
- Modify: `src/features/z-reports/hooks/useZReportWorkspace.test.ts`
- Modify: `src/features/z-reports/components/ZReportUploadPanel.tsx`

**Adapter interface:**

```ts
export function toZReportAnalysisInput(
  table: SpreadsheetTable,
): { ok: true; content: string } | { ok: false; message: string }
```

- [ ] **Step 1: Extend the hook tests with RED security cases**

  Assert `.xls` rejection, `.xlsx` and `.csv` acceptance, typed timeout/error
  notification, parse cancellation on active-organization change, stale result
  suppression, and preservation of the existing review-before-save behavior.

- [ ] **Step 2: Write RED adapter tests**

  Cover deterministic neutral-row serialization, empty report rejection,
  Turkish characters, and preservation of numeric zero/boolean values. Assert
  that organization context and financial writes do not enter the adapter.

- [ ] **Step 3: Implement the adapter and hook integration**

  Remove the hook-level `xlsx` import. Route both formats through the shared
  coordinator and then through `toZReportAnalysisInput`. The hook owns state;
  the worker and adapter remain unaware of React and Supabase.

  As in the supplier flow, CSV is analysis-only and not persisted as an
  original financial document. Keep XLSX persistence unchanged after a
  successful existing financial write.

- [ ] **Step 4: Update accessible upload guidance**

  Update `ZReportUploadPanel.tsx` so visible help, input `accept`, mobile copy,
  and error text consistently say XLSX/CSV and clearly reject XLS/XLSM. Preserve
  labels, focus behavior, touch target size, and current responsive layout.

- [ ] **Step 5: Run focused tests and scoped checks**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/features/z-reports/hooks/useZReportWorkspace.test.ts src/features/z-reports/services/z-report-spreadsheet-adapter.test.ts
  .\node_modules\.bin\eslint.cmd src/features/z-reports
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: tests/lint/types PASS; no direct `xlsx` import remains in either
  production consumer.

- [ ] **Step 6: Commit Task 6**

  ```powershell
  git add -- src/features/z-reports/hooks/useZReportWorkspace.ts src/features/z-reports/hooks/useZReportWorkspace.test.ts src/features/z-reports/components/ZReportUploadPanel.tsx src/features/z-reports/services/z-report-spreadsheet-adapter.ts src/features/z-reports/services/z-report-spreadsheet-adapter.test.ts
  git commit -m "refactor: secure Z-report spreadsheet ingestion"
  ```

---

### Task 7: Prove closure, update durable evidence, and refresh graphs

**Files:**

- Modify: `docs/security/DEP-01-dependency-vulnerability-audit.md`
- Modify: `docs/superpowers/ROADMAP.md`
- Modify: generated Graphify/codebase-memory artifacts only through their tools

- [ ] **Step 1: Prove the vulnerable consumer paths are gone**

  ```powershell
  rg -n "from ['\"]xlsx['\"]|require\(['\"]xlsx['\"]\)" src
  rg -n "\.xls([^xm]|$)|application/vnd\.ms-excel" src
  npm ls xlsx --all
  npm run verify:sheetjs
  ```

  Expected: only the shared worker/core imports `xlsx`; no legacy `.xls`
  acceptance; one verified `xlsx@0.20.3`; no `0.18.5` node.

- [ ] **Step 2: Run the full local quality gate**

  ```powershell
  npm run format:check
  npm run lint
  npm run typecheck
  npm run test
  npm run build
  ```

  Expected: all commands exit zero. Record exact counts and commit SHA; do not
  summarize a partial run as the full gate.

- [ ] **Step 3: Re-run dependency audits with explicit network approval**

  ```powershell
  npm audit --json
  npm audit --omit=dev --json
  ```

  Capture summaries without committing raw reports containing environment
  metadata. Reclassify the two XLSX findings only when the installed version and
  removed consumer paths prove non-reachability/remediation. DEP-02A Sharp
  closure remains a separate prerequisite for overall DEP-02 closure.

- [ ] **Step 4: Perform desktop and mobile browser smoke tests**

  Test supplier receipt and Z-report pages at 1440x900 and 390x844. Verify:
  valid XLSX/CSV, rejected XLS/XLSM, malformed workbook, timeout, oversize file,
  organization switch mid-parse, review-before-save, keyboard access, visible
  focus, no horizontal overflow, and clear Turkish messages. Confirm no file is
  uploaded during parse and CSV is not persisted as an original document.

- [ ] **Step 5: Update DEP-01 and roadmap evidence**

  Document the old/new dependency identities, vendored digest, parser limits,
  focused/full checks, browser matrix, residual risks, and local-only delivery
  state. Mark DEP-02B `Yerelde tamam` only if every gate above passes. Keep
  overall DEP-02 `Devam ediyor` until DEP-02A and DEP-02B are both proven.

- [ ] **Step 6: Refresh Graphify and codebase-memory**

  ```powershell
  graphify update .
  ```

  Query `parseSpreadsheet`, `parseSpreadsheetBytes`,
  `createSpreadsheetParseCoordinator`, and both domain adapters. Refresh
  codebase-memory through its MCP workflow. Do not manually edit generated
  graph or memory files.

- [ ] **Step 7: Perform the final exact-scope review**

  ```powershell
  git diff --check
  git status --short
  git diff -- package.json package-lock.json
  git diff --check HEAD~1
  ```

  Confirm no secret, environment file, raw customer workbook, network cache, or
  unrelated user change is staged.

- [ ] **Step 8: Commit Task 7**

  ```powershell
  git add -- docs/security/DEP-01-dependency-vulnerability-audit.md docs/superpowers/ROADMAP.md
  git commit -m "docs: record spreadsheet remediation evidence"
  ```

  Report local commit, push, merge, deploy, and production states separately.

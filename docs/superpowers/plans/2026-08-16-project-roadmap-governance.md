# Project Roadmap Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one mobile-readable, evidence-backed project roadmap and an offline validator that prevents task-state drift in local and GitHub quality gates.

**Architecture:** `docs/superpowers/ROADMAP.md` is the human-facing status authority, while specifications, plans, and security runbooks retain technical detail. A dependency-free Node ESM validator parses a strict four-column Markdown contract, resolves repository-local detail links, and reports stable machine-readable issue codes; Vitest exercises the CLI with isolated fixtures and the real roadmap. Existing npm and GitHub Actions quality workflows call the validator explicitly.

**Tech Stack:** Markdown, Node.js 22 ESM standard library, Vitest 1.6, npm scripts, GitHub Actions, Prettier, ESLint, TypeScript, Graphify, codebase-memory MCP

## Global Constraints

- `docs/superpowers/ROADMAP.md` is the only authoritative current project-status snapshot.
- Status values are exactly `Tamamlandı`, `Yerelde tamam`, `Devam ediyor`, `Hazır`, `Bekliyor`, `Engelli`, and `Ertelendi`.
- Normally no more than one roadmap item may be `Devam ediyor`.
- Stable task IDs are never reused for a different outcome.
- Every entry contains ID, workstream, status, outcome, next gate, detail link, and evidence.
- `Tamamlandı` and `Yerelde tamam` entries require non-empty delivery evidence.
- Detail links are relative, checked-in repository files; external and repository-escaping links fail closed.
- Historical checklist state is not used as the current delivery authority.
- Local completion and production verification remain explicitly distinct.
- The validator is deterministic, offline, and introduces no production or development dependency.
- No push, merge, deployment, production migration, external task-system write, or live-data action belongs to this plan.
- Preserve unrelated changes and generated artifacts; stage exact files only.
- The repository's Turkish product language and UTF-8 encoding must be preserved.
- The current Windows Git hook transport cannot start `/bin/bash`. Before each commit, stage exact files and run `.\\node_modules\\.bin\\lint-staged.cmd`; use `git commit --no-verify` only when that exact manual hook passes and the native hook fails solely because `/bin/bash` is unavailable. Any real lint-staged failure remains blocking.

---

## Planned File Structure

| File                                       | Responsibility                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `docs/superpowers/ROADMAP.md`              | Compact human-facing source of current task state, execution order, links, and evidence |
| `scripts/roadmap/validate-roadmap.mjs`     | Dependency-free CLI that parses and validates the roadmap contract                      |
| `scripts/roadmap/validate-roadmap.test.ts` | Isolated invalid/valid fixtures, real-roadmap test, and npm/CI wiring contract          |
| `package.json`                             | Exposes `roadmap:check` and includes it in the full local quality gate                  |
| `.github/workflows/ci.yml`                 | Runs roadmap validation on pushes and pull requests                                     |
| `AGENTS.md`                                | Adds concise repository-wide roadmap update rules without duplicating the specification |
| `.codebase-memory/artifact.json`           | Generated codebase-memory index refreshed after implementation                          |
| `.codebase-memory/graph.db.zst`            | Generated compressed knowledge graph refreshed after implementation                     |

The roadmap uses four display columns to remain usable on narrow screens while
preserving the seven required fields:

```markdown
| ID       | Görev ve sonuç                                                                       | Durum      | Teslimat bilgisi                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SEC-01` | **Organizasyon ve tenant güvenliği**<br>Sonuç: Aktif organizasyon sınırı doğrulandı. | Tamamlandı | Sonraki: Yeni kapsamlı yetkilendirme işlerinde regresyonu koru.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: `6eedbd1`; PR #14 kontrolleri ve üretim doğrulaması |
```

Source rows stay on one physical line. Unescaped pipe characters are not allowed
inside cells. This keeps parsing deterministic without adding a Markdown parser.

---

### Task 1: Build the Offline Roadmap Validator

**Files:**

- Create: `scripts/roadmap/validate-roadmap.mjs`
- Create: `scripts/roadmap/validate-roadmap.test.ts`

**Interfaces:**

- Consumes: `--root <repository-root>` and optional `--roadmap <path-relative-to-root>` CLI options.
- Produces: exit code `0` and `Roadmap validation passed (<count> tasks).` on success.
- Produces: exit code `1`, a `Roadmap validation failed:` heading, and one `[ISSUE_CODE] message` line per issue on failure.
- Produces internally: `validateRoadmap({ repositoryRoot, roadmapPath }): { entries, issues }` for the CLI entry point.
- Roadmap entry source contract: four Markdown cells containing ID; workstream plus `Sonuç:`; exact status; and `Sonraki:`, `Detay:`, and `Kanıt:` labels separated by `<br>`.

- [ ] **Step 1: Write the fixture helper and failing CLI contract tests**

Create `scripts/roadmap/validate-roadmap.test.ts` with a temporary repository for
each test. The helper must create the linked detail document so failures isolate
the intended invariant:

```ts
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = path.resolve('scripts/roadmap/validate-roadmap.mjs')
const temporaryRoots: string[] = []

type RowOverrides = {
  id?: string
  workstream?: string
  outcome?: string
  status?: string
  nextGate?: string
  detail?: string
  evidence?: string
}

function row(overrides: RowOverrides = {}) {
  const values = {
    id: 'ROADMAP-01',
    workstream: 'Merkezi yol haritası',
    outcome: 'Görev durumu tek kaynaktan izlenir.',
    status: 'Devam ediyor',
    nextGate: 'Yerel kalite kapılarını tamamla.',
    detail: 'specs/example.md',
    evidence: 'Tasarım onayı kaydedildi.',
    ...overrides,
  }

  return `| \`${values.id}\` | **${values.workstream}**<br>Sonuç: ${values.outcome} | ${values.status} | Sonraki: ${values.nextGate}<br>Detay: [Ayrıntı](${values.detail})<br>Kanıt: ${values.evidence} |`
}

function createFixture(rows: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motto-roadmap-'))
  temporaryRoots.push(root)
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/superpowers/specs/example.md'), '# Example\n')
  fs.writeFileSync(
    path.join(root, 'docs/superpowers/ROADMAP.md'),
    ['# Roadmap', '', '| ID | Görev ve sonuç | Durum | Teslimat bilgisi |', '| --- | --- | --- | --- |', ...rows].join(
      '\n',
    ),
  )
  return root
}

function runValidator(root: string, roadmap = 'docs/superpowers/ROADMAP.md') {
  return spawnSync(process.execPath, [scriptPath, '--root', root, '--roadmap', roadmap], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('roadmap validator', () => {
  it('accepts a valid repository-local roadmap', () => {
    const result = runValidator(createFixture([row()]))

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Roadmap validation passed (1 tasks).')
  })

  it.each([
    ['DUPLICATE_ID', [row(), row()]],
    ['INVALID_ID', [row({ id: 'roadmap-1' })]],
    ['INVALID_STATUS', [row({ status: 'Bitti' })]],
    ['MISSING_WORKSTREAM', [row({ workstream: ' ' })]],
    ['MISSING_OUTCOME', [row({ outcome: ' ' })]],
    ['MISSING_NEXT_GATE', [row({ nextGate: ' ' })]],
    ['MISSING_EVIDENCE', [row({ evidence: ' ' })]],
    ['MISSING_DETAIL_FILE', [row({ detail: 'specs/missing.md' })]],
    ['EXTERNAL_DETAIL_LINK', [row({ detail: 'https://example.com/plan.md' })]],
    ['MISSING_COMPLETION_EVIDENCE', [row({ status: 'Tamamlandı', evidence: '—' })]],
    ['MULTIPLE_ACTIVE_TASKS', [row(), row({ id: 'SEC-02', workstream: 'Güvenlik incelemesi' })]],
  ])('rejects %s', (issueCode, rows) => {
    const result = runValidator(createFixture(rows))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`[${issueCode}]`)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run scripts\roadmap\validate-roadmap.test.ts
```

Expected: FAIL because `scripts/roadmap/validate-roadmap.mjs` does not exist and
the success fixture receives a non-zero process result.

- [ ] **Step 3: Implement the strict parser and validator**

Create `scripts/roadmap/validate-roadmap.mjs`. Use only `node:fs`, `node:path`,
`node:url`, and `node:util`. The central constants and extraction contract are:

```js
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ALLOWED_STATUSES = new Set([
  'Tamamlandı',
  'Yerelde tamam',
  'Devam ediyor',
  'Hazır',
  'Bekliyor',
  'Engelli',
  'Ertelendi',
])
const COMPLETION_STATUSES = new Set(['Tamamlandı', 'Yerelde tamam'])
const TASK_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d{2}$/
const WORKSTREAM_PATTERN = /^\*\*(?<workstream>.+)\*\*<br>Sonuç:\s*(?<outcome>.*)$/u
const DELIVERY_PATTERN =
  /^Sonraki:\s*(?<nextGate>.*?)<br>Detay:\s*\[[^\]]+\]\((?<detail>[^)]+)\)<br>Kanıt:\s*(?<evidence>.*)$/u
```

Implement these exact responsibilities:

```js
function issue(code, message, line) {
  return { code, message, line }
}

function isInsideRepository(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function parseTaskRows(markdown) {
  return markdown
    .split(/\r?\n/u)
    .map((source, index) => ({ source, line: index + 1 }))
    .filter(({ source }) => /^\|\s*`[^`]+`\s*\|/u.test(source))
    .map(({ source, line }) => ({
      line,
      cells: source
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    }))
}
```

For every parsed row:

1. require exactly four cells and report `WRONG_COLUMN_COUNT` otherwise;
2. remove surrounding backticks from cell one and report `INVALID_ID` when it does not match `TASK_ID_PATTERN`;
3. parse cell two with `WORKSTREAM_PATTERN`; report `MISSING_WORKSTREAM`, `MISSING_OUTCOME`, or `MALFORMED_WORKSTREAM_CELL` as applicable;
4. report `INVALID_STATUS` when cell three is outside the exact status set;
5. parse cell four with `DELIVERY_PATTERN`; report `MISSING_NEXT_GATE`, `MISSING_EVIDENCE`, or `MALFORMED_DELIVERY_CELL` as applicable;
6. reject `http:`, `https:`, protocol-relative, absolute, fragment-only, and query-only detail targets;
7. resolve the detail target relative to `path.dirname(roadmapPath)`;
8. reject paths outside `repositoryRoot` and targets that are not files;
9. require evidence other than `—`, `-`, or `Yok` for completion statuses;
10. report duplicate IDs and more than one `Devam ediyor` entry after all rows are parsed; and
11. report `NO_TASKS` if no task row exists.

Export `validateRoadmap` for focused source inspection, then guard CLI execution
with a comparison between `import.meta.url` and `pathToFileURL(process.argv[1])`.
The CLI defaults are:

```js
const { values } = parseArgs({
  options: {
    root: { type: 'string' },
    roadmap: { type: 'string' },
  },
})
const repositoryRoot = path.resolve(values.root ?? process.cwd())
const roadmapPath = path.resolve(repositoryRoot, values.roadmap ?? 'docs/superpowers/ROADMAP.md')
```

Missing/unreadable roadmap files return `[ROADMAP_UNREADABLE]`; unexpected parser
exceptions return `[VALIDATOR_FAILURE]` without printing a stack trace in normal
CLI output. Set `process.exitCode = 1` for any issue and sort issues by line then
code so output is deterministic.

- [ ] **Step 4: Add the repository-escape regression test**

Extend the table in `validate-roadmap.test.ts` with a fixture whose detail is
`../../../outside.md` and assert `[DETAIL_OUTSIDE_REPOSITORY]`. The validator
checks the resolved boundary before filesystem existence, so the fixture must
not create or clean up a file outside its temporary repository. This
distinguishes a missing internal file from an attempted path escape.

- [ ] **Step 5: Run focused GREEN and targeted quality checks**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run scripts\roadmap\validate-roadmap.test.ts
.\node_modules\.bin\prettier.cmd --check scripts\roadmap\validate-roadmap.mjs scripts\roadmap\validate-roadmap.test.ts
.\node_modules\.bin\eslint.cmd scripts\roadmap\validate-roadmap.mjs scripts\roadmap\validate-roadmap.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
```

Expected: all commands PASS; the focused suite reports the valid fixture plus all
negative contract cases as passing tests.

- [ ] **Step 6: Review and commit Task 1**

Run `git diff --check`, inspect only the two Task 1 files, then commit:

```powershell
git add -- scripts/roadmap/validate-roadmap.mjs scripts/roadmap/validate-roadmap.test.ts
git commit -m "feat: validate project roadmap contract"
```

---

### Task 2: Create the Authoritative Mobile-Readable Roadmap

**Files:**

- Create: `docs/superpowers/ROADMAP.md`
- Modify: `scripts/roadmap/validate-roadmap.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**

- Consumes: the validator's exact four-cell row contract from Task 1.
- Produces: one current status snapshot with stable IDs `SEC-01`, `DOC-01`, `OPS-01`, `ROADMAP-01`, `SEC-02`, `DEP-01`, `OPS-02`, `DB-01`, `DESIGN-01`, and `PLAT-02` through `PLAT-10`.
- Produces: one brief repository-wide contributor rule pointing to `docs/superpowers/ROADMAP.md` and `npm run roadmap:check`.

- [ ] **Step 1: Write the failing real-roadmap test**

Add this test after the fixture tests:

```ts
it('accepts the checked-in authoritative roadmap', () => {
  const result = runValidator(process.cwd())

  expect(result.status).toBe(0)
  expect(result.stdout).toContain('Roadmap validation passed (18 tasks).')
})
```

Run:

```powershell
.\node_modules\.bin\vitest.cmd run scripts\roadmap\validate-roadmap.test.ts
```

Expected: the new test fails with `[ROADMAP_UNREADABLE]` because
`docs/superpowers/ROADMAP.md` does not exist.

- [ ] **Step 2: Create the roadmap header and status legend**

Create `docs/superpowers/ROADMAP.md` with:

```markdown
# Motto SaaS Proje Yol Haritası

**Son doğrulama:** 2026-08-16<br>
**Doğrulanan temel:** `d0bbd790a486a14f9cf3a76d4f23c7ec8c2e11c1`<br>
**Aktif öncelik:** `ROADMAP-01` — Merkezi yol haritası ve yönetim doğrulaması

Bu belge projenin güncel görev durumunun tek özet kaynağıdır. Teknik ayrıntılar
bağlantılı spec, plan ve güvenlik belgelerinde tutulur. Eski planlardaki kutular
tek başına güncel tamamlanma kanıtı sayılmaz.

## Durumlar

- **Tamamlandı:** Gerekli teslimat hedefi kanıtlandı.
- **Yerelde tamam:** Yerel uygulama ve kontroller tamam; teslimat kapısı bekliyor.
- **Devam ediyor:** Şu anki ana görev.
- **Hazır:** Tanımlı ve başlanabilir.
- **Bekliyor:** Adlandırılmış bir önkoşula bağlı.
- **Engelli:** Yetki, erişim, karar veya dış durum bekliyor.
- **Ertelendi:** Bilinçli olarak sonraya bırakıldı.
```

- [ ] **Step 3: Add the verified foundations and immediate queue**

Use one four-column table per section. Add these exact outcomes and evidence:

| ID           | Workstream                                      | Status       | Required delivery content                                                                                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-01`     | Organizasyon ve tenant güvenliği                | Tamamlandı   | Outcome: active-organization and tenant isolation foundation verified. Next: preserve during scoped authorization work. Detail: `specs/2026-08-07-motto-saas-platform-architecture-design.md`. Evidence: `6eedbd1`, PR #14 checks, production verification.                                                                  |
| `DOC-01`     | Özel finansal belge yaşam döngüsü               | Tamamlandı   | Outcome: private storage, stable references, authorized previews, and financial write invariants verified. Next: preserve during location scoping. Detail: `plans/2026-08-07-private-financial-document-storage.md`. Evidence: `9547ecb`, merge `d6c490e`, pgTAP and production closure evidence.                            |
| `OPS-01`     | Üretim veritabanı geçiş kapısı                  | Tamamlandı   | Outcome: manual Production approval, signed backup attestation, and migration checks delivered. Next: require gate for future production DB changes. Detail: `../security/private-financial-document-rollout.md`. Evidence: `2e16632`, merge `d0bbd79`, GitHub Production configuration verification.                        |
| `ROADMAP-01` | Merkezi yol haritası ve yönetim                 | Devam ediyor | Outcome: approved two-layer governance is being implemented. Next: complete validator, CI wiring, and local gates. Detail: `specs/2026-08-16-project-roadmap-governance-design.md`. Evidence: design commit `6f9bdfd`.                                                                                                       |
| `SEC-02`     | Kalan `SECURITY DEFINER` bulguları              | Hazır        | Outcome: every remaining advisor finding will receive an evidence-backed classification. Next: create a focused security review plan before any fix. Detail: `../security/private-financial-document-rollout.md`. Evidence: current production advisor snapshot records 13 callable-surface warnings; refresh at task start. |
| `DEP-01`     | Bağımlılık güvenlik denetimi                    | Hazır        | Outcome: direct and transitive package risks will be classified without forced upgrades. Next: refresh the audit and trace each reachable production path. Detail: `specs/2026-08-16-project-roadmap-governance-design.md`. Evidence: setup audit is time-sensitive and must be refreshed at task start.                     |
| `OPS-02`     | Supabase Storage fiziksel yedekleme ve kurtarma | Hazır        | Outcome: object bytes receive owned, retained, and restore-tested backup coverage. Next: write a backup/recovery design before implementation. Detail: `../security/private-financial-document-rollout.md`. Evidence: current encrypted database backup explicitly excludes physical Storage object bytes.                   |

Render each row with the exact `Sonuç:`, `Sonraki:`, `Detay:`, and `Kanıt:` labels
defined by Task 1. Do not place raw URLs, secrets, command output, or mutable issue
counts in the roadmap.

- [ ] **Step 4: Add architecture, design-tooling, and platform workstreams**

Add these rows with status `Bekliyor`:

| IDs                         | Detail document                                               | Next-gate rule                                                      |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `DB-01`                     | `plans/2026-08-10-drawdb-database-architecture.md`            | Begin after immediate hardening risks are controlled                |
| `DESIGN-01`                 | `plans/2026-08-10-pen-design-foundation-workspace-pilot.md`   | Begin against an approved target domain/navigation contract         |
| `PLAT-02` through `PLAT-10` | `specs/2026-08-07-motto-saas-platform-architecture-design.md` | Use the dependency order in section 16 of the platform architecture |

Use the approved workstream names: location foundation; location-scoped domain
migration; scoped roles and authorization; URL-scoped workspace; onboarding and
three-day trial; subscriptions, entitlements, and quotas; Referral Center and
Motto Balance; platform management center; enterprise integrations.

After the tables, add:

```markdown
## Önerilen uygulama sırası

`ROADMAP-01 → SEC-02 / DEP-01 / OPS-02 → DB-01 → DESIGN-01 → PLAT-02…PLAT-10`

Bağımsız güvenlik ve operasyon işleri güvenli sırayla ele alınabilir. Kritik
tenant, finansal bütünlük, veri kaybı veya kurtarma riski çözülmeden ilgili
platform genişlemesi başlamaz.
```

- [ ] **Step 5: Add concise contributor governance to `AGENTS.md`**

Insert this repository-wide section immediately before `## Verification`:

```markdown
## Roadmap Governance

- Treat `docs/superpowers/ROADMAP.md` as the authoritative current delivery-state summary; detailed specs, plans, and security runbooks remain the implementation source.
- Preserve stable roadmap IDs. Update the relevant roadmap row in the same cohesive commit when work changes status, next gate, detail link, or evidence.
- Never infer current completion solely from historical checkboxes. Distinguish local completion from merged, deployed, migrated, or production-verified work.
- Run `npm run roadmap:check` after roadmap changes. Do not record secrets, raw logs, or mutable external-state claims without a dated verification reference.
```

- [ ] **Step 6: Run the real-roadmap test and targeted document checks**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run scripts\roadmap\validate-roadmap.test.ts
node scripts\roadmap\validate-roadmap.mjs
.\node_modules\.bin\prettier.cmd --check docs\superpowers\ROADMAP.md AGENTS.md scripts\roadmap\validate-roadmap.test.ts
git diff --check
```

Expected: the focused suite passes; the CLI reports exactly 18 tasks; Prettier
and diff checks pass.

- [ ] **Step 7: Review and commit Task 2**

Confirm all detail links resolve from `docs/superpowers/ROADMAP.md`, confirm only
`ROADMAP-01` is active, inspect the three Task 2 files, then commit:

```powershell
git add -- docs/superpowers/ROADMAP.md AGENTS.md scripts/roadmap/validate-roadmap.test.ts
git commit -m "docs: add authoritative project roadmap"
```

---

### Task 3: Enforce the Roadmap Contract Locally and in CI

**Files:**

- Modify: `scripts/roadmap/validate-roadmap.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/superpowers/ROADMAP.md`

**Interfaces:**

- Consumes: `node scripts/roadmap/validate-roadmap.mjs` from Task 1.
- Produces: `npm run roadmap:check`.
- Produces: `npm run check` order `format:check -> roadmap:check -> lint -> typecheck -> test`.
- Produces: a GitHub Actions `Validate project roadmap` step before lint and tests.
- Produces: `ROADMAP-01` state `Yerelde tamam` after all local gates pass, with review/push/PR/CI/merge as its explicit next gate.

- [ ] **Step 1: Write the failing npm and CI integration test**

Add:

```ts
it('keeps roadmap validation in local and GitHub quality gates', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const ciWorkflow = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8')

  expect(packageJson.scripts['roadmap:check']).toBe('node scripts/roadmap/validate-roadmap.mjs')
  expect(packageJson.scripts.check).toBe(
    'npm run format:check && npm run roadmap:check && npm run lint && npm run typecheck && npm run test',
  )
  expect(ciWorkflow).toContain('- name: Validate project roadmap\n        run: npm run roadmap:check')
})
```

Run the focused test. Expected: FAIL because `roadmap:check` and the CI step do
not exist yet.

- [ ] **Step 2: Add the npm quality-gate script**

Modify `package.json` scripts to contain:

```json
"roadmap:check": "node scripts/roadmap/validate-roadmap.mjs",
"check": "npm run format:check && npm run roadmap:check && npm run lint && npm run typecheck && npm run test"
```

Keep all existing dependency versions and lockfile content unchanged because no
package is added or upgraded.

- [ ] **Step 3: Add the GitHub Actions validation step**

In `.github/workflows/ci.yml`, insert immediately after `Check formatting`:

```yaml
- name: Validate project roadmap
  run: npm run roadmap:check
```

Do not add secrets, permissions, network calls, or a separate job.

- [ ] **Step 4: Run focused GREEN and the standalone command**

Run:

```powershell
.\node_modules\.bin\vitest.cmd run scripts\roadmap\validate-roadmap.test.ts
npm run roadmap:check
```

Expected: focused tests pass and the CLI reports 18 valid tasks.

- [ ] **Step 5: Run the full repository quality gate**

Run:

```powershell
npm run check
```

Expected: format, roadmap, ESLint, TypeScript, and Vitest all pass. If the global
npm launcher itself is unavailable, run the exact equivalent project-local
commands and record the launcher failure separately:

```powershell
.\node_modules\.bin\prettier.cmd --check .
node scripts\roadmap\validate-roadmap.mjs
.\node_modules\.bin\eslint.cmd .
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\vitest.cmd run
```

Do not run a production build because this task changes no application runtime,
routing, bundling, or build configuration. Run it only if implementation review
finds an unplanned application/build boundary change, which must be removed or
separately approved.

- [ ] **Step 6: Mark `ROADMAP-01` locally complete**

After all required local checks pass, update only the `ROADMAP-01` row:

- status: `Yerelde tamam`;
- outcome: central roadmap, offline validation, contributor rules, and CI wiring
  are implemented locally;
- next gate: independent review, push, pull request, GitHub CI, and merge;
- evidence: the Task 1 and Task 2 commits plus the passing `npm run check` result.

Run `npm run roadmap:check` again to prove the changed state remains valid.

- [ ] **Step 7: Review and commit Task 3**

Run `git diff --check`, ensure `package-lock.json` is unchanged, inspect the four
Task 3 files, then commit:

```powershell
git add -- package.json .github/workflows/ci.yml scripts/roadmap/validate-roadmap.test.ts docs/superpowers/ROADMAP.md
git commit -m "ci: enforce project roadmap validation"
```

---

### Task 4: Refresh Architecture Knowledge and Perform Final Verification

**Files:**

- Modify: `.codebase-memory/artifact.json`
- Modify: `.codebase-memory/graph.db.zst`
- Verify only: all Task 1-3 files

**Interfaces:**

- Consumes: the completed validator, roadmap, contributor rule, npm script, and CI step.
- Produces: refreshed Graphify and codebase-memory knowledge for the new roadmap validation boundary.
- Produces: a clean, reviewable branch with no application, live-system, or unrelated user changes.

- [ ] **Step 1: Refresh Graphify incrementally**

Run from the isolated worktree root:

```powershell
graphify update .
```

Expected: the update recognizes the roadmap validator, test, roadmap, plan, and
governance documentation. Do not manually edit `graphify-out` outputs.

- [ ] **Step 2: Refresh codebase-memory through its MCP workflow**

Call `mcp__codebase_memory_mcp__index_repository` with:

```json
{
  "repo_path": "W:\\Projeler ilk\\motto-saas\\.worktrees\\architecture-roadmap",
  "name": "motto-saas",
  "mode": "moderate",
  "persistence": true
}
```

Then call `mcp__codebase_memory_mcp__search_graph` with project `motto-saas`,
query `validate roadmap`, `include_connected: true`, and `limit: 20`. Expected:
the query returns the validator and its test plus connected package/CI nodes. Do
not copy or edit generated JSON or compressed graph data manually.

- [ ] **Step 3: Rerun final checks after generated refresh**

Run:

```powershell
npm run roadmap:check
npm run check
.\node_modules\.bin\prettier.cmd --check docs\superpowers\specs\2026-08-16-project-roadmap-governance-design.md docs\superpowers\plans\2026-08-16-project-roadmap-governance.md docs\superpowers\ROADMAP.md
git diff --check
```

Expected: all checks pass. Confirm exactly one active task is not required now
because `ROADMAP-01` is `Yerelde tamam`; zero active tasks is valid between
delivery and selection of the next workstream.

- [ ] **Step 4: Inspect generated and functional boundaries**

Run `git status --short` and inspect:

- all commits since `6f9bdfd`;
- the exact functional diff against `6f9bdfd`;
- `.codebase-memory/artifact.json` as generated output;
- `.codebase-memory/graph.db.zst` as generated output; and
- absence of changes to `next-env.d.ts`, lockfiles, secrets, application source,
  migrations, Supabase configuration, or root-checkout user files.

- [ ] **Step 5: Commit refreshed knowledge artifacts if changed**

Stage only the two tracked codebase-memory outputs and commit:

```powershell
git add -- .codebase-memory/artifact.json .codebase-memory/graph.db.zst
git commit -m "chore: refresh roadmap architecture index"
```

If the refresh deterministically produces byte-identical tracked artifacts,
record that fact in the task report and do not create an empty commit.

- [ ] **Step 6: Prepare the delivery handoff**

Report:

- branch name and commit list;
- roadmap task count and current `ROADMAP-01` state;
- focused test count and full quality-gate result;
- Graphify and codebase-memory refresh result;
- whether tracked generated artifacts changed;
- clean worktree status;
- explicit statement that no push, PR, merge, deployment, production migration,
  external task-system write, or live-data mutation occurred; and
- the next authorization gate: review, then optional push/PR.

Do not mark `ROADMAP-01` as `Tamamlandı` until its required repository delivery
target is proven through the later authorized review, push, pull request, GitHub
CI, and merge process.

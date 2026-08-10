# Pen Design Foundation and Workspace Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a governed Pen workflow that mirrors Motto SaaS design tokens, documents reusable product states, and validates the approved organization/location workspace experience on desktop and mobile without making generated design code or a cloud tool authoritative.

**Architecture:** Existing application styles remain the source of truth. Deterministic local scripts extract a reviewable token contract from `globals.css`; a pinned Pen CLI and its MCP integration consume those tokens to build a design foundation and workspace pilot. Committed manifests and exports are verified offline in CI, while Pen authentication and generation remain local, explicit, and outside the repository.

**Tech Stack:** Node.js 22, ECMAScript modules, Vitest, Next.js 16, React 19, Tailwind CSS 4, shadcn/ui patterns, `@pen.dev/cli@0.3.2`, Pen MCP, Prettier, GitHub Actions.

## Global Constraints

- Begin only after the drawDB current/target architecture pack is approved and the location foundation contract is stable enough to name workspace states accurately.
- Keep `src/app/globals.css`, implemented components, and approved product specifications authoritative; Pen is a design and review surface.
- Do not add Pen to runtime or production dependencies, application bundles, Docker images, or deployment steps.
- Pin the qualified CLI package and version. Do not use an unversioned installer or silently accept a renamed package.
- Never commit Pen sessions, API keys, CI keys, provider keys, cookies, user profiles, environment files, or generated Codex configuration.
- Use synthetic restaurant names, locations, members, amounts, and documents. Never import production screenshots or customer data.
- Do not run AI generation from CI. CI validates committed artifacts entirely offline.
- Do not merge generated code directly. Future code implementation must use a separate reviewed plan, tests, application conventions, and accessibility checks.
- Preserve Turkish product copy and validate desktop and mobile independently.
- Treat `.pen` files as editable design sources, JSON manifests as machine-checkable contracts, and PNG exports as review evidence.
- Stop and request explicit authorization before the first package download, Pen login, MCP registration, or external upload.

---

## Planned File Structure

```text
tools/pen/tool-lock.json
scripts/design/pen-tool.mjs
scripts/design/pen-tool.test.ts
scripts/design/extract-design-tokens.mjs
scripts/design/extract-design-tokens.test.ts
scripts/design/verify-design-artifacts.mjs
scripts/design/verify-design-artifacts.test.ts
design/README.md
design/tokens/colors.json
design/tokens/typography.json
design/tokens/spacing.json
design/tokens/components.json
design/motto-foundation.pen
design/motto-foundation.manifest.json
design/workspace-pilot.pen
design/workspace-pilot.requirements.json
design/workspace-pilot.manifest.json
design/exports/foundation-overview.png
design/exports/workspace-desktop.png
design/exports/workspace-mobile.png
docs/design/workspace-pilot-review.md
```

`extract-design-tokens.mjs` is the only token generator. `verify-design-artifacts.mjs` is the offline CI boundary. Pen-authenticated operations are developer-only and never execute during build, test, or CI.

---

### Task 1: Qualify and isolate the Pen toolchain

**Files:**

- Create: `tools/pen/tool-lock.json`
- Create: `scripts/design/pen-tool.mjs`
- Create: `scripts/design/pen-tool.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**

- Produces: `loadPenToolLock(): PenToolLock`
- Produces: `validatePenToolLock(lock: unknown): PenToolLock`
- Produces: `buildPenCommand(action: PenAction, options?: PenCommandOptions): CommandSpec`
- Produces: CLI actions `prepare`, `version`, `login`, `inspect`, and `export` through `node scripts/design/pen-tool.mjs`

- [ ] **Step 1: Write failing package-identity and command tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildPenCommand, validatePenToolLock } from './pen-tool.mjs'

const lock = {
  package: '@pen.dev/cli',
  version: '0.3.2',
  registry: 'https://registry.npmjs.org',
  integrity: 'sha512-3wjsaQ5Ojh27Z6XdwhjVifIe3J3hqHgmyymT7ARSFx7F+FM79fuMWCqX5GyCUg/aaJVhSbdcsdzrKYQ6dB5Zsw==',
  reviewedAt: '2026-08-10',
  nodeMajor: 22,
}

describe('Pen tool lock', () => {
  it('rejects the legacy package name and floating versions', () => {
    expect(() => validatePenToolLock({ ...lock, package: '@pencil.dev/cli' })).toThrow()
    expect(() => validatePenToolLock({ ...lock, version: 'latest' })).toThrow()
    expect(() => validatePenToolLock({ ...lock, integrity: 'sha512-untrusted' })).toThrow()
  })

  it('builds pinned preparation and tool commands without a shell', () => {
    expect(buildPenCommand('prepare').args).toContain('@pen.dev/cli@0.3.2')
    expect(buildPenCommand('version')).toMatchObject({ shell: false })
  })
})
```

- [ ] **Step 2: Run RED**

```text
npm test -- scripts/design/pen-tool.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Add the reviewed lock**

```json
{
  "package": "@pen.dev/cli",
  "version": "0.3.2",
  "registry": "https://registry.npmjs.org",
  "integrity": "sha512-3wjsaQ5Ojh27Z6XdwhjVifIe3J3hqHgmyymT7ARSFx7F+FM79fuMWCqX5GyCUg/aaJVhSbdcsdzrKYQ6dB5Zsw==",
  "reviewedAt": "2026-08-10",
  "nodeMajor": 22
}
```

- [ ] **Step 4: Implement the guarded wrapper**

Use `spawnSync` with argument arrays and `shell: false`. `prepare` installs the exact locked package into `.tools/pen` only after external-download approval, then verifies package name, version, registry integrity, and the reported CLI version. Resolve every other action from that isolated installation. Refuse unknown actions, paths outside the repository design directory, non-`.pen` source files, and exports outside `design/exports`.

Before `login`, hash any explicitly supplied Codex configuration file. After the command, compare the hash and fail with recovery guidance if Pen modified or duplicated the configuration. Never discover or edit user-level Codex configuration automatically.

The wrapper must explain that login/session state lives outside Git and must never print session contents. `inspect` and `export` require an authenticated local session; `version` does not.

- [ ] **Step 5: Isolate local state and add scripts**

Add ignored local paths:

```gitignore
/.tools/
/design/.pen-local/
```

Add scripts:

```json
{
  "pen:prepare": "node scripts/design/pen-tool.mjs prepare",
  "pen:version": "node scripts/design/pen-tool.mjs version",
  "pen:login": "node scripts/design/pen-tool.mjs login",
  "pen:inspect": "node scripts/design/pen-tool.mjs inspect",
  "pen:export": "node scripts/design/pen-tool.mjs export"
}
```

Do not add a package dependency. `pen:prepare` and `pen:login` are interactive developer operations and never run from tests, builds, or CI.

- [ ] **Step 6: Run GREEN and commit**

```text
npm test -- scripts/design/pen-tool.test.ts
npm run format:check
git diff --check
```

```text
git add tools/pen/tool-lock.json scripts/design/pen-tool.mjs scripts/design/pen-tool.test.ts .gitignore package.json
git commit -m "chore: pin Pen design tooling"
```

---

### Task 2: Extract deterministic application design tokens

**Files:**

- Create: `scripts/design/extract-design-tokens.mjs`
- Create: `scripts/design/extract-design-tokens.test.ts`
- Create: `design/tokens/colors.json`
- Create: `design/tokens/typography.json`
- Create: `design/tokens/spacing.json`
- Create: `design/tokens/components.json`
- Modify: `package.json`

**Interfaces:**

- Produces: `extractCssCustomProperties(css: string): CssVariableMap`
- Produces: `classifyDesignTokens(variables: CssVariableMap): DesignTokenSet`
- Produces: `serializeTokenFiles(tokens: DesignTokenSet): Record<TokenFileName, string>`
- Consumes: `src/app/globals.css`

- [ ] **Step 1: Write failing extraction and determinism tests**

Cover balanced CSS blocks, `@theme inline`, `:root`, `.dark`, comments, nested functions, stable key ordering, duplicate semantic names, invalid empty values, and repeatable output. Include a fixture proving that a dark token cannot silently overwrite a light token with the same unqualified name.

- [ ] **Step 2: Run RED**

```text
npm test -- scripts/design/extract-design-tokens.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the dependency-free extractor**

Parse balanced blocks and declarations without regular-expression-only block parsing and without adding a CSS parser dependency. Preserve CSS expressions as strings; do not resolve colors or invent new values.

Classify tokens into:

- `colors.json`: semantic surfaces, content, borders, accent, status, chart, and light/dark modes.
- `typography.json`: families, sizes, weights, line heights, and tracking present in source.
- `spacing.json`: spacing, radii, layout widths, touch sizing, and safe-area values present in source.
- `components.json`: reusable component-level values already implemented, with source variable references rather than duplicated literals.

Each file includes `schemaVersion`, `generatedFrom`, `sourceSha256`, and sorted `tokens`. The generator writes atomically and only when content changes.

- [ ] **Step 4: Add generation and verification scripts**

```json
{
  "design:tokens": "node scripts/design/extract-design-tokens.mjs",
  "design:tokens:check": "node scripts/design/extract-design-tokens.mjs --check"
}
```

`--check` generates in memory and fails on drift without modifying files.

- [ ] **Step 5: Run GREEN and commit**

```text
npm run design:tokens
npm test -- scripts/design/extract-design-tokens.test.ts
npm run design:tokens:check
npm run format:check
git diff --check
```

Review the generated values against `src/app/globals.css` and confirm no second palette was invented.

```text
git add scripts/design/extract-design-tokens.mjs scripts/design/extract-design-tokens.test.ts design/tokens package.json
git commit -m "feat: extract governed design tokens"
```

---

### Task 3: Build the Motto Design Foundation in Pen

**Files:**

- Create: `design/motto-foundation.pen`
- Create: `design/motto-foundation.manifest.json`
- Create: `design/exports/foundation-overview.png`
- Create: `scripts/design/verify-design-artifacts.mjs`
- Create: `scripts/design/verify-design-artifacts.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `design/tokens/*.json`
- Produces: `verifyFoundationManifest(manifest: unknown, tokens: DesignTokenSet): Finding[]`
- Produces: `verifyArtifactFile(path: string, expectedSha256: string): Finding[]`

- [ ] **Step 1: Write failing foundation-contract tests**

Require manifest fields for schema version, Pen document path, token source hashes, component inventory, component states, export path, export hash, synthetic-data declaration, and review timestamp. Reject missing focus/disabled/error states, unknown token names, external URLs, secret-like content, absolute user paths, and missing files.

- [ ] **Step 2: Run RED**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement the offline verifier**

Return structured findings with codes:

```text
TOKEN_DRIFT
UNKNOWN_TOKEN
MISSING_COMPONENT_STATE
MISSING_ARTIFACT
ARTIFACT_HASH_MISMATCH
NON_SYNTHETIC_DATA
SECRET_PATTERN
EXTERNAL_REFERENCE
ABSOLUTE_PATH
INVALID_MANIFEST
```

The verifier may parse manifests and token JSON, check file signatures and hashes, and inspect textual `.pen` metadata when supported. It must not call Pen, the network, or an AI provider.

- [ ] **Step 4: Create the foundation through the authenticated local Pen session**

After explicit external-tool authorization, use Pen's editor-state and variable tools to create `motto-foundation.pen`. Import the committed token contract and build reusable examples for:

- typography hierarchy;
- color and surface roles;
- spacing and radii;
- buttons and icon buttons;
- text inputs, select controls, and validation messages;
- cards, metrics, tables, tabs, badges, notifications, drawers, and dialogs;
- loading, empty, error, disabled, read-only, permission-denied, focus-visible, hover, and pressed states.

Use only synthetic Turkish labels and values. Keep component names stable and semantic.

- [ ] **Step 5: Inspect, export, and record provenance**

Run Pen layout inspection before export. Correct overlaps, clipping, zero-size layers, unreachable controls, inconsistent spacing, and missing accessible labels. Export `foundation-overview.png`, compute its SHA-256, and write the exact foundation manifest from observed document metadata.

- [ ] **Step 6: Run GREEN and commit**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
node scripts/design/verify-design-artifacts.mjs --scope foundation
npm run design:tokens:check
npm run format:check
git diff --check
```

```text
git add design/motto-foundation.pen design/motto-foundation.manifest.json design/exports/foundation-overview.png scripts/design/verify-design-artifacts.mjs scripts/design/verify-design-artifacts.test.ts package.json
git commit -m "design: establish Motto design foundation"
```

---

### Task 4: Design the organization/location workspace pilot

**Files:**

- Create: `design/workspace-pilot.requirements.json`
- Create: `design/workspace-pilot.pen`
- Create: `design/workspace-pilot.manifest.json`
- Create: `design/exports/workspace-desktop.png`
- Create: `design/exports/workspace-mobile.png`
- Modify: `scripts/design/verify-design-artifacts.mjs`
- Modify: `scripts/design/verify-design-artifacts.test.ts`

**Interfaces:**

- Produces: `verifyWorkspaceRequirements(requirements: unknown): Finding[]`
- Produces: `verifyWorkspaceManifest(manifest: unknown, requirements: WorkspaceRequirements): Finding[]`

- [ ] **Step 1: Write failing workspace coverage tests**

Require exact frame coverage:

```json
{
  "desktop": { "width": 1440, "height": 900 },
  "mobile": { "width": 390, "height": 844 },
  "flows": [
    "single-location-direct-entry",
    "location-switcher",
    "all-locations-read-only",
    "unsaved-change-confirmation",
    "access-lost"
  ],
  "states": ["loading", "empty", "error", "read-only", "permission-denied"]
}
```

Reject missing frames, renamed required flows, desktop-only coverage, dimensions that differ from the contract, customer data, unsupported claims, and manifestations that omit organization/location scope.

- [ ] **Step 2: Run RED**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
```

Expected: new workspace assertions fail.

- [ ] **Step 3: Record the approved product contract**

Write `workspace-pilot.requirements.json` from the approved platform architecture specification and drawDB target diagram. The workspace contract must show:

- current organization and location as distinct concepts;
- single-location users entering directly without a redundant chooser;
- multi-location users switching through one consistent control;
- all-locations mode as explicitly read-only unless a later domain specification authorizes aggregate mutation;
- unsaved-change confirmation before changing context;
- access-loss handling that closes sensitive content and returns to a valid scope;
- owner/admin role cues without implying client-side authorization.

- [ ] **Step 4: Create desktop and mobile workspace frames**

Reuse only foundation components and tokens. Design desktop and mobile frames for every required flow/state. The mobile design must preserve safe areas, reachable bottom actions, readable dialogs, no horizontal overflow, and at least 44-by-44-pixel touch targets.

Include a concise context header, organization/location switcher, permission-aware navigation, page heading, content frame, feedback surface, and recovery action. Avoid exposing internal tenant IDs.

- [ ] **Step 5: Inspect layout and export evidence**

Use Pen layout inspection and screenshots for all required frames. Resolve every overlap, clipping, collapsed layer, overflow, and inconsistent constraint before export. Export the representative desktop and mobile frames, hash them, and record exact source/token/requirements hashes in `workspace-pilot.manifest.json`.

- [ ] **Step 6: Run GREEN and commit**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
node scripts/design/verify-design-artifacts.mjs --scope workspace
npm run design:tokens:check
npm run format:check
git diff --check
```

```text
git add design/workspace-pilot.requirements.json design/workspace-pilot.pen design/workspace-pilot.manifest.json design/exports/workspace-desktop.png design/exports/workspace-mobile.png scripts/design/verify-design-artifacts.mjs scripts/design/verify-design-artifacts.test.ts
git commit -m "design: validate organization workspace pilot"
```

---

### Task 5: Complete accessibility, product, and engineering handoff review

**Files:**

- Create: `docs/design/workspace-pilot-review.md`
- Modify: `design/workspace-pilot.manifest.json`
- Modify: `scripts/design/verify-design-artifacts.mjs`
- Modify: `scripts/design/verify-design-artifacts.test.ts`

- [ ] **Step 1: Write failing review-evidence tests**

Require a structured review manifest covering keyboard order, visible focus, contrast review, 44-pixel touch targets, safe areas, reduced-motion behavior, Turkish copy, responsive overflow, dialog semantics, read-only clarity, error recovery, and permission language. Require reviewer, date, outcome, evidence path, and unresolved-risk count for each category.

- [ ] **Step 2: Run RED**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
```

Expected: missing review evidence fails.

- [ ] **Step 3: Perform the review at both target sizes**

Document observations and corrections in `workspace-pilot-review.md`. Verify:

- text and controls remain readable at 200 percent zoom;
- keyboard focus order follows visual order;
- focus is visible on all interactive controls;
- status is not communicated by color alone;
- Turkish labels remain clear without clipping;
- confirmation dialogs identify unsaved work and destination context;
- read-only and permission-denied states explain why and what the user can do;
- reduced-motion mode preserves meaning;
- mobile safe areas and virtual-keyboard conditions do not hide the primary action.

Any unverified item remains explicitly open and blocks the pilot approval status.

- [ ] **Step 4: Write the future code-handoff contract**

The review must state that implementation will occur in a separate plan after location-domain migrations and authorization contracts exist. It must map design elements to existing source boundaries (`src/app`, `src/features`, shared components, context, and database authority) without generating or committing application code.

- [ ] **Step 5: Run GREEN and commit**

```text
npm test -- scripts/design/verify-design-artifacts.test.ts
node scripts/design/verify-design-artifacts.mjs --scope workspace
npm run format:check
git diff --check
```

```text
git add docs/design/workspace-pilot-review.md design/workspace-pilot.manifest.json scripts/design/verify-design-artifacts.mjs scripts/design/verify-design-artifacts.test.ts
git commit -m "docs: approve workspace design pilot"
```

---

### Task 6: Add offline CI verification and close the design workflow

**Files:**

- Create: `design/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Add the offline design gate**

Add scripts:

```json
{
  "design:verify": "node scripts/design/verify-design-artifacts.mjs --all",
  "design:check": "npm run design:tokens:check && npm run design:verify"
}
```

Run `npm run design:check` in CI after typecheck and before the production build. It must require no Pen installation, session, API key, network access, Docker, or AI provider.

- [ ] **Step 2: Document local and CI boundaries**

`design/README.md` must explain tool qualification, explicit login approval, token generation, Pen source editing, layout inspection, export hashing, offline verification, synthetic-data requirements, configuration recovery, and code-handoff prohibition. The root README links to this guide without presenting Pen as a runtime service.

- [ ] **Step 3: Prove secret and privacy safety**

Scan staged design artifacts for Supabase project URLs, JWT shapes, provider keys, email addresses, absolute user paths, session paths, production organization names, public document URLs, and base64 document payloads. Review every match; do not rely solely on an allowlist.

- [ ] **Step 4: Run the complete quality gate**

```text
npm run design:check
npm run check
npm run build
git diff --check
```

Run `graphify update .` and refresh codebase-memory. Review generated graph changes and include only artifacts required by repository policy.

- [ ] **Step 5: Request independent architecture and design review**

Review the full implementation range for external-tool supply-chain risk, authentication/config mutation, secret leakage, token drift, artifact determinism, mobile state completeness, accessibility, tenant-language accuracy, CI isolation, and accidental generated-code authority. Fix every Critical/Important finding and rerun all gates.

- [ ] **Step 6: Commit closure updates**

```text
git add .github/workflows/ci.yml README.md design/README.md package.json
git commit -m "chore: verify governed design workflow"
```

## Definition of Done

- [ ] Pen tooling is version-pinned, locally isolated, explicitly authorized, and absent from runtime dependencies.
- [ ] Application tokens generate deterministically from implemented CSS and pass drift checks.
- [ ] The foundation `.pen` source, manifest, and export contain only synthetic data and match committed tokens.
- [ ] The workspace pilot covers every approved desktop/mobile flow and state.
- [ ] Accessibility and responsive review evidence has no unresolved blocking item.
- [ ] CI verifies tokens, manifests, hashes, privacy rules, and artifact coverage entirely offline.
- [ ] No generated application code, session, secret, environment file, or Codex configuration is committed.
- [ ] Full quality gates, Graphify/codebase-memory refresh, and independent review pass.

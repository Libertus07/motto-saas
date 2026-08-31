# Next.js 16.3.3 ve Sharp 0.35.3 Uyumluluk Yükseltmesi Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motto SaaS'ı exact `next@16.3.3` ve framework tarafından çözülen tek
`sharp@0.35.3` node'una taşırken mevcut user-image, PWA, mobil ve build
davranışlarını korumak.

**Architecture:** Önce package/lockfile kimliğini fail-closed doğrulayan bağımsız
bir güvenlik guard'ı eklenir. Ardından yalnız Next ve eslint-config-next exact
sürümleri yükseltilir; Windows, Linux/Node 22, PWA ve ana-ajan tarayıcı matrisi
kanıtlanır. Son aşama audit, Graphify, codebase-memory ve durable roadmap
kanıtlarını günceller; production teslimatı ayrı yetki kapısı olarak kalır.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node.js 22/24,
Sharp/libvips, npm lockfile v3, `@ducanh2912/next-pwa`, Vitest, Playwright,
Docker, Graphify, codebase-memory

**Spec:**
`docs/superpowers/specs/2026-08-31-next-sharp-compatibility-upgrade-design.md`

## Global Constraints

- Hedef direct dependency exact `next@16.3.3` ve exact
  `eslint-config-next@16.3.3` olmalıdır.
- Sharp doğrudan dependency veya override olarak eklenmez; Next'in
  `sharp: ^0.35.3` optional contract'ından tek exact `sharp@0.35.3` çözülür.
- `--force`, `--legacy-peer-deps`, `overrides` ve `resolutions` kullanılmaz.
- React, React DOM, Supabase, SheetJS, PWA ve ilgisiz direct dependency sürümleri
  değiştirilmez.
- `SafeUserImage` zorunlu `unoptimized` davranışı ve exact `imageConfig`
  politikası gevşetilmez.
- Zorunlu runtime tabanı Node `>=20.9.0`; kanonik CI runtime'ı Node `22.x`;
  repository bu görevde yeni `engines` alanı eklemez.
- User-controlled image URL, signed query, secret, organizasyon kimliği, müşteri
  verisi ve ham native image hatası rapora veya log'a yazılmaz.
- Browser işlemlerini ana ajan yapar; subagent browser veya hosted/live sisteme
  erişmez.
- Hosted Supabase, production veri, push, merge, deploy ve production rollout bu
  planın yerel implementation yetkisi içinde değildir.
- Her build yalnız process-local sentetik public Supabase değerleri kullanır;
  `.env*` dosyası okunmaz, yazılmaz veya commitlenmez.
- Generated `next-env.d.ts` drift'i, önceden var olan kullanıcı değişikliği yoksa
  geri alınır.

---

### Task 1: Fail-closed Next/Sharp dependency contract guard'ı

**Files:**

- Create: `scripts/security/verify-next-sharp-compatibility.mjs`
- Create: `scripts/security/verify-next-sharp-compatibility.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: parsed root `package.json` and npm lockfile v3 objects.
- Produces:

  ```js
  export function verifyNextSharpCompatibility({ packageJson, packageLock })
  // returns { nextVersion, eslintConfigNextVersion, sharpVersion }
  // throws Error on every contract mismatch
  ```

- CLI contract: `node scripts/security/verify-next-sharp-compatibility.mjs`
  loads repository manifests, prints one success line, or exits `1` with one
  sanitized contract error.
- Task 2 consumes the guard as the RED/GREEN dependency identity gate.

- [ ] **Step 1: Write the failing verifier tests**

  Create `scripts/security/verify-next-sharp-compatibility.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'

  import { verifyNextSharpCompatibility } from './verify-next-sharp-compatibility.mjs'

  function createValidContract() {
    return {
      packageJson: {
        dependencies: { next: '16.3.3' },
        devDependencies: { 'eslint-config-next': '16.3.3' },
      },
      packageLock: {
        lockfileVersion: 3,
        packages: {
          '': {
            dependencies: { next: '16.3.3' },
            devDependencies: { 'eslint-config-next': '16.3.3' },
          },
          'node_modules/next': {
            version: '16.3.3',
            optionalDependencies: { sharp: '^0.35.3' },
          },
          'node_modules/eslint-config-next': { version: '16.3.3' },
          'node_modules/sharp': { version: '0.35.3' },
        },
      },
    }
  }

  type ContractFixture = ReturnType<typeof createValidContract>

  const invalidCases: Array<[string, (fixture: ContractFixture) => void, string]> = [
    [
      'non-exact Next dependency',
      (fixture) => {
        fixture.packageJson.dependencies.next = '^16.3.3'
      },
      'project next dependency must be exactly 16.3.3.',
    ],
    [
      'misaligned eslint-config-next',
      (fixture) => {
        fixture.packageJson.devDependencies['eslint-config-next'] = '16.2.9'
      },
      'project eslint-config-next dependency must be exactly 16.3.3.',
    ],
    [
      'direct Sharp dependency',
      (fixture) => {
        Object.assign(fixture.packageJson.dependencies, { sharp: '0.35.3' })
      },
      'project must not declare sharp directly.',
    ],
    [
      'Sharp override',
      (fixture) => {
        Object.assign(fixture.packageJson, { overrides: { sharp: '0.35.3' } })
      },
      'project must not override sharp.',
    ],
    [
      'lockfile root drift',
      (fixture) => {
        fixture.packageLock.packages[''].dependencies.next = '16.2.12'
      },
      'lockfile root next dependency must be exactly 16.3.3.',
    ],
    [
      'unexpected Next package',
      (fixture) => {
        fixture.packageLock.packages['node_modules/next'].version = '16.2.12'
      },
      'installed Next package must be exactly 16.3.3.',
    ],
    [
      'unsupported Next Sharp range',
      (fixture) => {
        fixture.packageLock.packages['node_modules/next'].optionalDependencies.sharp = '^0.34.5'
      },
      'Next must declare the sharp ^0.35.3 optional contract.',
    ],
    [
      'old Sharp package',
      (fixture) => {
        fixture.packageLock.packages['node_modules/sharp'].version = '0.34.5'
      },
      'installed Sharp package must be exactly 0.35.3.',
    ],
    [
      'duplicate nested Sharp package',
      (fixture) => {
        Object.assign(fixture.packageLock.packages, {
          'node_modules/example/node_modules/sharp': { version: '0.35.3' },
        })
      },
      'lockfile must contain exactly one Sharp package node.',
    ],
  ]

  describe('verify-next-sharp-compatibility', () => {
    it('accepts the exact supported Next, ESLint, and Sharp identity', () => {
      expect(verifyNextSharpCompatibility(createValidContract())).toEqual({
        nextVersion: '16.3.3',
        eslintConfigNextVersion: '16.3.3',
        sharpVersion: '0.35.3',
      })
    })

    it.each(invalidCases)('rejects %s', (_caseName, mutate, expectedMessage) => {
      const fixture = createValidContract()
      mutate(fixture)

      expect(() => verifyNextSharpCompatibility(fixture)).toThrow(expectedMessage)
    })
  })
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```powershell
  .\node_modules\.bin\vitest.cmd run scripts/security/verify-next-sharp-compatibility.test.ts
  ```

  Expected: FAIL because `verify-next-sharp-compatibility.mjs` does not exist.

- [ ] **Step 3: Implement the deterministic verifier**

  Create `scripts/security/verify-next-sharp-compatibility.mjs`:

  ```js
  import { readFileSync } from 'node:fs'
  import path from 'node:path'
  import { pathToFileURL } from 'node:url'

  const EXPECTED_NEXT = '16.3.3'
  const EXPECTED_ESLINT_CONFIG_NEXT = '16.3.3'
  const EXPECTED_SHARP = '0.35.3'
  const EXPECTED_NEXT_SHARP_RANGE = '^0.35.3'

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  function requireRecord(value, message) {
    if (!isRecord(value)) throw new Error(message)
    return value
  }

  function hasOwn(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key)
  }

  function readJson(filePath, message) {
    try {
      const value = JSON.parse(readFileSync(filePath, 'utf8'))
      return requireRecord(value, message)
    } catch {
      throw new Error(message)
    }
  }

  function assertNoDirectSharp(packageJson) {
    for (const sectionName of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      const section = packageJson[sectionName]
      if (isRecord(section) && hasOwn(section, 'sharp')) {
        throw new Error('project must not declare sharp directly.')
      }
    }

    for (const sectionName of ['overrides', 'resolutions']) {
      const section = packageJson[sectionName]
      if (isRecord(section) && hasOwn(section, 'sharp')) {
        throw new Error('project must not override sharp.')
      }
    }
  }

  export function verifyNextSharpCompatibility({ packageJson, packageLock }) {
    const project = requireRecord(packageJson, 'project package contract is invalid.')
    const lock = requireRecord(packageLock, 'package lock contract is invalid.')
    const dependencies = requireRecord(project.dependencies, 'project dependencies are invalid.')
    const devDependencies = requireRecord(project.devDependencies, 'project devDependencies are invalid.')

    if (dependencies.next !== EXPECTED_NEXT) {
      throw new Error('project next dependency must be exactly 16.3.3.')
    }
    if (devDependencies['eslint-config-next'] !== EXPECTED_ESLINT_CONFIG_NEXT) {
      throw new Error('project eslint-config-next dependency must be exactly 16.3.3.')
    }
    assertNoDirectSharp(project)

    if (lock.lockfileVersion !== 3) {
      throw new Error('package lock must use lockfileVersion 3.')
    }

    const packages = requireRecord(lock.packages, 'package lock packages are invalid.')
    const root = requireRecord(packages[''], 'package lock root package is missing.')
    const rootDependencies = requireRecord(root.dependencies, 'lockfile root dependencies are invalid.')
    const rootDevDependencies = requireRecord(root.devDependencies, 'lockfile root devDependencies are invalid.')

    if (rootDependencies.next !== EXPECTED_NEXT) {
      throw new Error('lockfile root next dependency must be exactly 16.3.3.')
    }
    if (rootDevDependencies['eslint-config-next'] !== EXPECTED_ESLINT_CONFIG_NEXT) {
      throw new Error('lockfile root eslint-config-next dependency must be exactly 16.3.3.')
    }

    const nextPackage = requireRecord(packages['node_modules/next'], 'installed Next package is missing.')
    if (nextPackage.version !== EXPECTED_NEXT) {
      throw new Error('installed Next package must be exactly 16.3.3.')
    }
    const nextOptionalDependencies = requireRecord(
      nextPackage.optionalDependencies,
      'Next optional dependency contract is missing.',
    )
    if (nextOptionalDependencies.sharp !== EXPECTED_NEXT_SHARP_RANGE) {
      throw new Error('Next must declare the sharp ^0.35.3 optional contract.')
    }

    const eslintPackage = requireRecord(
      packages['node_modules/eslint-config-next'],
      'installed eslint-config-next package is missing.',
    )
    if (eslintPackage.version !== EXPECTED_ESLINT_CONFIG_NEXT) {
      throw new Error('installed eslint-config-next package must be exactly 16.3.3.')
    }

    const sharpEntries = Object.entries(packages).filter(([packagePath]) => packagePath.endsWith('node_modules/sharp'))
    if (sharpEntries.length !== 1) {
      throw new Error('lockfile must contain exactly one Sharp package node.')
    }
    const [sharpPath, sharpPackageValue] = sharpEntries[0]
    if (sharpPath !== 'node_modules/sharp') {
      throw new Error('Sharp package must resolve at the root node_modules boundary.')
    }
    const sharpPackage = requireRecord(sharpPackageValue, 'installed Sharp package is invalid.')
    if (sharpPackage.version !== EXPECTED_SHARP) {
      throw new Error('installed Sharp package must be exactly 0.35.3.')
    }

    return {
      nextVersion: nextPackage.version,
      eslintConfigNextVersion: eslintPackage.version,
      sharpVersion: sharpPackage.version,
    }
  }

  function main() {
    try {
      const projectDir = process.cwd()
      const result = verifyNextSharpCompatibility({
        packageJson: readJson(path.join(projectDir, 'package.json'), 'project package contract is invalid.'),
        packageLock: readJson(path.join(projectDir, 'package-lock.json'), 'package lock contract is invalid.'),
      })
      process.stdout.write(
        `Next/Sharp verification passed: next=${result.nextVersion} eslint-config-next=${result.eslintConfigNextVersion} sharp=${result.sharpVersion}\n`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`Next/Sharp verification failed: ${message}\n`)
      process.exitCode = 1
    }
  }

  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
  ```

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run the command from Step 2.

  Expected: 10 tests PASS.

- [ ] **Step 5: Add the repository verification command**

  Add this exact script to `package.json#scripts` immediately after
  `verify:sheetjs`:

  ```json
  "verify:next-sharp": "node scripts/security/verify-next-sharp-compatibility.mjs"
  ```

- [ ] **Step 6: Prove the repository is RED before the package update**

  Run:

  ```powershell
  npm run verify:next-sharp
  ```

  Expected: exit `1` with
  `project next dependency must be exactly 16.3.3.`. This is the intended RED
  state consumed by Task 2; do not weaken the guard to make the old tree pass.

- [ ] **Step 7: Run Task 1 static and regression checks**

  ```powershell
  .\node_modules\.bin\prettier.cmd --check scripts/security/verify-next-sharp-compatibility.mjs scripts/security/verify-next-sharp-compatibility.test.ts package.json
  .\node_modules\.bin\eslint.cmd scripts/security/verify-next-sharp-compatibility.mjs scripts/security/verify-next-sharp-compatibility.test.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  .\node_modules\.bin\vitest.cmd run scripts/security/verify-next-sharp-compatibility.test.ts
  git diff --check
  ```

  Expected: all commands exit `0`; only the explicit repository CLI remains RED
  until Task 2.

- [ ] **Step 8: Commit Task 1**

  ```powershell
  git add -- package.json scripts/security/verify-next-sharp-compatibility.mjs scripts/security/verify-next-sharp-compatibility.test.ts
  git commit -m "test: enforce Next Sharp compatibility contract"
  ```

---

### Task 2: Exact Next, ESLint ve Sharp lockfile yükseltmesi

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: Task 1 `npm run verify:next-sharp` fail-closed contract.
- Produces: exact direct `next@16.3.3`, exact dev
  `eslint-config-next@16.3.3`, Next-owned single `sharp@0.35.3`, and a clean npm
  lockfile v3 install graph.
- Task 3 consumes this exact dependency tree for Windows/Linux/PWA/browser
  compatibility evidence.

- [ ] **Step 1: Reconfirm clean scope and RED identity**

  ```powershell
  git status --short
  npm run verify:next-sharp
  npm ls next sharp eslint-config-next --all
  ```

  Expected: worktree clean; verifier exit `1` on `next@16.2.12`; installed tree
  reports `next@16.2.12`, `sharp@0.34.5`, and
  `eslint-config-next@16.2.9`.

- [ ] **Step 2: Change only the two direct version declarations**

  In `package.json`, make exactly these substitutions:

  ```diff
  -"next": "16.2.12",
  +"next": "16.3.3",
  ```

  ```diff
  -"eslint-config-next": "16.2.9",
  +"eslint-config-next": "16.3.3",
  ```

  Do not change dependency ordering or any other direct version.

- [ ] **Step 3: Regenerate only the npm lockfile contract**

  With explicit network approval, run:

  ```powershell
  npm install --package-lock-only --ignore-scripts
  ```

  Expected: exit `0`; `package.json` retains only the two approved direct version
  changes; `package-lock.json` resolves Next 16.3.3, its matching `@next/*`
  packages, eslint-config-next 16.3.3 and Sharp 0.35.3 platform packages.

- [ ] **Step 4: Reject unrelated manifest or lockfile drift**

  ```powershell
  git diff -- package.json
  git diff --stat -- package-lock.json
  git diff --check
  ```

  Then run a small read-only identity summary:

  ```powershell
  node -e "const p=require('./package.json');const l=require('./package-lock.json');console.log({next:p.dependencies.next,eslint:p.devDependencies['eslint-config-next'],lockNext:l.packages['node_modules/next']?.version,lockSharp:l.packages['node_modules/sharp']?.version,lockEslint:l.packages['node_modules/eslint-config-next']?.version})"
  ```

  Expected: direct manifest diff contains only Next and eslint-config-next; the
  summary is `16.3.3`, `16.3.3`, `16.3.3`, `0.35.3`, `16.3.3`. If npm rewrites
  an unrelated direct dependency, stop and restore only that unintended hunk
  before continuing.

- [ ] **Step 5: Perform a clean Windows install**

  With explicit network approval, run:

  ```powershell
  npm ci
  ```

  Expected: exit `0` without `--force` or peer-dependency bypass; Husky prepare
  completes; Sharp's Windows optional binary resolves through the lockfile.

- [ ] **Step 6: Verify the GREEN dependency and native contracts**

  ```powershell
  npm run verify:next-sharp
  npm ls next sharp eslint-config-next --all
  npm explain sharp
  node -e "const sharp=require('sharp');console.log({sharp:require('sharp/package.json').version,libvips:sharp.versions.vips})"
  ```

  Expected:

  - verifier exit `0`;
  - one `next@16.3.3`;
  - one root `sharp@0.35.3`, explained only by Next's optional dependency;
  - one `eslint-config-next@16.3.3`;
  - native Sharp load succeeds and reports a non-empty libvips version;
  - no direct Sharp dependency or override.

- [ ] **Step 7: Run focused security and image regression tests**

  ```powershell
  .\node_modules\.bin\vitest.cmd run scripts/security/verify-next-sharp-compatibility.test.ts src/components/ui/SafeUserImage.test.tsx src/components/ui/safe-user-image-boundaries.test.ts src/config/image-policy.test.ts
  .\node_modules\.bin\eslint.cmd scripts/security/verify-next-sharp-compatibility.mjs scripts/security/verify-next-sharp-compatibility.test.ts src/components/ui/SafeUserImage.tsx src/config/image-policy.ts next.config.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: 31 focused tests PASS; ESLint and TypeScript exit `0`. The count is
  Task 1 verifier 10 + SafeUserImage 10 + boundaries 9 + image policy 2.

- [ ] **Step 8: Run the repository quality gate before commit**

  ```powershell
  npm run check
  git diff --check
  git diff -- package.json package-lock.json
  ```

  Expected: format, 19-task roadmap, lint, typecheck and full Vitest pass; direct
  package diff remains exact. Do not run `npm audit fix`.

- [ ] **Step 9: Commit Task 2**

  ```powershell
  git add -- package.json package-lock.json
  git commit -m "fix: upgrade Next Sharp compatibility boundary"
  ```

---

### Task 3: Windows, Linux, PWA ve ana-ajan browser uyumluluk kanıtı

**Files:**

- Create ignored evidence:
  `.superpowers/sdd/2026-08-31-next-sharp-compatibility-upgrade/task-3-report.md`
- No tracked production file is expected. If a test/build/browser failure proves
  a source incompatibility, stop this task, record the exact failure in the SDD
  ledger and open a separately reviewed minimal fix round before resuming.

**Interfaces:**

- Consumes: Task 2 exact installed dependency graph and existing local Supabase
  stack.
- Produces: sanitized Windows, Linux/Node 22, PWA and authenticated
  desktop/mobile browser evidence plus exact local fixture cleanup counts.
- Task 4 consumes only summarized counts/outcomes; raw request URLs, tokens and
  fixture credentials never enter durable docs.

- [ ] **Step 1: Create the plan-owned evidence report**

  Use the SDD workspace selected for this plan. Create `task-3-report.md` with
  these headings and no secrets:

  ```markdown
  # Task 3 Compatibility Evidence

  ## Dependency identity

  ## Windows Node 24

  ## Linux Node 22

  ## PWA artifacts

  ## Authenticated browser matrix

  ## Request-class evidence

  ## Fixture cleanup

  ## Residual delivery gates
  ```

- [ ] **Step 2: Run the final-tree Windows checks and build**

  ```powershell
  npm run verify:next-sharp
  npm run check
  $env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='build-test-anon-key'
  $env:SUPABASE_SERVICE_ROLE_KEY='build-test-service-role-key'
  $env:GEMINI_API_KEY='build-test-gemini-key'
  npm run build
  node -e "const sharp=require('sharp');console.log({sharp:require('sharp/package.json').version,libvips:sharp.versions.vips})"
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:NEXT_PUBLIC_SUPABASE_ANON_KEY, Env:SUPABASE_SERVICE_ROLE_KEY, Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
  ```

  Expected: all checks pass, 35/35 static generation completes, `public/sw.js`
  is generated, and native Sharp reports `0.35.3`. Record counts and sanitized
  versions; restore only build-generated `next-env.d.ts` drift.

- [ ] **Step 3: Prove clean Linux/Node 22 install and build in an ephemeral container**

  With explicit Docker/network approval, run from the worktree:

  ```powershell
  $repoPath = (Get-Location).Path
  docker run --rm `
    --mount "type=bind,source=$repoPath,target=/src,readonly" `
    -e NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co `
    -e NEXT_PUBLIC_SUPABASE_ANON_KEY=build-test-anon-key `
    -e SUPABASE_SERVICE_ROLE_KEY=build-test-service-role-key `
    -e GEMINI_API_KEY=build-test-gemini-key `
    node:22-bookworm-slim `
    sh -lc "mkdir /work && tar -C /src --exclude=.git --exclude=.next --exclude=node_modules -cf - . | tar -C /work -xf - && cd /work && npm ci --ignore-scripts && npm run verify:next-sharp && npm run check && npm run build && node -e \"const sharp=require('sharp');console.log({sharp:require('sharp/package.json').version,libvips:sharp.versions.vips})\" && test -f public/sw.js"
  ```

  Expected: ephemeral container exits `0`; clean Linux install resolves
  `sharp@0.35.3`; quality/build pass; service worker exists. The container is
  removed and writes nothing to the host worktree.

- [ ] **Step 4: Prepare an exact local-only authenticated fixture**

  Use only `127.0.0.1` local Supabase. Never use `.env.local`, hosted project
  metadata or customer data.

  1. Confirm local Supabase URL is `http://127.0.0.1:54321`.
  2. Create one synthetic user through local `auth.admin.createUser`; keep the
     generated password only in process memory.
  3. Create exact organization
     `81000000-0000-4000-8000-000000000011`, slug
     `next-sharp-browser-20260831`, active owner membership and profile.
  4. Insert only the minimum `settings` rows for
     `business_name=Next Sharp Browser` and an initially empty
     `business_logo` under that organization.
  5. Before any browser action, query and record zero baseline counts for the
     exact user/org across auth, profile, membership, activity, financial and
     Storage tables.
  6. Keep the pinned local Supabase CLI executable path in `$supabaseCli`; it
     will also provide the local anon key to the server step without printing
     the value.

  Expected: real login succeeds locally; no hosted URL appears in application
  or browser traffic.

- [ ] **Step 5: Start the local production server and main-agent browser session**

  Build/start only on loopback:

  ```powershell
  $localStatus = & $supabaseCli status -o env
  $anonEntry = $localStatus | Where-Object { $_ -match '^ANON_KEY=' } | Select-Object -First 1
  if (-not $anonEntry) { throw 'Local Supabase ANON_KEY was not reported.' }
  $localAnonKey = ($anonEntry -split '=', 2)[1].Trim().Trim('"')
  $env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY=$localAnonKey
  npm run build
  .\node_modules\.bin\next.cmd start -H 127.0.0.1 -p 3227
  ```

  The main agent opens a fresh Playwright/Chromium context, blocks service-worker
  carryover from earlier sessions, signs in through the real login UI and tracks
  request URL classes without recording query strings. Subagents must not run
  this step.

- [ ] **Step 6: Verify the protected image surfaces at desktop and mobile widths**

  At 1440x900 and 390x844, use one browser-memory-generated synthetic PNG and
  complete this matrix:

  | Surface                        | Action                                                                                                | Expected                                       |
  | ------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
  | Settings logo preview          | Select synthetic PNG before save                                                                      | Preview visible; no optimizer request          |
  | Persisted organization logo    | Save through real settings UI                                                                         | Public local Storage URL; success notification |
  | Sidebar business logo          | Reload protected dashboard                                                                            | Logo visible; no optimizer request             |
  | Organization-specific login    | Logout and open `/login?organization=next-sharp-browser-20260831`                                     | Branding visible; no optimizer request         |
  | Supplier receipt local preview | Select PNG on `/dashboard/hammaddeler/fis-yukle`                                                      | Preview visible; do not approve/save           |
  | Investment receipt preview     | Select PNG on `/dashboard/raporlar/yatirim-fisi`                                                      | Preview visible; do not approve/save           |
  | Z-report local preview         | Select PNG on `/dashboard/raporlar/z-raporu`                                                          | Preview visible; do not approve/save           |
  | Activity-history image preview | Open the exact logo-change audit entry                                                                | Preview visible; no optimizer request          |
  | Financial document modal       | Save one synthetic local receipt using deterministic local AI response, then open its history preview | Signed preview visible; no optimizer request   |

  At each surface record viewport, route, source class, visible/fallback result,
  horizontal overflow and request class. Never record the signed URL, access
  token, object query or password.

- [ ] **Step 7: Verify trusted optimizer and PWA behavior without adding a production fixture**

  From the authenticated browser, request the existing optimizer endpoint with
  trusted fixtures:

  ```text
  /_next/image?url=%2Ficons%2Flogo.png&w=96&q=75
  /_next/image?url=https%3A%2F%2Fimages.unsplash.com%2Fphoto-1495474472287-4d71bcdd2085&w=96&q=75
  ```

  Expected: both return `200` with an image content type after explicit external
  network approval; no app production call site is added solely for testing.
  Then verify:

  - every user-controlled Storage/local-preview target produced zero
    `/_next/image` requests;
  - `public/sw.js` is served;
  - one service-worker registration controls the production app after reload;
  - protected navigation still works after the controlled reload;
  - desktop/mobile horizontal overflow remains zero.

- [ ] **Step 8: Perform mandatory exact fixture and session cleanup**

  Cleanup order:

  1. Delete exact uploaded organization-branding and financial-document objects
     through the local Storage API.
  2. Delete exact synthetic financial rows and their audit rows in one local
     transaction.
  3. Delete exact organization and local auth user through supported local
     boundaries.
  4. Verify counts are `0` for user, session, refresh token, identity, profile,
     membership, organization, settings, activity logs, financial rows,
     document metadata and Storage objects.
  5. Close the browser session, remove Playwright scratch data and stop only the
     temporary port 3227 app listener. Leave the shared local Supabase stack
     running.

  Expected: port 3227 listener `0`; no browser profile/screenshot/upload fixture
  outside the ignored plan workspace; worktree has no source diff.

- [ ] **Step 9: Finalize Task 3 evidence**

  Add exact pass/fail counts, sanitized runtime versions, browser matrix and
  zero-count cleanup evidence to `task-3-report.md`. Explicitly state:

  ```text
  Local compatibility evidence only. No push, PR, CI, preview, deploy,
  hosted/live mutation or production verification was performed.
  ```

  Do not commit the ignored report. Run `git status --short` and expect a clean
  tracked worktree.

---

### Task 4: Audit, graph ve durable DEP-02 local kapanışı

**Files:**

- Modify: `.codebase-memory/artifact.json` through MCP only
- Modify: `.codebase-memory/graph.db.zst` through MCP only
- Modify: `docs/security/DEP-01-dependency-vulnerability-audit.md`
- Modify: `docs/superpowers/ROADMAP.md`
- Append ignored evidence:
  `.superpowers/sdd/2026-08-31-next-sharp-compatibility-upgrade/task-4-report.md`

**Interfaces:**

- Consumes: Task 1 verifier, Task 2 package commits and Task 3 sanitized
  compatibility evidence.
- Produces: current dependency audit classification, refreshed architecture
  artifacts, DEP-02 `Yerelde tamam` roadmap state and an exact local delivery
  report.

- [ ] **Step 1: Re-run immutable package identity checks**

  ```powershell
  npm run verify:next-sharp
  npm run verify:sheetjs
  npm ls next sharp eslint-config-next xlsx --all
  npm explain sharp
  git diff -- package.json package-lock.json
  ```

  Expected: exact Next/ESLint/Sharp/XLSX identities pass and manifests have no
  uncommitted diff.

- [ ] **Step 2: Run both audits without mutating dependencies**

  After explicit npm network approval:

  ```powershell
  npm audit --json
  npm audit --omit=dev --json
  ```

  Save raw JSON only under this plan's ignored SDD workspace. Record exact
  severity/package counts and prove both result objects contain neither `sharp`
  nor `GHSA-f88m-g3jw-g9cj`. A non-zero exit from unrelated classified
  advisories is expected evidence, not permission to run an audit fix.

- [ ] **Step 3: Refresh Graphify and query the security boundary**

  ```powershell
  graphify update .
  graphify query "How do SafeUserImage, imageConfig, Next 16.3.3 and the Sharp runtime boundary connect?" --budget 2500
  ```

  Expected: update exits `0`; graph shows user-image consumers connected through
  `SafeUserImage`, trusted optimizer policy through `imageConfig`, and no direct
  application Sharp import.

- [ ] **Step 4: Refresh codebase-memory through MCP**

  Index the exact worktree persistently with project name
  `motto-saas-security-definer-review`, moderate or stronger mode. Query:

  ```text
  SafeUserImage
  imageConfig
  verifyNextSharpCompatibility
  ```

  Confirm the persisted Branch node names `codex/security-definer-review` at the
  exact pre-artifact HEAD. Do not manually edit compressed or JSON artifacts.

- [ ] **Step 5: Commit generated architecture artifacts separately**

  ```powershell
  git diff -- .codebase-memory/artifact.json
  git diff --check
  git add -- .codebase-memory/artifact.json .codebase-memory/graph.db.zst
  git commit -m "chore: refresh codebase memory graph"
  ```

  Expected: exact two-file commit; metadata counts match MCP output and Branch
  provenance; no generated report or cache is staged.

- [ ] **Step 6: Update durable security and roadmap evidence**

  In `docs/security/DEP-01-dependency-vulnerability-audit.md`, add a dated
  compatibility-upgrade section containing:

  - old/new Next, ESLint, Sharp and libvips identities;
  - exact implementation and graph commits;
  - no-direct-Sharp/no-override contract;
  - Windows Node 24 and Linux Node 22 clean install/build outcomes;
  - focused/full test and 35/35 build counts;
  - PWA artifact and authenticated desktop/mobile browser matrix;
  - both audit summaries and Sharp advisory absence;
  - exact zero-count fixture cleanup;
  - explicit local-only delivery state.

  In `docs/superpowers/ROADMAP.md`:

  - set `DEP-02` to `Yerelde tamam` only if every local acceptance gate passed;
  - set active priority to `DEP-02 delivery`;
  - name push, PR/CI, preview and approved production rollout as the remaining
    gates;
  - do not mark `Tamamlandı` or claim production verification.

- [ ] **Step 7: Format, validate and commit durable docs**

  ```powershell
  .\node_modules\.bin\prettier.cmd --write docs/security/DEP-01-dependency-vulnerability-audit.md docs/superpowers/ROADMAP.md
  npm run format:check
  npm run roadmap:check
  git diff --check
  git add -- docs/security/DEP-01-dependency-vulnerability-audit.md docs/superpowers/ROADMAP.md
  git commit -m "docs: close local Next Sharp remediation"
  ```

  Expected: exact two-file documentation commit.

- [ ] **Step 8: Run the complete post-diff quality and build gate**

  ```powershell
  npm run verify:next-sharp
  npm run check
  $env:NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY='build-test-anon-key'
  $env:SUPABASE_SERVICE_ROLE_KEY='build-test-service-role-key'
  $env:GEMINI_API_KEY='build-test-gemini-key'
  npm run build
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:NEXT_PUBLIC_SUPABASE_ANON_KEY, Env:SUPABASE_SERVICE_ROLE_KEY, Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
  ```

  Expected: verifier, format, 19-task roadmap, lint, typecheck, full Vitest and
  35/35 production build pass. Restore generated `next-env.d.ts` drift, then
  rerun `git diff --check`.

- [ ] **Step 9: Perform final exact-scope and secret review**

  ```powershell
  git status --short --branch
  git diff --check
  git diff -- package.json package-lock.json
  git log --oneline --decorate -12
  ```

  Confirm:

  - tracked worktree clean;
  - package/lockfile changes exist only in the approved dependency commit;
  - no `.env*`, raw audit, browser profile, upload fixture, secret or customer
    file is tracked;
  - local Supabase fixture counts remain zero;
  - no push, merge, deploy or production mutation occurred.

- [ ] **Step 10: Record final local delivery report**

  Append all Task 4 commands, exact counts, commits, review verdicts and residual
  delivery gates to the ignored `task-4-report.md`. The final status must list
  separately:

  ```text
  Local implementation: complete or blocked with exact reason
  Push: no
  Pull request: no
  CI: not run on this branch
  Preview: no
  Merge: no
  Deploy: no
  Production verification: no
  Hosted/live data mutation: no
  ```

  After the task reviewer approves, dispatch the SDD whole-branch reviewer. Do
  not push or open a PR without separate user authorization.

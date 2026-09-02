# DEP-02A Image Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove attacker-controlled image bytes from the Next.js/Sharp
optimizer path while preserving optimized trusted images and accessible mobile
fallbacks.

**Architecture:** Introduce one non-bypassable `SafeUserImage` boundary for
tenant/user-controlled sources, migrate every dynamic user-image call site to
that boundary, and centralize the trusted optimizer allowlist in a typed config
module. Keep trusted local and explicitly approved Unsplash images on normal
`next/image`; do not force Sharp outside the version range declared by the
installed Next.js release.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `next/image`,
Vitest, React server rendering, Prettier, ESLint

**Spec:**
`docs/superpowers/specs/2026-08-26-production-dependency-remediation-design.md`

## Global Constraints

- Do not override or directly install `sharp@0.35.x` while `next@16.2.12`
  declares `sharp: ^0.34.5`.
- Remove the `**.supabase.co` wildcard; allow only
  `zahdmrvhxsmqpeesrfkt.supabase.co` Storage paths and approved Unsplash paths.
- User/tenant-controlled sources must always render with `unoptimized` and may
  not expose a prop that disables that behavior.
- Set `maximumRedirects: 0`, `maximumResponseBody: 5_000_000`,
  `qualities: [75]`, and keep `dangerouslyAllowSVG: false`.
- Never log signed URLs, image query strings, organization identifiers, or raw
  image errors.
- Preserve current dimensions, object-fit behavior, mobile layout, keyboard
  behavior, and fallback meaning at every migrated call site.
- Do not change spreadsheet parsing, package manifests, financial writes,
  Supabase schema, RLS, or live configuration in this plan.
- Do not push, merge, deploy, or claim production verification.

---

### Task 1: Add the non-bypassable user-image boundary

**Files:**

- Create: `src/components/ui/SafeUserImage.tsx`
- Create: `src/components/ui/SafeUserImage.test.tsx`

**Interfaces:**

- Consumes: standard `next/image` props except `unoptimized` and `onError`.
- Produces:

  ```ts
  export type SafeUserImageProps = Omit<ImageProps, 'unoptimized' | 'onError'> & {
    fallbackClassName?: string
    onLoadError?: () => void
  }

  export function SafeUserImage(props: SafeUserImageProps): React.ReactNode
  ```

- Invariant: caller-controlled props are spread before the explicit
  `unoptimized` and internal `onError` props.

- [ ] **Step 1: Write RED tests for forced unoptimized rendering and fallback**

  In `SafeUserImage.test.tsx`, mock only the framework image boundary and render
  the real component:

  ```tsx
  import { renderToStaticMarkup } from 'react-dom/server'
  import type { ImageProps } from 'next/image'
  import { describe, expect, it, vi } from 'vitest'

  vi.mock('next/image', () => ({
    default: ({ unoptimized, onError: _onError, ...props }: ImageProps) => (
      <img {...props} data-unoptimized={String(unoptimized)} />
    ),
  }))

  import { SafeUserImage } from './SafeUserImage'

  describe('SafeUserImage', () => {
    it('always disables the optimizer for a user-controlled URL', () => {
      const markup = renderToStaticMarkup(
        <SafeUserImage
          src="https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/public/logos/org/logo.webp"
          alt="İşletme logosu"
          width={96}
          height={96}
        />,
      )

      expect(markup).toContain('data-unoptimized="true"')
      expect(markup).toContain('alt="İşletme logosu"')
    })

    it('requires non-empty accessible alternative text at runtime', () => {
      expect(() =>
        renderToStaticMarkup(<SafeUserImage src="https://example.com/logo.png" alt="" width={96} height={96} />),
      ).toThrow('Kullanıcı görseli için açıklayıcı alt metin gerekli.')
    })
  })
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run:

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/components/ui/SafeUserImage.test.tsx
  ```

  Expected: FAIL because `SafeUserImage.tsx` does not exist.

- [ ] **Step 3: Implement the minimal component**

  Create `SafeUserImage.tsx`:

  ```tsx
  'use client'

  import { useState } from 'react'
  import Image, { type ImageProps } from 'next/image'

  export type SafeUserImageProps = Omit<ImageProps, 'unoptimized' | 'onError'> & {
    fallbackClassName?: string
    onLoadError?: () => void
  }

  export function SafeUserImage({ alt, fallbackClassName = '', onLoadError, ...imageProps }: SafeUserImageProps) {
    const [failed, setFailed] = useState(false)

    if (!alt.trim()) throw new Error('Kullanıcı görseli için açıklayıcı alt metin gerekli.')

    if (failed) {
      return (
        <div role="img" aria-label={`${alt} yüklenemedi`} className={fallbackClassName} data-safe-user-image-fallback>
          <span aria-hidden="true">🖼️</span>
        </div>
      )
    }

    return (
      <Image
        {...imageProps}
        alt={alt}
        unoptimized
        onError={() => {
          setFailed(true)
          onLoadError?.()
        }}
      />
    )
  }
  ```

- [ ] **Step 4: Run RED tests again and verify GREEN**

  Run the focused command from Step 2.

  Expected: 2 tests PASS with no warnings.

- [ ] **Step 5: Run targeted static checks**

  ```powershell
  .\node_modules\.bin\prettier.cmd --check src/components/ui/SafeUserImage.tsx src/components/ui/SafeUserImage.test.tsx
  .\node_modules\.bin\eslint.cmd src/components/ui/SafeUserImage.tsx src/components/ui/SafeUserImage.test.tsx
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: all three commands exit `0`.

- [ ] **Step 6: Commit Task 1**

  ```powershell
  git add -- src/components/ui/SafeUserImage.tsx src/components/ui/SafeUserImage.test.tsx
  git commit -m "feat: add safe user image boundary"
  ```

---

### Task 2: Migrate every user-controlled image call site

**Files:**

- Create: `src/components/ui/safe-user-image-boundaries.test.ts`
- Modify: `src/components/DocumentPreviewModal.tsx:3,141-153`
- Modify: `src/components/Sidebar.tsx:3,105-113`
- Modify: `src/features/auth/components/LoginBrandingProvider.tsx:3,89-102`
- Modify: `src/features/settings/components/tabs/GenelTab.tsx:2,119-127`
- Modify: `src/components/ui/ImagePreprocessModal.tsx:5,435-447`
- Modify: `src/features/z-reports/components/ZReportUploadPanel.tsx:1,44-57`
- Modify: `src/app/dashboard/hammaddeler/fis-yukle/page.tsx:4,469-531`
- Modify: `src/app/dashboard/raporlar/yatirim-fisi/page.tsx:4,334-346`
- Modify: `src/app/dashboard/islem-gecmisi/page.tsx:4,463-585`
- Modify: `src/components/DocumentPreviewModal.test.tsx`

**Interfaces:**

- Consumes: `SafeUserImage` from Task 1.
- Produces: all tenant/user-controlled sources pass through
  `SafeUserImage`; no listed file imports `next/image` directly.

- [ ] **Step 1: Write the fail-closed source-boundary test**

  Create `safe-user-image-boundaries.test.ts`:

  ```ts
  import { readFileSync } from 'node:fs'
  import { resolve } from 'node:path'
  import { describe, expect, it } from 'vitest'

  const USER_IMAGE_CONSUMERS = [
    'src/components/DocumentPreviewModal.tsx',
    'src/components/Sidebar.tsx',
    'src/features/auth/components/LoginBrandingProvider.tsx',
    'src/features/settings/components/tabs/GenelTab.tsx',
    'src/components/ui/ImagePreprocessModal.tsx',
    'src/features/z-reports/components/ZReportUploadPanel.tsx',
    'src/app/dashboard/hammaddeler/fis-yukle/page.tsx',
    'src/app/dashboard/raporlar/yatirim-fisi/page.tsx',
    'src/app/dashboard/islem-gecmisi/page.tsx',
  ] as const

  describe('user-controlled image boundaries', () => {
    it.each(USER_IMAGE_CONSUMERS)('%s uses the safe image boundary', (filePath) => {
      const source = readFileSync(resolve(filePath), 'utf8')

      expect(source).toContain("from '@/components/ui/SafeUserImage'")
      expect(source).not.toMatch(/from ['"]next\/image['"]/u)
      expect(source).toContain('<SafeUserImage')
    })
  })
  ```

- [ ] **Step 2: Run the boundary test and verify RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/components/ui/safe-user-image-boundaries.test.ts
  ```

  Expected: FAIL for each current direct `next/image` consumer.

- [ ] **Step 3: Replace direct imports and JSX without changing layout**

  In each listed production file:

  ```tsx
  import { SafeUserImage } from '@/components/ui/SafeUserImage'
  ```

  Replace each dynamic user-image `<Image ... />` with
  `<SafeUserImage ... />`. Remove explicit `unoptimized` because the boundary
  owns it. Preserve `src`, `alt`, dimensions/`fill`, `sizes`, classes,
  `draggable`, styles, and existing safe callbacks.

  Use explicit accessible alt text:

  - Document preview: `Fatura önizlemesi`.
  - Sidebar/logo surfaces: the existing business-specific alt text.
  - Receipt previews: the existing receipt/Z-report/investment description.
  - Activity history: `İşlem belgesi önizlemesi`.

  Map existing callbacks to `onLoadError`; do not accept raw error objects:

  ```tsx
  <SafeUserImage
    src={businessLogo}
    alt={`${businessName} logosu`}
    width={40}
    height={40}
    className="h-full w-full object-contain"
    fallbackClassName="flex h-full w-full items-center justify-center text-amber-400"
    onLoadError={() => setBusinessLogo('')}
  />
  ```

- [ ] **Step 4: Extend the document preview behavior test**

  Mock `SafeUserImage` in `DocumentPreviewModal.test.tsx` and assert that a
  signed URL reaches the safe boundary:

  ```tsx
  vi.mock('@/components/ui/SafeUserImage', () => ({
    SafeUserImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} data-safe-user-image />,
  }))
  ```

  Add:

  ```tsx
  it('renders signed image documents through the safe user-image boundary', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal
        isOpen
        onClose={vi.fn()}
        url="https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/sign/receipts/doc.jpg?token=test"
      />,
    )

    expect(markup).toContain('data-safe-user-image')
  })
  ```

- [ ] **Step 5: Run focused tests and verify GREEN**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/components/ui/SafeUserImage.test.tsx src/components/ui/safe-user-image-boundaries.test.ts src/components/DocumentPreviewModal.test.tsx
  ```

  Expected: all focused tests PASS.

- [ ] **Step 6: Verify no dynamic user-image consumer bypass remains**

  ```powershell
  rg -n "from ['\"]next/image['\"]|<Image" src
  ```

  Expected: remaining `next/image` uses are only reviewed trusted static or
  approved remote sources; every file in `USER_IMAGE_CONSUMERS` is absent.

- [ ] **Step 7: Run targeted formatting, lint, and type checks**

  Run Prettier and ESLint against the ten changed source/test files, then:

  ```powershell
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: exit `0`.

- [ ] **Step 8: Commit Task 2**

  Stage only the files listed in this task and commit:

  ```text
  refactor: route user images through safe boundary
  ```

---

### Task 3: Harden the trusted Next.js optimizer configuration

**Files:**

- Create: `src/config/image-policy.ts`
- Create: `src/config/image-policy.test.ts`
- Modify: `next.config.ts:14-31`

**Interfaces:**

- Consumes: `NextConfig['images']`.
- Produces:

  ```ts
  export const imageConfig: NonNullable<NextConfig['images']>
  export const SUPABASE_STORAGE_HOST = 'zahdmrvhxsmqpeesrfkt.supabase.co'
  ```

- [ ] **Step 1: Write RED tests for the exact allowlist and limits**

  Create `image-policy.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'

  import { imageConfig, SUPABASE_STORAGE_HOST } from './image-policy'

  describe('trusted image optimizer policy', () => {
    it('uses only exact remote hosts and storage paths', () => {
      expect(SUPABASE_STORAGE_HOST).toBe('zahdmrvhxsmqpeesrfkt.supabase.co')
      expect(imageConfig.remotePatterns).toEqual([
        {
          protocol: 'https',
          hostname: SUPABASE_STORAGE_HOST,
          port: '',
          pathname: '/storage/v1/object/**',
          search: '',
        },
        {
          protocol: 'https',
          hostname: 'images.unsplash.com',
          port: '',
          pathname: '/**',
          search: '',
        },
      ])
      expect(JSON.stringify(imageConfig)).not.toContain('**.supabase.co')
    })

    it('fails closed on redirects, large bodies, SVG, and arbitrary quality', () => {
      expect(imageConfig.maximumRedirects).toBe(0)
      expect(imageConfig.maximumResponseBody).toBe(5_000_000)
      expect(imageConfig.dangerouslyAllowSVG).toBe(false)
      expect(imageConfig.qualities).toEqual([75])
    })
  })
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/config/image-policy.test.ts
  ```

  Expected: FAIL because `image-policy.ts` does not exist.

- [ ] **Step 3: Implement the typed policy and wire Next config**

  Create `image-policy.ts`:

  ```ts
  import type { NextConfig } from 'next'

  export const SUPABASE_STORAGE_HOST = 'zahdmrvhxsmqpeesrfkt.supabase.co'

  export const imageConfig = {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: SUPABASE_STORAGE_HOST,
        port: '',
        pathname: '/storage/v1/object/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
        search: '',
      },
    ],
    maximumRedirects: 0,
    maximumResponseBody: 5_000_000,
    dangerouslyAllowSVG: false,
    qualities: [75],
  } satisfies NonNullable<NextConfig['images']>
  ```

  In `next.config.ts`:

  ```ts
  import { imageConfig } from './src/config/image-policy'

  const nextConfig: NextConfig = {
    turbopack: {},
    images: imageConfig,
  }
  ```

- [ ] **Step 4: Run focused tests and TypeScript verification**

  ```powershell
  .\node_modules\.bin\vitest.cmd run src/config/image-policy.test.ts src/components/ui/SafeUserImage.test.tsx src/components/ui/safe-user-image-boundaries.test.ts
  .\node_modules\.bin\tsc.cmd --noEmit
  ```

  Expected: all tests PASS and TypeScript exits `0`. If the installed Next.js
  type does not expose `maximumResponseBody`, stop and review the installed
  runtime contract; do not cast to `any` or suppress the error.

- [ ] **Step 5: Run a production build with safe local public Supabase values**

  Load only the local Supabase URL and anon key into process memory, then run:

  ```powershell
  npm run build
  ```

  Expected: Next.js compile, type generation, and all static pages complete.
  Restore generated `next-env.d.ts` drift if the build changed only generated
  import/quote formatting.

- [ ] **Step 6: Commit Task 3**

  ```powershell
  git add -- src/config/image-policy.ts src/config/image-policy.test.ts next.config.ts
  git commit -m "fix: harden image optimizer policy"
  ```

---

### Task 4: Verify DEP-02A and record partial remediation evidence

**Files:**

- Modify: `docs/security/DEP-01-dependency-vulnerability-audit.md`
- Modify: `docs/superpowers/ROADMAP.md`
- Create: `.superpowers/sdd/2026-08-26-production-dependency-remediation/dep-02a-report.md` (ignored)

**Interfaces:**

- Consumes: Task 1-3 commits and the immutable DEP-01 advisory inventory.
- Produces: durable evidence that the Sharp/libvips path is no longer reachable
  from user-controlled production images; `DEP-02` remains `Devam ediyor` until
  DEP-02B closes both XLSX paths.

- [ ] **Step 1: Run the complete local quality gate**

  ```powershell
  npm run check
  ```

  Expected: format, roadmap, lint, typecheck, and full Vitest pass. Do not hide
  unrelated failures; classify them with file evidence before continuing.

- [ ] **Step 2: Run the production build again from the final Task 4 tree**

  Use the safe local public Supabase environment and run `npm run build`.

  Expected: full build PASS. A prior Task 3 build is not fresh evidence for
  this final tree.

- [ ] **Step 3: Perform desktop and narrow-mobile smoke checks**

  Start the application with local Supabase values and verify at minimum:

  - Login branding logo.
  - Sidebar business logo.
  - Settings logo preview and failure fallback.
  - Financial document image preview.
  - Supplier, investment, and Z-report local preview.
  - Activity-history image preview.

  For every user-controlled image request, confirm the browser does not request
  `/_next/image?url=...`. Confirm trusted local assets still render correctly.
  Record viewport, route, source class, request URL class, and result in the
  ignored report; do not record signed query strings.

- [ ] **Step 4: Re-run both dependency audits without fixes**

  After explicit approval to send the dependency graph to npm:

  ```powershell
  npm audit --json
  npm audit --omit=dev --json
  ```

  Save raw JSON only in the ignored Task 4 report directory. A non-zero exit
  caused by advisories is expected evidence. Confirm package manifests did not
  change.

- [ ] **Step 5: Update durable evidence without claiming full DEP-02 closure**

  Add a dated DEP-02A section to the DEP-01 report stating:

  - Exact implementation commits.
  - Exact user-image call sites now routed through `SafeUserImage`.
  - Exact trusted optimizer allowlist and limits.
  - Sharp remains installed transitively but attacker-controlled production
    reachability was removed.
  - DEP-02B is still required for two XLSX paths.

  Update the DEP-02 roadmap row's evidence and next gate; keep status
  `Devam ediyor`.

- [ ] **Step 6: Refresh Graphify and codebase-memory**

  ```powershell
  graphify update .
  ```

  Query `SafeUserImage`, `imageConfig`, and each migrated call site. Refresh
  codebase-memory persistently and confirm the new boundary is discoverable.
  Exclude only generated metadata drift after confirming topology.

- [ ] **Step 7: Perform the final exact-scope review**

  ```powershell
  git diff --check
  git status --short
  git diff -- package.json package-lock.json
  ```

  Expected: no package-manifest diff, no secret/raw-audit file staged, and only
  the two durable docs staged for Task 4.

- [ ] **Step 8: Commit Task 4**

  ```powershell
  git add -- docs/security/DEP-01-dependency-vulnerability-audit.md docs/superpowers/ROADMAP.md
  git commit -m "docs: record image pipeline remediation"
  ```

  Confirm the worktree is clean. Report local commit, push, merge, deploy, and
  production states separately.

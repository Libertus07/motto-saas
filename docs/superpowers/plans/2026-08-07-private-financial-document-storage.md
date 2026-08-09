# Private Financial Document Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make financial documents tenant-private without breaking existing receipts, Z reports, or investment documents, and persist stable storage references instead of public or expiring URLs.

**Architecture:** Add a small shared document feature that validates files, creates organization-scoped object paths, serializes stable `storage://` references, resolves authorized five-minute signed URLs, and compensates failed business writes by deleting only the newly uploaded object. Roll out Storage security in two database phases: first add legacy mapping and compatible RLS while buckets remain public; then deploy the compatible application; only after production smoke tests make `motto_assets` and `receipts` private and remove legacy broad policies.

**Tech Stack:** Next.js App Router, React 19, TypeScript, `@supabase/supabase-js`, Supabase Storage/Postgres RLS, Vitest, pgTAP, Prettier, ESLint

## Global Constraints

- Preserve `organization-branding` as a public bucket; this plan applies only to `motto_assets` and `receipts`.
- Treat browser-provided organization IDs and stored URLs as untrusted. Database policies must verify an active membership independently.
- Do not persist signed URLs. Persist only `storage://<bucket>/<object-path>` or an unchanged compatible legacy reference.
- New object keys must be `<organization UUID>/<document kind>/<random UUID>.<MIME-derived extension>`; never derive the extension or directories from the user filename.
- Do not use `upsert`; every upload gets a new UUID. This keeps INSERT permissions sufficient and avoids accidental replacement.
- Do not expose `service_role` credentials or use them in browser code.
- Keep the existing business RPCs atomic. Storage cannot join their database transaction, so delete only a newly uploaded object when the following RPC fails; never delete an older referenced object automatically.
- Keep user-facing failures in clear Turkish and do not show raw provider/database errors.
- The Supabase rollout is a hard release gate: preparation migration, compatible app deployment, production smoke test, enforcement migration. Never apply both database phases ahead of the compatible app.
- Use the pinned CLI version already used by the project (`npx supabase@2.111.0`) and discover command flags with `--help` before execution.
- Follow the current Supabase guidance for [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals), [Storage RLS](https://supabase.com/docs/guides/storage/security/access-control), [object ownership](https://supabase.com/docs/guides/storage/security/ownership), and the 2025 restriction against creating custom objects inside the managed `storage` schema.

---

## Public Interfaces and Data Contract

Create this feature boundary:

```text
src/features/documents/
├── document-reference.ts
├── document-reference.test.ts
├── document-storage-service.ts
├── document-storage-service.test.ts
├── useDocumentPreview.ts
└── index.ts
```

The public TypeScript contract is:

```ts
export type PrivateDocumentBucket = 'motto_assets' | 'receipts'

export type PrivateDocumentKind = 'supplier-receipt' | 'investment-receipt' | 'investment-document' | 'z-report'

export interface StorageDocumentReference {
  bucket: PrivateDocumentBucket
  path: string
}

export interface UploadOrganizationDocumentInput {
  organizationId: string
  bucket: PrivateDocumentBucket
  kind: PrivateDocumentKind
  file: File
}

export function serializeStorageDocumentReference(reference: StorageDocumentReference): string
export function parseStorageDocumentReference(value: string): StorageDocumentReference | null
export function parseLegacyPublicStorageUrl(value: string): StorageDocumentReference | null
export function validateOrganizationDocument(input: UploadOrganizationDocumentInput): string | null
export function buildOrganizationDocumentPath(input: UploadOrganizationDocumentInput): string

export async function uploadOrganizationDocument(
  supabase: SupabaseClient,
  input: UploadOrganizationDocumentInput,
): Promise<string>

export async function removeOrganizationDocument(supabase: SupabaseClient, storedReference: string): Promise<void>

export async function resolveDocumentPreviewUrl(
  supabase: SupabaseClient,
  storedReference: string,
  expiresInSeconds?: number,
): Promise<string>

export async function persistWithOrganizationDocument<T>(
  supabase: SupabaseClient,
  input: UploadOrganizationDocumentInput | null,
  existingReference: string | null,
  persist: (storedReference: string | null) => Promise<T>,
): Promise<T>
```

Compatibility rules:

- `storage://motto_assets/<path>` and `storage://receipts/<path>` are parsed and signed.
- Legacy Supabase URLs containing `/storage/v1/object/public/<bucket>/<path>` are parsed and signed after RLS authorization.
- Existing `data:image/jpeg|png|webp;base64,...` and `data:application/pdf;base64,...` values are returned unchanged for read compatibility only; no new data URL is persisted.
- Existing external `https:` document URLs are returned unchanged. `http:`, `javascript:`, `blob:`, malformed `data:`, unknown buckets, traversal segments, and empty references are rejected.
- Default signed URL lifetime is 300 seconds.

Database contract:

```sql
private.organization_document_objects(
    organization_id uuid not null,
    bucket_id text not null,
    object_name text not null,
    created_at timestamptz not null default timezone('utc', now()),
    primary key (organization_id, bucket_id, object_name)
)
```

The mapping table is for legacy, non-organization-prefixed objects. New paths derive their tenant from the first path segment. It remains in the non-exposed `private` schema with no direct grants to `anon` or `authenticated`.

---

### Task 1: Lock the stable-reference and file-validation contract with tests

**Files:**

- Create: `src/features/documents/document-reference.test.ts`
- Create: `src/features/documents/document-reference.ts`
- Create: `src/features/documents/index.ts`

- [ ] Write failing tests for stable-reference serialization/parsing, legacy public URL parsing, safe legacy pass-through values, rejected URL schemes, UUID tenant validation, MIME-derived extensions, path traversal rejection, per-kind MIME rules, and size limits.

```ts
import { describe, expect, it, vi } from 'vitest'

import {
  buildOrganizationDocumentPath,
  parseLegacyPublicStorageUrl,
  parseStorageDocumentReference,
  serializeStorageDocumentReference,
  validateOrganizationDocument,
} from './document-reference'

const organizationId = '11111111-1111-4111-8111-111111111111'

describe('private document references', () => {
  it('round-trips a controlled storage reference', () => {
    const stored = serializeStorageDocumentReference({
      bucket: 'motto_assets',
      path: `${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`,
    })
    expect(parseStorageDocumentReference(stored)).toEqual({
      bucket: 'motto_assets',
      path: `${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`,
    })
  })

  it('extracts a legacy public object without trusting its host', () => {
    expect(
      parseLegacyPublicStorageUrl(
        'https://project.supabase.co/storage/v1/object/public/receipts/z-report-old.pdf?download=1',
      ),
    ).toEqual({ bucket: 'receipts', path: 'z-report-old.pdf' })
  })

  it('builds an organization-scoped path with a MIME-derived extension', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
    const file = new File(['pdf'], 'unsafe.name.exe', { type: 'application/pdf' })
    expect(
      buildOrganizationDocumentPath({
        organizationId,
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file,
      }),
    ).toBe(`${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`)
    vi.unstubAllGlobals()
  })

  it('rejects an invalid organization and unsupported active content', () => {
    const file = new File(['svg'], 'receipt.svg', { type: 'image/svg+xml' })
    expect(
      validateOrganizationDocument({
        organizationId: 'org-1',
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file,
      }),
    ).toBeTruthy()
  })
})
```

- [ ] Run `npm test -- src/features/documents/document-reference.test.ts` and confirm the test fails because the module does not exist.
- [ ] Implement constants and pure functions. Use a strict UUID regex; allow JPEG, PNG, WebP, and PDF up to 3 MiB for supplier/investment documents. Allow those plus XML, JSON, XLS, and XLSX up to 10 MiB for Z reports. Require `motto_assets` for supplier/investment kinds and `receipts` for `z-report`.
- [ ] Re-run the focused test and confirm it passes.
- [ ] Export only the intentional public functions/types from `src/features/documents/index.ts`.
- [ ] Commit: `git commit -m "feat: define private document references"`

### Task 2: Add tested Storage upload, signed-preview, and compensation services

**Files:**

- Create: `src/features/documents/document-storage-service.test.ts`
- Create: `src/features/documents/document-storage-service.ts`
- Modify: `src/features/documents/index.ts`

- [ ] Write failing Vitest tests using narrow `SupabaseClient` fakes for these behaviors: validated upload uses `upsert: false`; returned value is a stable reference; a stable or legacy public reference uses `createSignedUrl(..., 300)`; safe legacy data/HTTPS values pass through; dangerous values throw a Turkish domain error; failed persistence removes only the just-uploaded object; successful persistence does not remove it; cleanup failure does not replace the original business error.

```ts
it('removes a newly uploaded object when the business write fails', async () => {
  const upload = vi.fn().mockResolvedValue({ data: { path: scopedPath }, error: null })
  const remove = vi.fn().mockResolvedValue({ data: [], error: null })
  const from = vi.fn(() => ({ upload, remove }))
  const supabase = { storage: { from } } as unknown as SupabaseClient
  const persist = vi.fn().mockRejectedValue(new Error('RPC failed'))

  await expect(persistWithOrganizationDocument(supabase, uploadInput, null, persist)).rejects.toThrow('RPC failed')

  expect(remove).toHaveBeenCalledWith([scopedPath])
})
```

- [ ] Run `npm test -- src/features/documents/document-storage-service.test.ts` and witness the red result.
- [ ] Implement `uploadOrganizationDocument` with `contentType`, `cacheControl: '3600'`, and `upsert: false`. Throw `Belge yüklenemedi. Lütfen tekrar deneyin.` without exposing the provider detail.
- [ ] Implement `resolveDocumentPreviewUrl`; parse recognized private-bucket references before considering legacy pass-through URLs. Throw `Belge bağlantısı güvenli değil veya desteklenmiyor.` for rejected references and `Belge görüntülenemedi. Lütfen tekrar deneyin.` for signing failures.
- [ ] Implement best-effort compensation in `persistWithOrganizationDocument`. Preserve the original thrown error; report cleanup failure through the existing logger instead of `console.error`.
- [ ] Re-run both document test files and confirm they pass.
- [ ] Commit: `git commit -m "feat: add private document storage service"`

### Task 3: Prepare legacy mapping and compatible tenant Storage policies

**Files:**

- Create via CLI: `supabase/migrations/<CLI timestamp>_prepare_private_financial_documents.sql`
- Create: `supabase/tests/private_financial_documents.test.sql`
- Modify: `supabase/tests/advisor_security_hardening.test.sql`

- [ ] Run `npx supabase@2.111.0 migration new --help`, then create the migration with `npx supabase@2.111.0 migration new prepare_private_financial_documents`. Use the exact emitted filename for the remainder of this task.
- [ ] Before implementing SQL, add pgTAP assertions for the private mapping table, exact helper privileges, active same-organization access, suspended/cross-organization/anonymous denial, legacy mapping access, and the four operation-specific financial-document policies.

```sql
SELECT ok(
    private.can_access_organization_document(
        'motto_assets',
        '11111111-1111-4111-8111-111111111111/supplier-receipt/file.pdf'
    ),
    'an active member can read an organization-scoped document'
);

SELECT ok(
    NOT has_function_privilege(
        'anon',
        'private.can_access_organization_document(text,text)',
        'EXECUTE'
    ),
    'anonymous users cannot execute the document authorization helper'
);
```

- [ ] Run the local database tests and witness the new test fail before the migration exists: `npx supabase@2.111.0 test db --local`.
- [ ] In the preparation migration, create `private.organization_document_objects`, enable RLS as defense in depth, revoke all table access from `PUBLIC`, `anon`, and `authenticated`, and add a bucket check constraint limited to `motto_assets` and `receipts`.
- [ ] Add `private.storage_object_name_from_reference(text, text)` as an internal immutable parser for `storage://` references and legacy `/storage/v1/object/public/` URLs. Keep it in `private`, schema-qualify references, revoke `PUBLIC` execute, and do not grant it to browser roles.
- [ ] Backfill the mapping with set-based `INSERT ... SELECT ... ON CONFLICT DO NOTHING` from `public.stock_movements`, `public.sales`, `public.investments`, and `public.investment_transactions`, pairing each extracted object with the row's `organization_id`.
- [ ] Add `private.can_access_organization_document(text, text)` as a narrowly justified `SECURITY DEFINER` helper with `SET search_path = ''`. It must return false without `auth.uid()`, accept a new path only when its first folder is a valid UUID with an `active` membership, and accept a legacy path only when the mapping table joins to an `active` membership. Revoke `PUBLIC`/`anon`; grant execute only to `authenticated` and `service_role`.
- [ ] Create exact policies on `storage.objects`, all `TO authenticated`:

```text
Financial documents can be selected by active organization members
Financial documents can be inserted by active organization members
Financial documents can be updated by their active organization owner
Financial documents can be deleted by their active organization owner
```

SELECT uses `private.can_access_organization_document(bucket_id, name)`. INSERT requires a supported bucket, an organization-prefixed path, an active membership, and the allowed extension for that bucket. UPDATE and DELETE additionally require `owner_id = (select auth.uid()::text)`; UPDATE has matching `USING` and `WITH CHECK` predicates.

- [ ] Do **not** set either bucket private and do **not** remove unknown legacy INSERT/UPDATE/DELETE policies in this preparation migration. This is deliberate compatibility for the currently deployed app.
- [ ] Update the existing advisor test so its broad-SELECT assertion remains true alongside the new exact SELECT policy.
- [ ] Reset the local stack from migrations, run all database tests, and run security/performance advisors. Confirm cross-tenant and suspended membership tests deny access.
- [ ] Commit: `git commit -m "feat: prepare tenant-private financial storage"`

### Task 4: Migrate receipt and Z-report writes to stable references

**Files:**

- Modify: `src/app/dashboard/hammaddeler/fis-yukle/page.tsx`
- Modify: `src/app/dashboard/raporlar/yatirim-fisi/page.tsx`
- Modify: `src/features/z-reports/hooks/useZReportWorkspace.ts`
- Modify: `src/features/documents/document-storage-service.test.ts`

- [ ] Add/extend a service test proving the persistence callback receives a `storage://` reference and that an upload error prevents the business callback from running. Witness red, implement only the needed service behavior, then witness green.
- [ ] Replace each direct `.upload(...).getPublicUrl(...)` sequence with `persistWithOrganizationDocument`:

```ts
await persistWithOrganizationDocument(
  supabase,
  selectedFile
    ? {
        organizationId: activeOrg.id,
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file: selectedFile,
      }
    : null,
  null,
  async (documentReference) => {
    const { error } = await supabase.rpc('process_receipt_upload', {
      payload: { ...payload, image_url: documentReference },
      p_organization_id: activeOrg.id,
    })
    if (error) throw new Error('Fiş kaydedilemedi. Lütfen tekrar deneyin.')
  },
)
```

- [ ] Use `investment-receipt` with `motto_assets` for the scanned investment receipt and `z-report` with `receipts` for Z reports.
- [ ] Make a selected-file upload failure block the financial RPC. Remove the current silent `console.error` and “continue without document” behavior.
- [ ] Preserve the current duplicate-report confirmation and business RPC payloads. Do not move multi-row database logic out of their atomic RPCs.
- [ ] Run the focused document and Z-report utility tests, then `npm run typecheck`.
- [ ] Commit: `git commit -m "refactor: secure financial receipt uploads"`

### Task 5: Stop persisting investment documents as base64

**Files:**

- Modify: `src/features/investments/types/index.ts`
- Modify: `src/features/investments/hooks/useInvestmentsUI.ts`
- Modify: `src/features/investments/hooks/useInvestmentDocuments.ts`
- Modify: `src/features/investments/hooks/useInvestmentsData.ts`
- Modify: `src/features/investments/hooks/useInvestmentWorkspace.ts`
- Modify: `src/features/investments/components/BuyInvestmentModal.tsx`
- Modify: `src/features/investments/components/EditInvestmentModal.tsx`
- Create: `src/features/investments/hooks/useInvestmentsData.test.ts`

- [ ] Add `document_file: File | null` to the UI-only buy/edit form state while retaining `document_url` for an already persisted reference. File selection validates the file and stores the `File`; it must not upload or convert it to base64 immediately.
- [ ] Keep AI receipt analysis reading a temporary local data URL only for the `/api/analyze-investment` request. Do not assign that data URL to `document_url`.
- [ ] Write a focused failing data-hook/service test proving buy/edit upload the pending file only as part of submit, pass the stable reference to the exact RPC argument `p_document_url`, preserve an existing reference when no replacement file is selected, and compensate a newly uploaded file when the RPC rejects.
- [ ] Move the `persistWithOrganizationDocument` boundary into `buyInvestment` and `editInvestment`, using `investment-document` in `motto_assets`. Require `activeOrg.id` before upload.
- [ ] On modal reset, clear `document_file`; do not delete an older `document_url`. On edit success, do not remove the old object because an immutable investment transaction may still reference it.
- [ ] Update modal copy to show “Belge seçildi” and the filename without rendering base64. Preserve keyboard labels and mobile touch targets.
- [ ] Run the new investment test, existing investment tests, and `npm run typecheck`.
- [ ] Commit: `git commit -m "refactor: store investment documents privately"`

### Task 6: Resolve every document preview through short-lived authorization

**Files:**

- Create: `src/features/documents/useDocumentPreview.ts`
- Modify: `src/features/documents/index.ts`
- Modify: `src/app/dashboard/tedarikciler/page.tsx`
- Modify: `src/app/dashboard/raporlar/tedarikci-gecmisi/page.tsx`
- Modify: `src/app/dashboard/raporlar/gecmis/page.tsx`
- Modify: `src/app/dashboard/raporlar/yatirim-gecmisi/page.tsx`
- Modify: `src/features/investments/hooks/useInvestmentWorkspace.ts`
- Modify: `src/features/investments/hooks/useInvestmentsUI.ts`
- Verify unchanged presentation boundary: `src/components/DocumentPreviewModal.tsx`

- [ ] Implement a small client hook that owns `previewUrl`, `previewLoading`, `openDocument(reference)`, and `closeDocument()`. It calls `resolveDocumentPreviewUrl`, opens the modal only after success, and reports a clear Turkish error through `useNotification`.

```ts
export function useDocumentPreview() {
  const { showAlert } = useNotification()
  const supabase = useMemo(() => createClient(), [])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const openDocument = useCallback(
    async (reference: string) => {
      setPreviewLoading(true)
      try {
        setPreviewUrl(await resolveDocumentPreviewUrl(supabase, reference))
      } catch {
        await showAlert('Belge görüntülenemedi. Lütfen tekrar deneyin.', 'error')
      } finally {
        setPreviewLoading(false)
      }
    },
    [showAlert, supabase],
  )

  return { previewUrl, previewLoading, openDocument, closeDocument: () => setPreviewUrl(null) }
}
```

- [ ] Replace all direct `setPreviewUrl(storedReference)` calls with `openDocument(storedReference)`. Supplier pages still fetch the organization-scoped database row first, then resolve its returned reference.
- [ ] Use a dedicated preview loading state; do not blank or lock an entire report page while a URL is signed. Disable only the pressed document action where practical.
- [ ] Keep `DocumentPreviewModal` presentation-only. It receives an already resolved data/HTTPS/signed URL and never learns tenant or Storage policy rules.
- [ ] Verify legacy base64 investment documents, legacy public URLs, new stable references, modal close, download, and open-in-new-tab behavior at narrow mobile and desktop widths.
- [ ] Run document tests, investment tests, `npm run lint`, and `npm run typecheck`.
- [ ] Commit: `git commit -m "feat: authorize financial document previews"`

### Task 7: Execute the compatibility release gate

**Files:**

- Create: `docs/security/private-financial-document-rollout.md`
- Modify: `docs/superpowers/plans/2026-08-07-private-financial-document-storage.md` (check completed boxes only)

- [x] Document the exact rollout, recovery owner, and evidence fields: local migration/test result, preparation migration applied time, app deployment URL/commit, same-tenant smoke result, cross-tenant denial result, error-rate check, enforcement approval, and final bucket state.
- [x] Apply only the preparation migration to the target environment. Verify that the currently deployed application still uploads and previews a legacy document.
- [x] Deploy the compatible application commits from Tasks 1–6.
- [x] Smoke-test one supplier receipt, one Z report, one investment document, and all corresponding history previews with an active member.
- [ ] Verify a user outside the organization and a suspended member cannot create a signed URL for the tested objects.
- [x] Query the four document columns and confirm new writes use `storage://`; confirm existing public URLs/data URLs remain unchanged and readable.
- [x] Monitor application and Storage errors for the agreed observation window. If the compatibility checks fail, roll back the application only; the preparation migration is backward-compatible and can remain.
- [x] Record explicit approval before Task 8. Do not infer approval from a successful deploy. Approval recorded on 2026-08-09 for exact project `zahdmrvhxsmqpeesrfkt` after the enforcement design review.
- [x] Commit: `git commit -m "docs: add private document rollout runbook"`

### Task 8: Enforce private buckets only after the compatibility release passes

**Files:**

- Create via CLI after Task 7 approval: `supabase/migrations/<CLI timestamp>_enforce_private_financial_documents.sql`
- Modify: `supabase/tests/private_financial_documents.test.sql`
- Modify: `supabase/tests/advisor_security_hardening.test.sql`

- [x] Add failing pgTAP assertions that `motto_assets` and `receipts` have `public = false`, correct MIME/size limits, all named broad legacy policies are absent, and the exact four tenant policies remain.
- [x] Run database tests and witness the new assertions fail while buckets are still public.
- [x] Run `npx supabase@2.111.0 migration new enforce_private_financial_documents` and use the exact emitted filename.
- [x] In the enforcement migration, update both bucket rows to `public = false`. Set `motto_assets` to 3 MiB and `receipts` to 10 MiB. At the bucket boundary allow the approved JPEG/PNG/WebP/PDF/XML/JSON/XLS/XLSX MIME union required by their current document kinds; preserve the stricter path-aware validator so investment documents and investment receipts remain JPEG/PNG/WebP/PDF-only.
- [x] Drop every known broad legacy policy with `DROP POLICY IF EXISTS`, including `Giris Yapanlar Yukleyebilir`, `Sahibi Guncelleyebilir`, `Sahibi Silebilir`, `Allow Uploads 1lnm9mj_0`, `Allow Uploads 1lnm9mj_1`, and `Public Okuma Izinleri`. Before finalizing, inspect the target environment's `pg_policies` and add any semantically equivalent broad financial-bucket policy by its exact name.
- [x] Do not directly insert, update, or delete `storage.objects`, and do not create custom functions/tables inside the managed `storage` schema.
- [x] Reset the local stack, run all pgTAP tests and advisors, then apply the enforcement migration to the target environment.
- [ ] Repeat same-tenant upload/preview and cross-tenant/suspended/anonymous denial checks. Verify old copied public URLs now fail without authorization while signed previews work.
- [x] Recovery rule: if legitimate signed access fails, correct the forward RLS policy immediately; do not make the bucket public as a routine rollback. A temporary public rollback requires an explicit security incident decision.
- [x] Commit: `git commit -m "feat: enforce private financial document buckets"`

### Task 9: Full verification, architecture refresh, and delivery review

**Files:**

- Modify generated artifact through its tool only: `graphify-out/graph.json` (if tracked and present)
- Modify generated codebase-memory artifacts through the MCP workflow only
- Review: all files changed in Tasks 1–8

- [x] Run focused tests:

```text
npm test -- src/features/documents/document-reference.test.ts
npm test -- src/features/documents/document-storage-service.test.ts
npm test -- src/features/investments
npm test -- src/features/z-reports
npx supabase@2.111.0 test db --local
```

- [ ] Run the complete application quality gate and production build:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

- [x] Run Supabase security and performance advisors and classify every result; do not suppress findings to obtain green output.
- [x] Run `graphify update .` and refresh codebase-memory through its MCP workflow. Do not manually edit generated graph/memory files.
- [x] Review `git diff --check`, `git status`, every changed migration, and generated TypeScript contracts if schema-visible types changed. Confirm no secret, `.env`, cache, unrelated watcher output, or accidental live URL is staged.
- [ ] Perform a final mobile/desktop browser pass for upload progress, failed upload, signed preview, modal close, download/open, slow network, expired signed link reopened from the original action, and Turkish error copy.
- [ ] Confirm Definition of Done: new objects are organization-scoped; both financial buckets are private; active same-tenant access works; anonymous/cross-tenant/suspended access fails; old public/data references remain viewable only through compatible resolution; failed business writes leave no newly uploaded orphan; branding remains public and unaffected.
- [ ] Request code review with special attention to tenant leakage, SECURITY DEFINER grants/search path, legacy mapping ambiguity, policy deployment order, raw provider errors, and accidental deletion of shared historical documents.
- [ ] Commit any verification-only documentation/graph updates with `git commit -m "chore: verify private document rollout"`.

---

## Explicit Non-Goals

- Moving existing Storage bytes to new object paths. Legacy bytes remain in place and are authorized through the private mapping table.
- Deleting unreferenced historical objects. That requires a separate retention and reconciliation design.
- Adding location-scoped paths before the location model exists. Documents inherit current organization scope now and can add location context in a forward migration later.
- Making organization login branding private.
- Replacing the existing atomic receipt, investment, or Z-report business RPCs.
- Introducing a new production dependency or a service-role signing endpoint.

## Self-Review Checklist

- [ ] Every current upload flow is covered: supplier receipt, scanned investment receipt, Z report, and investment buy/edit document.
- [ ] Every current preview flow is covered: suppliers, supplier history, Z-report history, investment history, and investment cards/workspace.
- [ ] All four document-bearing tables are included in legacy mapping: `stock_movements`, `sales`, `investments`, `investment_transactions`.
- [ ] The plan preserves legacy data URLs and external HTTPS values for reads but creates neither for new uploads.
- [ ] The TypeScript interfaces use one consistent bucket/kind/reference vocabulary.
- [ ] The SQL policy model independently checks active membership and uses least-privilege grants.
- [ ] The two-phase release cannot accidentally privatize buckets before compatible previews are deployed.
- [ ] No TODO, TBD, ellipsis-as-implementation, or unspecified error-handling branch remains.

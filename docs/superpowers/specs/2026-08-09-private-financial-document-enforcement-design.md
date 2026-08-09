# Private Financial Document Enforcement Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Scope:** Task 8 enforcement for the production Supabase project `zahdmrvhxsmqpeesrfkt`

## Objective

Make the existing `motto_assets` and `receipts` financial-document buckets private without moving or deleting customer objects, breaking supported document formats, weakening tenant isolation, or changing the application's stable `storage://` reference contract.

## Decisions

### Bucket configuration

`motto_assets` will be private with a 3 MiB limit. Its bucket-level MIME allowlist will be the union required by every supported document kind currently stored in that bucket:

- `image/jpeg`
- `image/png`
- `image/webp`
- `application/pdf`
- `application/xml`
- `text/xml`
- `application/json`
- `application/vnd.ms-excel`
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

`receipts` will be private with a 10 MiB limit and the same MIME allowlist.

The wider `motto_assets` bucket allowlist is intentional. Supplier receipts stored under `supplier-receipt` support structured files, while `investment-receipt` and `investment-document` support only JPEG, PNG, WebP, and PDF. The existing path-aware `private.is_valid_financial_document_upload(...)` function remains the stricter second authorization layer and continues enforcing the exact MIME, extension, size, bucket, organization, and document-kind contract for each upload.

### Storage authorization

The exact four operation-specific financial-document policies remain:

- authenticated tenant-scoped `SELECT`
- authenticated tenant-scoped validated `INSERT`
- owner and tenant-scoped validated `UPDATE`
- owner and tenant-scoped `DELETE`

The enforcement migration removes every known broad legacy financial policy, including:

- `Giris Yapanlar Yukleyebilir`
- `Sahibi Guncelleyebilir`
- `Sahibi Silebilir`
- `Allow Uploads 1lnm9mj_0`
- `Allow Uploads 1lnm9mj_1`
- `Public Okuma Izinleri`

Before finalizing the migration, the live `pg_policies` catalog is inspected for semantically equivalent broad policies. Unrelated policies, including organization-branding policies, are not changed.

No browser role receives direct access to `private.organization_document_objects`. No service-role key is introduced into browser code.

## Compatibility

- Existing objects remain in place; `storage.objects` is never directly inserted, updated, or deleted.
- Existing `storage://` references remain unchanged.
- Existing trusted Supabase public URLs remain stored unchanged. After the buckets become private, copied raw public URLs must fail, while the application continues parsing the reference and creating a short-lived signed URL after tenant authorization.
- Existing supported legacy `data:` values remain read-compatible and are never written by new flows.
- Structured XML, JSON, XLS, and XLSX supplier receipts and Z reports remain downloadable/openable. They are not forced through image rendering.
- Investment receipts and investment documents remain restricted to JPEG, PNG, WebP, and PDF by the path-aware database validator and client validation.

## Rollout sequence

1. Record the explicit Task 8 approval and synchronize the Task 7 evidence ledger.
2. Add pgTAP assertions for private bucket state, exact limits, MIME allowlists, removal of broad policies, and preservation of the exact four tenant policies.
3. Run the tests against the compatible pre-enforcement state and record the expected RED failures.
4. Create the migration with pinned Supabase CLI `2.111.0`; use the CLI-generated timestamp.
5. Implement only bucket configuration and policy removal in the migration.
6. Reset the local Supabase stack and run all pgTAP tests, security/performance advisors, repository checks, and the relevant production build boundary.
7. Create a fresh encrypted logical backup outside Git and the workspace; verify integrity and restore it into an isolated local database.
8. Reconfirm the exact linked project, migration history, production deployment, baseline logs, and dry-run showing only the new enforcement migration.
9. Apply the enforcement migration to the approved project.
10. Repeat active-member upload/preview/download/open tests and outsider, suspended, anonymous, traversal, oversize, and wrong-MIME denials.
11. Confirm copied raw public URLs fail while application-authorized signed previews work.
12. Observe Supabase Storage/API and Vercel runtime errors against the recorded baseline before declaring GO.

## Recovery

The normal recovery path is a forward RLS or bucket-configuration correction. Buckets are not made public as a routine rollback. A temporary public rollback requires a separately recorded security-incident decision.

The migration does not move or delete customer objects. A fresh encrypted logical backup and verified restore procedure are mandatory before live apply because the project is on the Supabase Free plan. Database backups do not contain the underlying Storage object bytes, so object preservation is also verified through before/after metadata counts and reference checks.

## Verification contract

The release is GO only when all of the following are true:

- both financial buckets are private with the exact limits and MIME allowlists;
- all named broad legacy financial policies are absent;
- the exact four tenant-scoped policies remain;
- active same-tenant users can upload and create signed previews for every supported flow;
- outsider, suspended, and anonymous identities cannot create signed previews or write objects;
- wrong tenant, wrong document kind, traversal, unsupported MIME, and oversize uploads are denied;
- existing objects and stable references are unchanged;
- raw public access fails and authorized signed access succeeds;
- no new security-advisor finding attributable to the migration appears;
- the observation window has no release-related Storage, API, or application error regression.

## Explicit exclusions

- No customer document move, copy, conversion, or deletion.
- No direct `storage.objects` mutation.
- No custom table or function inside the managed `storage` schema.
- No unrelated advisor remediation, schema refactor, application feature, or UI change.
- No merge to the main branch without separate authorization.

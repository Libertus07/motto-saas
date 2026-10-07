# OPS-02 Physical Storage Backup and Recovery Design

**Status:** Approved design; implementation not started

**Date:** 2026-10-06

**Owner:** Motto SaaS platform owner

**Related roadmap item:** `OPS-02`

**Predecessor:** [OPS-02 Storage backup design](../../security/OPS-02-storage-backup-design.md)
**Inventory runbook:** [OPS-02 read-only Storage inventory](../../security/OPS-02-storage-inventory-runbook.md)

## 1. Decision Summary

Motto SaaS will protect the physical bytes stored in Supabase Storage by
copying verified backup sets into a dedicated AWS backup account. The target
uses a private Amazon S3 bucket with Versioning, S3 Object Lock in `COMPLIANCE`
mode, and a customer-managed AWS KMS key. Backup, verification, restore, and key
administration responsibilities are separated into least-privilege roles.
AWS infrastructure is defined with AWS CDK v2 and TypeScript in an isolated
`infra/ops02-backup/` npm package. CDK synthesis and policy assertions run
without AWS credentials; deployment remains a separate approval gate.

The first production-capable release targets an RPO of at most 24 hours and an
RTO of at most 8 hours. After production inventory and measured restore evidence
exist, the target advances to an RPO of at most 6 hours and an RTO of at most 4
hours. Daily recovery points are retained for 90 days, and one verified monthly
recovery point is retained for 12 months. Longer statutory retention is not
enabled until the applicable business and legal requirements are confirmed.

This document approves architecture and planning only. It does not authorize
creation of AWS resources, production credential generation, production
inventory, object transfer, deletion, deployment, or restore.

## 2. Problem and Evidence Boundary

Supabase database backups contain Storage metadata but not the physical object
bytes. Restoring a database backup therefore cannot recover Storage objects that
were deleted after the backup. Supabase Storage also does not provide S3 object
versioning, so an independent physical backup is required.

The completed predecessor phase proves only that Motto SaaS can inventory
Storage metadata and durable application references in a read-only,
repeatable-read transaction while pseudonymizing sensitive identities. It does
not prove that object bytes were copied, that copied bytes are intact, or that a
restore can complete within a recovery objective.

OPS-02 closes only when an authorized production backup set has been copied to
the independent trust boundary, verified end to end, and restored into an
isolated environment with recorded RPO/RTO evidence. Local prototypes and
synthetic fixtures remain valuable evidence but do not satisfy the production
recovery claim.

## 3. Goals

- Preserve the physical bytes of every in-scope Supabase Storage object outside
  the Supabase project and account failure boundary.
- Prevent accidental, malicious, or credential-driven deletion during the
  approved retention period.
- Bind each physical backup set to its Storage inventories and corresponding
  database backup identity.
- Detect missing, changed, truncated, duplicated, or corrupted objects without
  exposing tenant paths or customer identifiers in routine logs.
- Produce resumable, idempotent backup jobs that never delete source or target
  objects.
- Prove recoverability through scheduled isolated restore exercises and
  negative tenant-access tests.
- Keep infrastructure and operating cost measurable and adjustable without
  weakening immutability or recovery evidence.

## 4. Non-Goals

- Replacing Supabase database backups or PITR.
- Mirroring source deletions to the backup target.
- Treating an object count, byte total, ETag, or successful copy command as
  sufficient integrity evidence.
- Rewriting `storage.objects` or `storage.buckets` directly.
- Migrating legacy document references as part of backup.
- Enabling a production restore without a separately approved incident or
  recovery change.
- Claiming legal or regulatory retention compliance without specialist review.

## 5. Alternatives Considered

### 5.1 Amazon S3 in a dedicated AWS account — selected

This option provides the strongest separation of duties and mature controls for
Versioning, Object Lock `COMPLIANCE`, KMS, CloudTrail, IAM, lifecycle management,
and future cross-account or cross-Region replication. It has greater setup and
operational complexity than lower-cost S3-compatible providers, but the backup
is commercially sensitive and must remain recoverable after a source-account or
operator failure.

### 5.2 Cloudflare R2 in a separate account — not selected

R2 provides S3 compatibility and bucket lock rules with attractive transfer
economics. It remains a viable cost-oriented secondary option, but AWS offers a
clearer fit for the selected role separation, KMS administration, compliance
retention, audit, and future replication model.

### 5.3 Backblaze B2 in a separate account — not selected

B2 supports Object Lock and server-side encryption and is cost effective. It is
also a viable alternative, but adopting it would add a second operational model
without providing a material benefit for the selected first implementation.

### 5.4 Local disk or NAS — rejected as the primary target

A local copy shares operator, device, site, and ransomware risks and cannot be
the canonical off-site backup. It may be used only as an ephemeral encrypted
restore workspace under an approved runbook.

## 6. Trust Boundary and AWS Topology

The canonical target is a dedicated AWS backup account that is not used by the
Motto SaaS production application. The initial bucket is located in an approved
EU Region. Exact Region selection is an implementation input and must consider
data location, Supabase source location, latency, transfer cost, and business
requirements.

The account contains:

- one private S3 backup bucket with Block Public Access enabled;
- S3 Versioning enabled and not suspendable by operational roles;
- S3 Object Lock enabled at bucket creation;
- a default `COMPLIANCE` retention policy appropriate to the backup class;
- one customer-managed symmetric KMS key for S3 encryption;
- an ECR repository for a digest-pinned backup operator image;
- scheduled and on-demand ECS Fargate task definitions;
- Secrets Manager entries for the privileged Supabase source credential and
  the versioned OPS-02 identity HMAC key;
- CloudWatch metrics, alarms, and redacted structured logs;
- CloudTrail management events and S3 object-level data events; and
- a separate destination for audit logs so the backup bucket is not its own log
  destination.

No bucket is public. ACL-based sharing is disabled. Bucket and KMS policies name
specific role ARNs and reject unencrypted writes, non-TLS requests, and requests
outside the intended account and resources where AWS condition keys permit.

The infrastructure implementation uses AWS CDK v2 with TypeScript. Logical
security boundaries are modeled as focused constructs and composed by one
foundation stack. Fine-grained CDK assertions verify the synthesized
CloudFormation template. The package has its own lockfile under
`infra/ops02-backup/` so application runtime dependencies do not absorb
infrastructure tooling. No `cdk deploy`, bootstrap, lookup, account mutation, or
credentialed validation is part of the local foundation phase.

## 7. Identity and Separation of Duties

Human access uses federation or IAM Identity Center, phishing-resistant MFA
where available, and temporary role sessions. Root credentials are protected by
strong MFA and are not used for routine work. Workloads use temporary ECS task
role credentials rather than AWS IAM user access keys.

The minimum role model is:

| Role                | Permitted purpose                                                                                                                                                                               | Explicitly excluded                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `backup-writer`     | Read the source and identity secrets, read Supabase objects, create multipart uploads, write only to the authorized backup namespace with the required retention class, and publish job metrics | Target deletion, retention shortening or bypass, bucket policy changes, KMS administration, restore |
| `backup-verifier`   | Read manifests, S3 inventory/checksum reports, retention metadata, and audit evidence                                                                                                           | Backup object bytes, object writes/deletes, retention changes, key administration                   |
| `restore-operator`  | Read explicitly approved object versions and decrypt them for an approved isolated restore                                                                                                      | Backup writes, deletion, policy changes, unrestricted production restore                            |
| `key-administrator` | Administer the dedicated KMS key policy and lifecycle                                                                                                                                           | Reading backup objects or assuming restore permissions                                              |
| `security-auditor`  | Read configuration, CloudTrail, alarms, and access-analysis evidence                                                                                                                            | Backup content decryption or mutation                                                               |

The writer cannot call `DeleteObject`, `DeleteObjectVersion`,
`PutObjectLegalHold`, `PutBucketPolicy`, `PutBucketVersioning`, retention bypass,
or KMS administration APIs. If explicit retention is required on a new monthly
object, policy conditions constrain the writer to `COMPLIANCE` mode and the
approved minimum/maximum duration. Compliance retention cannot be shortened.
The restore role is dormant by default and requires an approved, time-bounded
elevation path.

Supabase-generated S3 keys bypass Storage RLS and grant broad bucket access.
Until Supabase provides a suitably scoped workload credential for this use
case, the source key is a documented residual risk. It is stored only in Secrets
Manager, readable only by the backup task, excluded from logs and images, and
rotated at most every 90 days and immediately after suspected exposure.

## 8. Recovery Objectives and Retention

### 8.1 Initial operating objective

- RPO: at most 24 hours.
- RTO: at most 8 hours for the Storage recovery workflow.
- Frequency: one verified backup set per day.
- Daily retention: 90 days.
- Monthly retention: one verified month-end set for 12 months.
- Integrity verification: every backup run, plus a monthly at-rest checksum
  review.
- Restore exercise: full isolated restore at least quarterly.

### 8.2 Measured target objective

After production object counts, byte volume, change rate, transfer duration,
restore duration, and cost are measured:

- RPO target: at most 6 hours.
- RTO target: at most 4 hours.
- Frequency target: four verified backup sets per day.

The tighter target is enabled only when the end-to-end job reliably completes
inside the available window and a restore exercise proves the RTO. A schedule
configuration alone is not proof of either objective.

### 8.3 Storage classes

Recent recovery points remain in S3 Standard for predictable immediate access.
Verified monthly sets may transition to S3 Glacier Instant Retrieval after the
minimum fast-access window and cost model are approved. Object Lock remains in
force across lifecycle transitions. Glacier Flexible Retrieval or Deep Archive
is not used for a recovery point whose retrieval characteristics would violate
the approved RTO.

Lifecycle expiration cannot remove a locked object version before its retention
date. Expiration rules must be validated against retention, minimum-storage, and
monthly-set requirements before deployment.

Each run is classified as `daily` or `monthly` before any target write. Daily
objects receive at least 90 days of `COMPLIANCE` retention. Monthly objects
receive at least 365 days at creation; a later promotion job is not relied upon
for the longer guarantee. Bucket policy conditions reject a missing, shorter,
or non-compliance retention request where explicit retention is used.

## 9. Backup Set Model

Every run creates a new append-only backup set. It is not a bidirectional sync
and never propagates source deletion. A backup set has a globally unique
identifier composed of an immutable UTC start time and cryptographically random
suffix.

Conceptual target layout:

```text
backup-sets/
  daily/<backup-set-id>/
    objects/<pseudonymous-object-id>
    manifests/draft.json
    manifests/completed.json
    attestations/completed.json
  monthly/<backup-set-id>/
    objects/<pseudonymous-object-id>
    manifests/draft.json
    manifests/completed.json
    attestations/completed.json
reports/
  inventory/<report-id>/...
  checksums/<report-id>/...
```

Daily objects inherit the bucket's 90-day default `COMPLIANCE` retention.
Monthly objects are written only beneath `backup-sets/monthly/` and receive an
explicit 365-day `COMPLIANCE` retention request. IAM and bucket policies bind
`PutObjectRetention` to the monthly namespace, `COMPLIANCE` mode, and the fixed
365-day value. Phase A does not add a blanket missing-header deny to
`s3:PutObject`: the same action authorizes multipart initiation, parts, and
completion, and a deny based on absent object-lock headers can block valid
multipart operations. The Phase B operator must supply retention at object
creation and fail the set closed unless `GetObjectRetention` proves at least
365 days before completion evidence is written. A live, multipart-compatible
bucket-policy enforcement pattern remains a deployment gate. Verifiers may
read manifests, attestations, generated inventory/checksum reports, retention
metadata, and the separate audit destination, but not `objects/` payload bytes.

Target object keys do not expose bucket names, tenant IDs, organization IDs,
source row IDs, filenames, or paths. The pseudonymous object ID is derived with
a dedicated, versioned OPS-02 identity HMAC key and a canonical bucket/path
input. The same key version is injected into the approved inventory and backup
jobs so their pseudonyms can be reconciled. Key rotation creates a new version;
old key versions remain recoverable for the retention life of their manifests.
The manifest is encrypted with SSE-KMS and accessible only to verification and
restore roles.

The completed manifest records at least:

- schema version and backup-set ID;
- source project pseudonym and capture interval;
- first and second inventory identifiers and hashes;
- corresponding database backup identifier and attestation reference;
- pseudonymous source identity;
- HMAC key version and an encrypted sensitive mapping section containing the
  original bucket and object path required for restore;
- source size and last-modified/version evidence when available;
- plaintext SHA-256;
- target S3 key, object version ID, checksum algorithm and checksum;
- Object Lock mode and retain-until timestamp;
- per-object outcome and retry count;
- aggregate object, byte, reference, missing, orphan, changed, and failure
  counts; and
- operator version, image digest, configuration version, completion time, and
  signature or attestation evidence.

The draft manifest is never accepted as recovery evidence. The immutable
`completed.json` and completion attestation are written only after every gate
passes. A set without both records is `INCOMPLETE` even when some objects exist.

## 10. Backup Data Flow

1. Validate the expected Supabase project reference, AWS account, Region,
   bucket, KMS key, Object Lock configuration, image digest, and output prefix.
2. Acquire the approved source credential and OPS-02 identity HMAC key version
   from Secrets Manager without placing either value in command arguments,
   files, images, stdout, or structured logs.
3. Create the first read-only, repeatable-read Storage/reference inventory by
   using the existing OPS-02 inventory contract.
4. Create an isolated draft backup set; never reuse a completed set identifier.
5. Read every in-scope object through the official Supabase Storage/S3
   interface. Do not modify the `storage` schema directly.
6. Stream bytes through a bounded-memory hashing pipeline. Plaintext is not
   persisted to unencrypted disk.
7. Upload with SSE-KMS, Object Lock, and an explicit S3 checksum. Abort failed
   multipart uploads. A server-side accepted checksum is required but does not
   replace the independent plaintext SHA-256.
8. Record the upload response's S3 object version ID, checksum, size,
   encryption, and requested retention evidence in the draft manifest. Direct
   data-object reads are reserved for the restore role; later verification uses
   S3-generated inventory/checksum reports and restore exercises.
9. Retry only idempotent operations with bounded exponential backoff and
   jitter. Never convert an exhausted retry into success.
10. Create the second read-only inventory.
11. Classify additions, deletions, metadata changes, and application-reference
    changes between the two inventories. Recapture changed objects or fail the
    set closed when convergence cannot be proven within the run window.
12. Verify expected and actual object counts and bytes, per-object SHA-256,
    target checksums, version IDs, KMS encryption, and Object Lock retention.
13. Write the completed manifest and completion attestation as the final
    immutable objects.
14. Emit only redacted aggregates and evidence references to logs and roadmap
    records.

The job is resumable within the same incomplete set. It skips an existing target
version only when its immutable manifest entry, size, version ID, encryption,
retention, and checksum all match. It never trusts key existence alone.

## 11. Consistency Model

Supabase Storage does not expose an atomic byte-and-database snapshot covering
all live writes. OPS-02 therefore uses a bounded convergence model:

- a first inventory establishes the candidate set;
- objects are copied and verified;
- a second inventory detects concurrent changes; and
- changed objects are recaptured until the allowed convergence policy is met.

The manifest records both capture boundaries and every explained change. If a
referenced object is missing, a transfer fails, inventories cannot converge, or
the source changes faster than the allowed run window, the set remains
`INCOMPLETE` and an alert is raised.

A controlled write pause may be used for a critical release or recovery-point
event only under a separate approved maintenance procedure. This design does
not authorize or silently introduce such a pause.

## 12. Integrity and Attestation

Integrity is layered:

1. TLS protects source and target transport.
2. A plaintext SHA-256 is calculated while reading the source bytes.
3. The AWS client supplies an explicit S3 checksum and S3 independently
   validates the received payload.
4. S3 stores the checksum, version ID, KMS encryption state, and Object Lock
   metadata.
5. The completed manifest binds source inventory, database backup identity,
   content hashes, destination versions, retention, and operator version.
6. Monthly at-rest checksum jobs compare AWS-generated integrity reports with
   the manifest.
7. Quarterly restore exercises download and decrypt the selected versions and
   recalculate plaintext SHA-256 values.

ETag is diagnostic metadata only and is never treated as a universal content
hash, especially for multipart or encrypted uploads.

## 13. Restore Safety Model

Restore is a separate command and role; backup execution cannot invoke it.
Default restore targets are newly created, empty, non-production Supabase
projects. The workflow fails closed unless the expected target project
reference, environment classification, approved backup-set ID, requested
bucket scope, and overwrite policy match the signed request.

The default overwrite policy is `deny`. A production target, an existing
object, or a target with unexplained content requires an explicit recovery
change with incident owner, backup-set ID, target identity, scope, maintenance
window, rollback/forward-recovery point, and independent reviewer.

The restore sequence is:

1. verify authorization and target identity;
2. verify completed-manifest and attestation integrity;
3. verify selected S3 object versions, checksum, KMS state, and retention;
4. restore bucket configuration through supported APIs;
5. download, decrypt, and hash every selected object;
6. upload through the supported Supabase Storage/S3 API;
7. reconcile object metadata and durable database references;
8. verify counts, bytes, and plaintext SHA-256 values;
9. run application document-preview checks; and
10. run authenticated positive tests and unauthenticated/cross-tenant denial
    tests.

Measured recovery time begins before manifest validation and ends only after
application and tenant-isolation checks pass. An incomplete or late exercise is
recorded as an RTO failure, not a successful restore.

## 14. Observability and Alerts

Logs and metrics never contain raw object paths, tenant or organization IDs,
document URLs, credentials, tokens, or customer content. Approved fields
include pseudonymous backup-set identifiers, aggregate counts, byte totals,
durations, status codes, retry counts, image digests, and evidence hashes.

Alerts are required for:

- no successful initial-stage set within 30 hours;
- no successful measured-target set within 7 hours;
- any `INCOMPLETE` set or exhausted retry;
- source/target byte, checksum, or SHA-256 mismatch;
- unexplained object-count, byte-count, or reference-count anomaly;
- Supabase, AWS, KMS, or Secrets Manager authentication failure;
- KMS disablement or scheduled deletion;
- bucket policy, Block Public Access, Versioning, Object Lock, retention, or
  lifecycle changes;
- object deletion or retention-bypass attempts;
- public or unintended cross-account access findings; and
- an overdue monthly integrity job or quarterly restore exercise.

CloudTrail captures relevant management events and S3 data events. Audit logs
use a separate protected destination and retention policy. Alarm delivery and
escalation ownership must be proven before production scheduling.

## 15. Failure Handling

| Failure                                                              | Required behavior                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Wrong Supabase project or AWS account                                | Stop before credential use or transfer                                         |
| Missing/invalid Object Lock, KMS, Versioning, or public-access guard | Stop before transfer                                                           |
| Source read fails or changes mid-transfer                            | Discard the attempt, retry safely, and never attest stale bytes                |
| Checksum or SHA-256 mismatch                                         | Mark set incomplete, retain forensic evidence, alert                           |
| Multipart upload fails                                               | Abort parts where safe; never publish completion                               |
| Second inventory does not converge                                   | Mark incomplete and alert; do not silently widen the snapshot window           |
| KMS or secret unavailable                                            | Fail closed; do not fall back to unencrypted or embedded credentials           |
| Log redaction violation                                              | Stop job, quarantine logs, rotate affected credentials, investigate            |
| Budget threshold exceeded                                            | Alert and review schedule/classes; do not disable immutability or verification |
| Restore target mismatch                                              | Stop before creating buckets or uploading bytes                                |
| Tenant denial test fails                                             | Treat restore as failed and isolate the target                                 |

Locked partial objects may remain until retention expires. Their presence is a
known cost of fail-closed immutability and does not make an incomplete set valid.

## 16. Cost Controls

No monthly cost claim is made before the authorized production inventory
measures object count, byte volume, average object size, and change rate. The
cost model must include:

- S3 storage by class and minimum-duration effects;
- PUT, GET, LIST, inventory, checksum, lifecycle, and restore requests;
- Supabase and AWS data transfer;
- KMS requests and key cost;
- CloudTrail data events and audit-log storage;
- Secrets Manager;
- ECR and Fargate runtime; and
- scheduled restore exercises.

AWS Budgets and anomaly alerts are configured before recurring production
runs. Cost optimization may adjust backup frequency within the approved RPO,
monthly archive class, concurrency, and retention after review. It may not
remove Object Lock, KMS encryption, independent hashes, completion gating, or
restore testing.

## 17. Implementation and Rollout Phases

### Phase A — Infrastructure design and policy tests

- Define infrastructure as code for the dedicated account resources.
- Validate IAM, bucket, KMS, retention, lifecycle, logging, and alarm policies
  statically and in a disposable non-production AWS environment.
- Prove that writer credentials cannot delete, read outside scope, change
  retention, change policy, or administer KMS.

### Phase B — Synthetic backup prototype

- Use local or disposable Supabase fixtures only.
- Copy single-part, multipart, empty, Unicode-named, and deliberately changing
  objects.
- Prove retries, interruption recovery, checksum rejection, redaction, and
  incomplete-set behavior.

### Phase C — Isolated restore prototype

- Restore a completed synthetic set to a new non-production Supabase project.
- Verify content hashes, metadata/reference reconciliation, document preview,
  and tenant denial paths.
- Measure backup and restore duration.

### Phase D — Production read-only inventory and cost approval

- Requires separate production read-only authorization and a second reviewer.
- Run the existing inventory only; do not copy bytes yet.
- Calculate the expected daily/monthly cost and confirm schedule, retention,
  Region, and budget alarms.

### Phase E — First controlled production backup

- Requires explicit production byte-read and AWS-write authorization.
- Generate or rotate the privileged Supabase source credential for the approved
  window.
- Run, verify, and independently review one full backup set.
- Do not claim recoverability until Phase F passes.

### Phase F — Production-derived isolated recovery exercise

- Requires approval to restore the selected set into an isolated environment.
- Verify end-to-end hashes, references, application behavior, access denial,
  and measured RPO/RTO.
- Enable the recurring schedule only after all acceptance gates pass.

## 18. Verification Strategy

Implementation must include focused automated tests for:

- target account/project/Region identity guards;
- pseudonymous key determinism and path-confusion resistance;
- manifest canonicalization and attestation verification;
- bounded-memory single-part and multipart transfer;
- source mutation during transfer;
- AWS checksum and independent plaintext SHA-256 mismatch;
- resume after interruption without duplicate completion;
- incomplete-set refusal;
- secret and log redaction;
- IAM denial for delete, retention, policy, and KMS administration paths;
- lifecycle/Object Lock interaction;
- restore target and overwrite guards;
- missing, orphaned, and duplicate references;
- positive tenant access and cross-tenant/unauthenticated denial; and
- measured RPO/RTO evidence generation.

Repository checks remain:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Infrastructure and integration checks will be added to the implementation plan.
No production conclusion may be based solely on mocks, static policy review, or
a successful upload.

## 19. Acceptance Gates

OPS-02 physical backup delivery is accepted only when:

1. The independent AWS account, S3, Object Lock, KMS, IAM, audit, and alarm
   controls match this design and have evidence.
2. All authorized production buckets and objects are classified and included or
   explicitly excluded with approval.
3. A completed set has zero unexplained transfer failures and every object has a
   verified plaintext SHA-256, S3 checksum, version ID, encryption state, and
   retention state.
4. The completed manifest is bound to both Storage inventories and the database
   backup identity.
5. An isolated restore verifies bytes, metadata, references, application
   behavior, and tenant denial paths.
6. Measured recovery meets the active RPO/RTO or the miss is recorded and the
   recurring schedule remains disabled.
7. Operations has named primary and backup owners, alert routing, credential
   rotation, budget controls, monthly integrity review, and quarterly restore
   scheduling.
8. No sensitive value appears in Git, CI output, container layers, application
   telemetry, or shared evidence.

## 20. Open Inputs Before Implementation

The architecture is approved, but these deployment inputs remain intentionally
open until the applicable phase:

- exact AWS account and EU Region;
- notification destination and on-call ownership;
- production inventory volume and cost ceiling;
- database-backup identifier source and timing contract;
- legal review for retention beyond the approved operational windows;
- independent production restore reviewer; and
- final transition criteria from the 24-hour/8-hour objective to the
  6-hour/4-hour objective.

None of these open inputs may be silently guessed during implementation.

## 21. Primary References

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase Storage S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Supabase Storage S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
- [Supabase Storage object downloads](https://supabase.com/docs/guides/storage/management/download-objects)
- [Amazon S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Amazon S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [Amazon S3 integrity checking](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
- [Amazon S3 integrity checking at rest](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-at-rest.html)
- [Amazon S3 storage classes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/glacier-storage-classes.html)
- [Amazon S3 CloudTrail logging](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cloudtrail-logging-s3-info.html)
- [AWS IAM security best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS KMS IAM policy best practices](https://docs.aws.amazon.com/kms/latest/developerguide/iam-policies-best-practices.html)
- [AWS Well-Architected recovery testing](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_backing_up_data_periodic_recovery_testing_data.html)

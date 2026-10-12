# OPS-02 Synthetic Copy Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed; implementation awaits user review and execution-method selection.

**Goal:** Prove local, bounded-memory byte-copy and fail-closed completion behavior using generated fixtures, without reading customer objects or connecting to AWS/Supabase.

**Architecture:** A Node-only operator core accepts explicit source, target, journal, clock, and retry dependencies. In-memory fixture adapters model the protocol and failures; a fixture-only runner emits a redacted synthetic report. No cloud adapter, deployment, restore, or application route is added.

**Tech Stack:** Existing Node.js 22 CI, Node.js 24 local runtime, ESM `.mjs`, Node built-in crypto/streams, existing root Vitest 1.6; no new dependency or lockfile change.

**Spec:** [Approved OPS-02 design](../specs/2026-10-06-ops-02-physical-storage-backup-design.md), sections 9–12, 15, 17 Phase B, and 18.

## Scope and implementation boundary

This is **Phase B1: offline operator contract proof**, not all of Phase B.
Real local/disposable Supabase and real S3 protocol adapter integration remain a
subsequent B2 plan. Synthetic responses cannot establish actual S3 checksum,
KMS, Object Lock, IAM, Supabase consistency, or durability guarantees. Restore
is Phase C. Production inventory, copy, and restore remain separate approvals.

The approved architecture is unchanged. This plan chooses a small first slice:
on any source mutation, inventory difference, or unexplained reference failure,
return `INCOMPLETE` rather than implementing automatic recapture now. The spec
allows failing closed when convergence cannot be proved. Resume is at verified
object boundaries, not within an interrupted multipart object's parts.

## Global Constraints

- Never delete source/committed target objects or propagate source deletion.
- No production credentials, `.env` loading, SQL, cloud SDK, network client,
  endpoint argument, AWS bootstrap/deploy, or paid resource in this slice.
- Do not change the existing inventory CLI's project allowlist. Reuse only its
  pure `createIdentityHasher` and `parseStorageReference` exports from
  `scripts/security/storage-inventory-contract.mjs` after validating inputs.
- Keep exact bucket/path identity; do not case-fold, URL-decode, or Unicode
  normalize it. Reject paths the existing parser rejects; never silently omit.
- Use a dedicated fixture HMAC key of at least 32 bytes and explicit key version.
  Future production inventory/copy must use the same approved key/version.
- Daily retention is at least 90 days; monthly at least 365 days, in
  `COMPLIANCE`. Evaluate retain-until against injected run start, in UTC.
- ETag is diagnostic only, never integrity proof. Keep independent whole-file
  plaintext SHA-256 separate from the multipart composite checksum.
- Completed manifest plus valid attestation are both required. Draft-only,
  missing attestation, error, cancellation, or unmatched evidence is incomplete.
- Logs/reports contain aggregates and allowlisted codes, never raw paths,
  identifiers, source errors, payloads, keys, URLs, or exception stacks.
- Label every report `evidenceLevel: synthetic`, `productionReady: false`, and
  `physicalBytesVerifiedInProduction: false`. Never report RPO/RTO achieved.
- Plaintext fixture payloads remain memory-only. Large fixtures are generated
  lazily, not stored as full buffers by either adapter. Metadata may be retained.

## Current repository evidence

- `createIdentityHasher(key)` uses HMAC-SHA256 over `bucket + NUL + path`.
  `parseStorageReference(value)` enforces existing safe-path rules. Preserve
  those contracts and test compatibility instead of introducing another identity.
- `buildStorageInventory(...)` is intentionally project-bound and not a generic
  byte inventory. Do not relax it to support tests. Fixture inventory uses a
  separate explicit model; a future adapter must reconcile identities with the
  real inventory before any live claim.
- Root `vitest.config.mts` excludes `infra/ops02-backup/**` and `.worktrees/**`.
  New operator tests under `scripts/security/storage-backup/` belong to root
  tests. Do not move them into the CDK package or change package exclusions.
- Keep `infra/ops02-backup/`, application code, and existing inventory behavior
  unchanged. Keep draft PR #22 and stacked branding delivery separate from
  approval to deploy or merge.

## Review Focus

1. Equal-length content mutation and changed references must not pass as a
   stable snapshot (Task 3, token/content/reference-change fixtures).
2. Response loss after target commit must not trigger duplicate completion or
   trust key existence (Tasks 2–3, lost-response and journal-resume fixtures).
3. Multipart composite SHA-256 must not be compared with full plaintext SHA-256
   (Task 2, fixed two-part independent vectors).
4. Abort, oversized chunks, dishonest sizes, and a slow sink must not cause
   unbounded buffering or success after cancellation (Task 2).
5. Error strings and nested causes containing secrets must not reach reports;
   malformed journal state cannot authorize a skip (Tasks 3–4).

## File and interface ownership

All files below are new unless marked modify. Use JSDoc contracts for ESM.

| File under `scripts/security/storage-backup/` | Responsibility                                                |
| --------------------------------------------- | ------------------------------------------------------------- |
| `contract.mjs`, `contract.test.ts`            | Identity, configuration, evidence validation, canonical bytes |
| `transfer.mjs`, `transfer.test.ts`            | Backpressured copy, hashes, multipart abort, bounded retry    |
| `run.mjs`, `run.test.ts`                      | Two inventories, journal verification, finalization           |
| `fixtures.mjs`                                | Lazy source and consuming fake target, failure injection      |
| `synthetic-cli.mjs`, `synthetic-cli.test.ts`  | Built-in fixture selection and redacted output                |

No generic provider framework or production transport registry is needed.

### Shared contracts (Task 1 owns definitions)

- `BackupConfig`: `{mode:'synthetic', setId, backupClass:'daily'|'monthly',
startedAtUtc, projectPseudonym, hmacKeyVersion, databaseBackupId,
databaseAttestationRef, operatorVersion, imageDigest, configVersion,
expectedKmsKeyId}`.
  Synthetic provenance values have a `synthetic:` prefix, never real identities.
- `SourceObject`: `{bucket, path, sizeBytes, revision}`. Size is a nonnegative
  safe integer; revision is a nonempty immutable fixture token.
- `Snapshot`: `{id, capturedAtUtc, objects:SourceObject[], referenceDigest,
missingReferences, invalidReferences}`. Reject duplicate identities,
  conflicting metadata, invalid dates, and unsafe aggregate arithmetic.
- `TargetEvidence`: `{key, versionId, sizeBytes, checksumAlgorithm:'SHA256',
checksumType:'FULL_OBJECT'|'COMPOSITE', checksum, encryption:'aws:kms',
kmsKeyId, lockMode:'COMPLIANCE', retainUntilUtc}`. Fake evidence is modeled,
  not proof these AWS controls exist. Bind expected KMS identity in fixture config.
- `ObjectEntry`: `{objectId, revision, plaintextSha256, target:TargetEvidence,
attempts}`; never contains raw bucket/path. Raw mapping stays in fixture memory;
  encrypted recovery mapping is required in B2 before a restore-capable release.
- `Journal`: `{schemaVersion:1, configDigest, state:'INCOMPLETE'|'COMPLETE',
entries:ObjectEntry[], manifest?:Manifest, attestation?:Attestation}`.
- `Manifest`: `{schemaVersion:1, config:BackupConfig, inventories:[{id,digest},
{id,digest}], objects:ObjectEntry[], totals:{objects,bytes}, completedAtUtc}`.
- `Attestation`: `{manifestSha256, keyVersion, hmacSha256}` over canonical manifest
  bytes using a separate fixture signing key. Not a production signature/key design.
- `Result`: `{status:'COMPLETE'|'INCOMPLETE', code, totals:{objects,bytes},
evidenceLevel:'synthetic', productionReady:false,
physicalBytesVerifiedInProduction:false}`. Use no arbitrary string interpolation.

### Task 1: Validated identity and evidence contract

**Files:** `contract.mjs`, `contract.test.ts`.

**Interfaces:** Export `validateConfig(value):BackupConfig`,
`identifyObject(object:SourceObject, key:Buffer):string`,
`canonicalBytes(value:unknown):Buffer`, and
`validateTargetEvidence(actual:TargetEvidence, expected):void`.
`expected` contains `{key,sizeBytes,checksumType,checksum,kmsKeyId,
minimumRetainUntilUtc}`. Errors use constant codes only.

- [ ] Write failing tests: deterministic pseudonyms match `createIdentityHasher`;
      different bucket/path boundaries and composed/decomposed Unicode stay distinct;
      traversal, `%`, NUL, empty segments, invalid keys/dates/sizes are rejected.
- [ ] Test canonical object-key order recursively, stable array order, rejection
      of undefined/nonfinite numbers and unsupported values. Config rejects unknown
      fields, non-synthetic mode, invalid set IDs, and missing provenance.
- [ ] Test missing/wrong version, key, checksum/type, KMS, or `COMPLIANCE`, and
      retention shorter than 90/365 days. Require a nonempty opaque version ID.
- [ ] Run `node node_modules/vitest/vitest.mjs run scripts/security/storage-backup/contract.test.ts`;
      confirm tests fail because the contract implementation is absent.
- [ ] Implement the exports without importing the CLI/database adapter or
      weakening existing inventory guards. Reuse the pure identity/parser functions.
- [ ] Rerun the focused tests; require all passing, then inspect/stage only the
      two task files and commit `feat(ops02): define synthetic backup evidence contracts`.

### Task 2: Bounded transfer and checksum verification

**Files:** `transfer.mjs`, `transfer.test.ts`, `fixtures.mjs`.

**Interfaces:** `copyObject({object,objectId,config,source,target,signal,sleep,
random}):Promise<ObjectEntry>`. `source.open(object,{signal})` yields
`AsyncIterable<Uint8Array>`; `source.stat(object)` returns its revision and size.
Target methods: `put({key,body,checksum,retention})`,
`begin({key,checksumAlgorithm,checksumType,retention})`,
`part({uploadId,partNumber,body,checksum})`,
`complete({uploadId,parts,checksum})`, `abort({uploadId})`,
`evidence({key,versionId})`. Put/complete return `TargetEvidence`; part returns
`{partNumber,etag,checksum}`. Never add a committed-object delete method.

- [ ] Write failing tests for empty, small, exactly 5 MiB, and 5 MiB + 1 byte;
      use 5 MiB parts, one part in flight, and source chunks capped at 64 KiB.
      The fake sink consumes/hashes and discards payloads; it never retains a full file.
- [ ] Test byte-size mismatch (short/long), same-size revision change, corrupt
      part checksum, missing version, wrong retention/KMS, and cancellation.
- [ ] Pin independent one-part and two-part vectors: whole SHA-256 uses original
      bytes; composite uses SHA-256 of concatenated binary part digests, base64 plus
      `-N`. Assert composite is not accepted in a `FULL_OBJECT` field or vice versa.
- [ ] Test peak operator payload allocation against `2 * 5 MiB + 64 KiB` using
      allocation/in-flight instrumentation and a slow sink, not a flaky RSS threshold.
      Test 64 MiB generated input without accumulating it. Reject oversize chunks.
- [ ] Run focused transfer tests and observe red. Implement sequential chunks,
      independent full hash, consecutive part numbers starting at 1, and validation
      of every returned receipt. Set algorithm/type at multipart initiation.
- [ ] Retry only fixture `TRANSIENT` failures, at most three attempts total,
      with injected full jitter bounded by 100/200 ms for the two retries. Reopen
      the source, reset hashes, and verify revision before another attempt. Never
      retry checksum/auth/config/mutation failures; abort unfinished multipart work.
      A lost commit response remains incomplete until journal/evidence reconciliation.
- [ ] Require all transfer tests passing; inspect/stage the three task files and
      commit `feat(ops02): add bounded synthetic object transfer`.

### Task 3: Fail-closed sets and verified object-boundary resume

**Files:** `run.mjs`, `run.test.ts`; extend `fixtures.mjs` as needed.

**Interfaces:** `runBackup({config,source,target,journal,identityKey,signingKey,
clock,sleep,random,signal}):Promise<Result>`; `source.inventory():Promise<Snapshot>`;
`journal.load():Promise<Journal|null>` and `journal.save(next):Promise<void>`;
`target.publishManifest(bytes)` / `target.publishAttestation(bytes)` are immutable
create-only operations. `isComplete(manifest,attestation,signingKey):boolean`
validates both records. Clock returns canonical UTC timestamps.

- [ ] Write failing tests: sorted stable inventories yield one completion;
      additions/deletions/revisions/reference changes or missing/invalid references
      produce incomplete and no attestation. Empty inventory requires explicit
      expected empty fixture, not accidental success from a failed listing.
- [ ] Test restart by serializing the journal, rebuilding runner dependencies,
      and retaining only fixture target state. Skip only entries whose config digest,
      source revision, size, immutable receipt, exact version, checksum, encryption,
      and retention all still match. Forged/malformed entries fail closed.
- [ ] Test interruption before/after upload and manifest creation; a set with
      only a manifest is incomplete. Resume may publish only its missing matching
      attestation, never overwrite/reuse a complete set for a new run. Repeating a
      fully completed invocation returns its verified result without another write.
- [ ] Test lost upload response cannot count as verified; existing key alone
      never permits skip. No source/committed-target deletion call is possible.
- [ ] Run focused run tests and observe red. Implement first snapshot, transfers,
      second snapshot comparison, validated journal checkpoints, canonical manifest,
      independent fixture HMAC attestation, and final completion gating. Sign only
      after all object and inventory evidence passes. Unexpected exceptions return
      a constant incomplete code without serializing the exception.
- [ ] Require all operator tests passing; inspect/stage task files and commit
      `feat(ops02): gate synthetic backup completion and resume`.

### Task 4: Fixture-only runner and reproducible delivery evidence

**Files:** `synthetic-cli.mjs`, `synthetic-cli.test.ts`; modify `package.json`
only to add `ops:storage-backup:synthetic`; create
`docs/security/OPS-02-synthetic-copy-runbook.md`; update `docs/superpowers/ROADMAP.md`.

**Interfaces:** `runSyntheticScenario(name):Promise<Result>` selects only built-in
`happy`, `mutation`, `checksum-mismatch`, or `interrupted-resume` fixtures.
`main(args,io):Promise<number>` accepts only `--scenario <name>`; JSON aggregate
output goes to injected `io.write`. No arbitrary file/endpoint/credential flags.

- [ ] Write failing tests for unknown/missing flags, unknown scenarios, URL or
      path arguments, and hostile provider errors including nested causes. Assert
      only allowlisted fields/codes appear. Successful scenario exits 0; incomplete
      exits 1; invalid input exits 2. All tests use dummy secret canaries only.
- [ ] Test no environment configuration is read and no import-time I/O occurs.
      Test module dependency boundary prohibits cloud SDK, dotenv, database CLI,
      HTTP/HTTPS/net/tls/fetch clients; fixture mode cannot select a production adapter.
- [ ] Run runner tests and observe red; implement fixture selection/reporting and
      `ops:storage-backup:synthetic` as `node scripts/security/storage-backup/synthetic-cli.mjs`.
- [ ] Run all four scenarios; verify exact status/exit expectations, no raw
      fixture paths, and explicit synthetic evidence flags. These are new local
      proofs, not live-provider integration results.
- [ ] Run `npm run check` and `npm run build`; require exit 0. Do not weaken
      rules/timeouts or drop tests. Record runtime, source commit and actual counts.
      Existing root test exclusions remain unchanged.
- [ ] Run and verify graph/index refresh with preservation of existing semantic
      artifacts; document limitations. Run `npm run roadmap:check`. The roadmap
      remains `Devam ediyor`, next gate B2 protocol integration, not production ready.
- [ ] Review complete diff and secrets scan. Commit only task changes and
      deliberately refreshed tracked index artifacts; do not stage local outputs.

## Self-review and coverage mapping

Identity and evidence: Task 1. Streaming/integrity/retry/mutation: Task 2.
Capture boundaries/resume/attestation: Task 3. Redaction and reproducibility:
Task 4. Each Review Focus item has an owning test above.

Deferred deliberately: real protocol adapters, persistent encrypted journals,
encrypted original-path mapping, actual KMS signing, role/IAM integration,
automatic convergence/recapture, crash durability, isolated restore, production
inventory and all live acceptance gates. No such requirement is marked complete
by this offline slice. Before B2, review these gaps against the approved design.

## Primary sources checked 2026-10-12

- [AWS S3 checksum types](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html):
  SHA-256 multipart checksum is composite; independent whole-byte hash remains
  separate, algorithm selected at initiation, part numbers consecutive.
- [Node.js 22 streams](https://nodejs.org/docs/latest-v22.x/api/stream.html):
  backpressure and cancellation inform the bounded consumer contract.
- [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility):
  do not assume Supabase implements AWS versioning/retention semantics.
- [Supabase changelog](https://supabase.com/changelog): reviewed latest entries;
  TLS cipher deprecation affects a future network adapter, not offline fixtures.
  The `.md` endpoint was unsupported by the reader; HTML fallback was used.

## Execution handoff

Written plan is pending user review. Recommended method: native execution in
this session, sequential TDD tasks and a separate final review. These four tasks
share contracts closely; avoid parallel edits to the runner and fixture module.
No implementation has begun and no dependency has been installed for this plan.

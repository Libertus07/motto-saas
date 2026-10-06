# OPS-02 AWS Backup Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally synthesized and policy-tested AWS CDK foundation for immutable Motto SaaS Storage backups without creating AWS resources or accessing production.

**Architecture:** An isolated TypeScript CDK v2 package models the protected S3/KMS vault, audit destination, secrets, least-privilege roles, and configuration-change alerting as focused constructs composed by one foundation stack. Vitest and CDK fine-grained assertions validate the generated CloudFormation offline; a credential-free GitHub workflow runs the infrastructure gate without bootstrapping or deploying an AWS account.

**Tech Stack:** Node.js 22, TypeScript 5.9.3, AWS CDK CLI 2.1144.0, `aws-cdk-lib` 2.272.0, `constructs` 10.8.1, `tsx` 4.23.15, Vitest 1.6.1, Prettier 3.9.6, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md`

## Global Constraints

- This plan implements only design Phase A: offline infrastructure definition and policy tests. It does not implement byte transfer, restore, production inventory, AWS bootstrap, `cdk deploy`, or live validation.
- Work in the isolated `codex/ops-02-physical-backup-design` branch/worktree and preserve unrelated checkout changes.
- The infrastructure package lives under `infra/ops02-backup/` with its own `package.json` and `package-lock.json`; do not add CDK packages to the application root package.
- Pin all infrastructure package versions exactly to the versions in this plan. Dependency updates require a fresh audit and regenerated lockfile.
- Synthesis must require no AWS credentials, context lookups, environment files, Supabase secrets, or network access after `npm ci`.
- Only approved EU Regions matching `eu-*` are accepted by the configuration contract; an exact production Region remains a deployment input.
- The backup bucket uses S3 Versioning, Object Lock `COMPLIANCE`, default 90-day retention, SSE-KMS, bucket-owner-enforced object ownership, Block Public Access, TLS-only access, and retain-on-delete/update behavior.
- Monthly objects use explicit `COMPLIANCE` retention of at least 365 days. The foundation may grant only the permission necessary to set compliant retention; it must never grant retention bypass or deletion.
- The audit bucket is separate from the backup bucket and receives CloudTrail logs. CloudTrail data selectors cover the backup bucket, not the audit destination recursively.
- Human, workload, restore, verification, key-administration, and audit capabilities remain separate. Production configuration requires distinct trusted principal ARNs for the human security, verification, and recovery duties.
- Secrets are created only as uninitialized containers. No Supabase key, project secret, HMAC value, customer path, tenant identifier, or production account value may appear in source, synthesized templates, snapshots, logs, or CI.
- All buckets, KMS keys, ECR repositories, secrets, roles, trails, logs, topics, and rules carry `Project=MottoSaaS`, `Control=OPS-02`, `ManagedBy=CDK`, and stage cost-allocation tags where the service supports them.
- GitHub Actions uses read-only repository permissions and must contain no AWS credential, OIDC, bootstrap, deploy, destroy, or production-secret step.
- Production deployment and credential population require a later plan and separate explicit user authorization.

## Review Focus

- Configuration with a non-EU Region, malformed account, cross-account trusted principal, or duplicate production duty principals must fail before stack creation; Task 1 tests every case.
- A synthesized backup bucket missing Versioning, Object Lock `COMPLIANCE`, 90-day default retention, SSE-KMS, public-access blocking, or retain policies must fail assertions; Task 2 pins every property.
- Writer permissions must not contain wildcard resources, object deletion, retention bypass, bucket-policy/versioning mutation, KMS administration, or backup-object reads; Task 3 tests both allowed and forbidden action sets.
- CloudTrail must log backup-bucket object data events without recursively selecting the audit bucket, and high-risk configuration/deletion events must route to the alert topic; Task 4 tests the selectors and event patterns.
- CI or package scripts must never perform `bootstrap`, `deploy`, `destroy`, credential setup, or OIDC token issuance; Task 6 scans the workflow and scripts for these fail-closed restrictions.

---

## Planned File Structure

```text
infra/ops02-backup/
  bin/ops02-backup.ts                   # CDK app entry point; context parsing and stack composition only
  src/config.ts                         # Pure configuration parser and fixed OPS-02 constants
  src/backup-vault.ts                   # Backup/audit buckets and dedicated KMS keys
  src/access-boundary.ts                # Secrets and least-privilege IAM roles/policies
  src/audit-monitoring.ts               # CloudTrail, logs, SNS topic, and EventBridge alerts
  src/ops02-foundation-stack.ts          # Composition, outputs, and tags
  test/config.test.ts                    # Configuration rejection and normalization tests
  test/backup-vault.test.ts              # S3/KMS/retention template assertions
  test/access-boundary.test.ts           # IAM/secret allowlist and denylist assertions
  test/audit-monitoring.test.ts          # Trail selector and alert pattern assertions
  test/foundation-stack.test.ts          # Whole-template and output safety assertions
  cdk.json                               # Local `tsx` app command only
  package.json                           # Isolated exact dependencies and credential-free scripts
  package-lock.json                      # npm reproducibility lock
  tsconfig.json                          # Strict infrastructure-only TypeScript configuration
.github/workflows/ops02-infrastructure-ci.yml
scripts/ci/validate-ops02-infrastructure-workflow.test.ts
docs/security/OPS-02-aws-foundation-runbook.md
```

The backup byte operator, ECR repository, container image, ECS task definition,
schedule, restore command, production inventory execution, and production
values are not created in this plan. ECR lifecycle and image immutability belong
to the synthetic byte-copy deliverable and will be tested with that operator.
Their interfaces will be planned after this foundation is reviewed and locally
proven.

---

### Task 1: Isolated CDK package and configuration contract

**Files:**

- Create: `infra/ops02-backup/package.json`
- Create: `infra/ops02-backup/package-lock.json`
- Create: `infra/ops02-backup/tsconfig.json`
- Create: `infra/ops02-backup/cdk.json`
- Create: `infra/ops02-backup/src/config.ts`
- Create: `infra/ops02-backup/test/config.test.ts`
- Modify: `.gitignore`
- Modify: `tsconfig.json`

**Interfaces:**

- Consumes: CDK context values `stage`, `account`, `region`, `securityPrincipalArn`, `verificationPrincipalArn`, and `recoveryPrincipalArn`.
- Produces:

```ts
export type Ops02Stage = 'test' | 'production'

export interface Ops02FoundationConfig {
  readonly stage: Ops02Stage
  readonly account: string
  readonly region: `eu-${string}`
  readonly securityPrincipalArn: string
  readonly verificationPrincipalArn: string
  readonly recoveryPrincipalArn: string
  readonly dailyRetentionDays: 90
  readonly monthlyRetentionDays: 365
}

export const OPS02_RETENTION: {
  readonly dailyDays: 90
  readonly monthlyDays: 365
}

export function parseOps02FoundationConfig(input: Readonly<Record<string, unknown>>): Ops02FoundationConfig
```

- Production requires three distinct role ARNs in the configured backup account. Test stage may reuse one synthetic principal to simplify offline synthesis.

- [ ] **Step 1: Write failing configuration tests**

Add tests named:

```ts
it('normalizes a complete offline test configuration')
it.each(['', '123', '1234567890123'])('rejects malformed account %s')
it.each(['us-east-1', 'ap-southeast-1', ''])('rejects non-EU region %s')
it('rejects a trusted principal from another AWS account')
it('rejects duplicate production duty principals')
it('pins daily and monthly retention to 90 and 365 days')
```

Assert errors contain only the field name and reason; they must not echo the supplied ARN or arbitrary input value.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test --prefix infra/ops02-backup -- --run test/config.test.ts`

Expected: FAIL because the package and `parseOps02FoundationConfig` do not exist.

- [ ] **Step 3: Create the isolated package manifest and lockfile**

Use exact dependencies:

```json
{
  "dependencies": {
    "aws-cdk-lib": "2.272.0",
    "constructs": "10.8.1"
  },
  "devDependencies": {
    "@types/node": "20.19.43",
    "aws-cdk": "2.1144.0",
    "prettier": "3.9.6",
    "tsx": "4.23.15",
    "typescript": "5.9.3",
    "vitest": "1.6.1"
  }
}
```

Define these scripts exactly:

```json
{
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "synth:test": "cdk synth Ops02BackupFoundation-test --quiet -c stage=test -c account=111111111111 -c region=eu-central-1 -c securityPrincipalArn=arn:aws:iam::111111111111:role/Ops02Security -c verificationPrincipalArn=arn:aws:iam::111111111111:role/Ops02Verification -c recoveryPrincipalArn=arn:aws:iam::111111111111:role/Ops02Recovery",
  "check": "npm run format:check && npm run typecheck && npm run test && npm run synth:test"
}
```

Do not define deploy, bootstrap, or destroy scripts.

Run: `npm install --prefix infra/ops02-backup --package-lock-only`

Expected: an npm lockfile v3 with no application-root dependency changes.

Run: `npm ci --prefix infra/ops02-backup`

Expected: exact locked infrastructure dependencies installed only below the
isolated package.

- [ ] **Step 4: Add strict infrastructure TypeScript and CDK configuration**

Set `target` to `ES2022`, `module`/`moduleResolution` to `NodeNext`, `strict` to `true`, `noEmit` to `true`, `resolveJsonModule` to `true`, and include only `bin/**/*.ts`, `src/**/*.ts`, and `test/**/*.ts`. Set `cdk.json` app to `npx tsx bin/ops02-backup.ts` with no default account, Region, or secret context.

Add `/infra/**/node_modules/` and `/infra/**/cdk.out/` to `.gitignore`. Add `infra/` to the root `tsconfig.json` exclusions so application typecheck does not silently replace the dedicated infrastructure gate.

- [ ] **Step 5: Implement the pure configuration parser**

Implement the exact Task 1 interfaces without a validation dependency. Accept only own enumerable string values, require a 12-digit account, require a Region beginning `eu-`, require IAM role ARNs belonging to the same account, and enforce distinct production principals. Return fixed literal retention values instead of accepting them from context.

- [ ] **Step 6: Run the focused package gate**

Run: `npm run typecheck --prefix infra/ops02-backup`

Expected: PASS.

Run: `npm test --prefix infra/ops02-backup -- --run test/config.test.ts`

Expected: all Task 1 tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add .gitignore tsconfig.json infra/ops02-backup/package.json infra/ops02-backup/package-lock.json infra/ops02-backup/tsconfig.json infra/ops02-backup/cdk.json infra/ops02-backup/src/config.ts infra/ops02-backup/test/config.test.ts
git commit -m "build: scaffold OPS-02 backup infrastructure"
```

---

### Task 2: Immutable backup vault and audit destination

**Files:**

- Create: `infra/ops02-backup/src/backup-vault.ts`
- Create: `infra/ops02-backup/test/backup-vault.test.ts`

**Interfaces:**

- Consumes: `OPS02_RETENTION` from Task 1.
- Produces:

```ts
export interface Ops02BackupVaultProps {
  readonly stage: Ops02Stage
}

export class Ops02BackupVault extends Construct {
  public readonly backupBucket: s3.Bucket
  public readonly auditBucket: s3.Bucket
  public readonly backupKey: kms.Key
  public readonly auditKey: kms.Key
}
```

- [ ] **Step 1: Write failing vault assertions**

Use `aws-cdk-lib/assertions.Template` and add tests named:

```ts
it('creates a retained private versioned backup bucket with 90-day compliance lock')
it('encrypts backup objects with a rotating customer-managed KMS key')
it('creates a distinct retained audit bucket and audit KMS key')
it('denies non-TLS access and disables ACL ownership')
it('never configures automatic bucket deletion')
```

Assert the backup bucket contains:

- `VersioningConfiguration.Status = Enabled`;
- `ObjectLockEnabled = Enabled`;
- default `Mode = COMPLIANCE` and `Days = 90`;
- SSE-KMS using the synthesized backup key;
- `BucketKeyEnabled = true`;
- all four public-access-block fields `true`;
- `OwnershipControls` set to `BucketOwnerEnforced`; and
- both `DeletionPolicy` and `UpdateReplacePolicy` equal to `Retain`.

Assert audit resources are separate logical resources and the audit bucket is not the backup bucket.

- [ ] **Step 2: Run the vault test and verify it fails**

Run: `npm test --prefix infra/ops02-backup -- --run test/backup-vault.test.ts`

Expected: FAIL because `Ops02BackupVault` does not exist.

- [ ] **Step 3: Implement `Ops02BackupVault`**

Use `s3.ObjectLockRetention.compliance(Duration.days(OPS02_RETENTION.dailyDays))`, `BucketEncryption.KMS`, `BlockPublicAccess.BLOCK_ALL`, `ObjectOwnership.BUCKET_OWNER_ENFORCED`, `enforceSSL: true`, `versioned: true`, `autoDeleteObjects: false`, and `RemovalPolicy.RETAIN`. Enable automatic KMS rotation and a 30-day pending-deletion window for both customer-managed keys.

Protect the audit destination independently. Do not configure server access logging from the Object Lock bucket; Task 4 supplies CloudTrail data events instead.

- [ ] **Step 4: Run the vault assertions**

Run: `npm test --prefix infra/ops02-backup -- --run test/backup-vault.test.ts`

Expected: all Task 2 tests PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add infra/ops02-backup/src/backup-vault.ts infra/ops02-backup/test/backup-vault.test.ts
git commit -m "feat: define immutable OPS-02 backup vault"
```

---

### Task 3: Secrets and least-privilege access boundary

**Files:**

- Create: `infra/ops02-backup/src/access-boundary.ts`
- Create: `infra/ops02-backup/test/access-boundary.test.ts`

**Interfaces:**

- Consumes: `Ops02FoundationConfig`, `Ops02BackupVault.backupBucket`, `backupKey`, and `auditKey`.
- Produces:

```ts
export interface Ops02AccessBoundaryProps {
  readonly config: Ops02FoundationConfig
  readonly backupBucket: s3.IBucket
  readonly backupKey: kms.IKey
  readonly auditKey: kms.IKey
}

export class Ops02AccessBoundary extends Construct {
  public readonly sourceCredentialSecret: secretsmanager.Secret
  public readonly identityHmacSecret: secretsmanager.Secret
  public readonly secretKey: kms.Key
  public readonly backupWriterRole: iam.Role
  public readonly backupVerifierRole: iam.Role
  public readonly restoreOperatorRole: iam.Role
  public readonly keyAdministratorRole: iam.Role
  public readonly securityAuditorRole: iam.Role
}
```

- [ ] **Step 1: Write failing secret and IAM tests**

Add tests named:

```ts
it('creates only uninitialized generated secret containers encrypted by a dedicated key')
it('trusts ECS tasks only for the backup writer role')
it('grants writer only required backup-prefix and encryption actions')
it('allows compliant 365-day monthly retention without bypass permission')
it('grants verifier report and retention access without backup-object reads')
it('keeps restore, key administration, and security audit roles separate')
it(
  'contains no wildcard resource, delete, governance bypass, bucket mutation, or KMS administration grant in the writer',
)
```

Normalize synthesized IAM actions to arrays before asserting. The writer allowlist is limited to:

```text
s3:AbortMultipartUpload
s3:GetBucketLocation
s3:ListBucket
s3:ListBucketMultipartUploads
s3:ListMultipartUploadParts
s3:PutObject
s3:PutObjectRetention
kms:Decrypt
kms:DescribeKey
kms:Encrypt
kms:GenerateDataKey
secretsmanager:DescribeSecret
secretsmanager:GetSecretValue
```

`s3:PutObject` and multipart resources must resolve only beneath the
`backup-sets/` object prefix. `s3:PutObjectRetention` is permitted only with
conditions that require `COMPLIANCE` and bound the approved retention range;
`s3:BypassGovernanceRetention` is always forbidden.

- [ ] **Step 2: Run the access test and verify it fails**

Run: `npm test --prefix infra/ops02-backup -- --run test/access-boundary.test.ts`

Expected: FAIL because `Ops02AccessBoundary` does not exist.

- [ ] **Step 3: Implement secret containers**

Create a dedicated rotating customer-managed `secretKey`. Create two Secrets Manager resources named by stage under `/motto-saas/ops02/`: `source-s3` and `identity-hmac`. Generate only a random bootstrap nonce with a fixed `status: UNINITIALIZED` JSON template; never include a source endpoint, access key, secret key, project reference, or HMAC value in CloudFormation.

- [ ] **Step 4: Implement workload and human roles**

Create the writer with `ServicePrincipal('ecs-tasks.amazonaws.com')`. Create verifier, restore, key-administrator, and security-auditor roles from their exact configured principals. Attach narrowly scoped inline policies; do not use AWS managed administrator, S3 full-access, Secrets Manager full-access, or KMS power-user policies. Add the key-administrator role to the backup, audit, and secret-key policies without adding cryptographic data-use permissions to that role.

The writer can read only the two OPS-02 secret ARNs, use only the required KMS cryptographic operations, and write only in the backup namespace. It cannot call `s3:GetObject`, `s3:GetObjectVersion`, or either attributes action on data objects. Upload responses supply the version and checksum evidence recorded by the future operator. The verifier reads only manifest/attestation prefixes, S3-generated inventory/checksum reports, retention metadata, and audit evidence; it cannot read `objects/` bytes. The restore role alone can read approved data-object versions and decrypt them; a later restore plan adds target Supabase behavior. The key administrator cannot decrypt S3 objects.

- [ ] **Step 5: Enforce monthly retention and TLS/KMS resource policies**

Add resource-policy constraints for TLS, the expected KMS key, and monthly `COMPLIANCE` retention. Use the fixed 365-day value from `OPS02_RETENTION`; do not accept a context override. Ensure the policy does not block CloudFormation from managing the bucket itself and does not grant a new principal.

- [ ] **Step 6: Run the access-boundary assertions**

Run: `npm test --prefix infra/ops02-backup -- --run test/access-boundary.test.ts`

Expected: all Task 3 tests PASS and forbidden action scan returns an empty list.

- [ ] **Step 7: Commit Task 3**

```bash
git add infra/ops02-backup/src/access-boundary.ts infra/ops02-backup/test/access-boundary.test.ts
git commit -m "feat: enforce OPS-02 backup access boundaries"
```

---

### Task 4: Audit trail and security-change alerting

**Files:**

- Create: `infra/ops02-backup/src/audit-monitoring.ts`
- Create: `infra/ops02-backup/test/audit-monitoring.test.ts`

**Interfaces:**

- Consumes: backup bucket, audit bucket, audit KMS key, and security-auditor role from Tasks 2–3.
- Produces:

```ts
export interface Ops02AuditMonitoringProps {
  readonly backupBucket: s3.IBucket
  readonly auditBucket: s3.IBucket
  readonly auditKey: kms.IKey
  readonly securityAuditorRole: iam.IRole
}

export class Ops02AuditMonitoring extends Construct {
  public readonly securityTopic: sns.Topic
  public readonly trail: cloudtrail.Trail
  public readonly trailLogGroup: logs.LogGroup
  public readonly highRiskEventRule: events.Rule
}
```

- [ ] **Step 1: Write failing audit assertions**

Add tests named:

```ts
it('writes an encrypted validated multi-region trail to the separate audit bucket')
it('selects object data events only for the backup bucket')
it('does not recursively select the CloudTrail audit bucket')
it('routes bucket, Object Lock, KMS, and deletion-risk events to an encrypted topic')
it('creates no email, webhook, or external subscription before owner approval')
```

The high-risk event pattern must cover at least:

```text
PutBucketPolicy
DeleteBucketPolicy
PutBucketPublicAccessBlock
DeleteBucketPublicAccessBlock
PutBucketVersioning
PutObjectLockConfiguration
DeleteObject
DeleteObjects
ScheduleKeyDeletion
DisableKey
PutKeyPolicy
```

- [ ] **Step 2: Run the audit test and verify it fails**

Run: `npm test --prefix infra/ops02-backup -- --run test/audit-monitoring.test.ts`

Expected: FAIL because `Ops02AuditMonitoring` does not exist.

- [ ] **Step 3: Implement the protected audit trail**

Create a multi-Region trail with log-file validation, the separate audit bucket, CloudWatch Logs delivery, and S3 object data events scoped to the backup bucket prefix. Encrypt the trail log group and SNS topic with the audit key. Set explicit retention and `RemovalPolicy.RETAIN` for the log group.

- [ ] **Step 4: Implement high-risk EventBridge alerts**

Create one rule for the listed CloudTrail API events and target the encrypted SNS topic. Grant the security-auditor role read-only access to the trail/log/topic configuration, not publish or mutation permission. Do not create a subscription until notification ownership is approved.

- [ ] **Step 5: Run the audit assertions**

Run: `npm test --prefix infra/ops02-backup -- --run test/audit-monitoring.test.ts`

Expected: all Task 4 tests PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add infra/ops02-backup/src/audit-monitoring.ts infra/ops02-backup/test/audit-monitoring.test.ts
git commit -m "feat: add OPS-02 backup security monitoring"
```

---

### Task 5: Foundation stack composition and credential-free synthesis

**Files:**

- Create: `infra/ops02-backup/src/ops02-foundation-stack.ts`
- Create: `infra/ops02-backup/bin/ops02-backup.ts`
- Create: `infra/ops02-backup/test/foundation-stack.test.ts`

**Interfaces:**

- Consumes: all Tasks 1–4 interfaces.
- Produces:

```ts
export interface Ops02FoundationStackProps extends StackProps {
  readonly config: Ops02FoundationConfig
}

export class Ops02FoundationStack extends Stack {}
```

The app reads only CDK context, calls `parseOps02FoundationConfig`, creates one stack with `terminationProtection: true`, and performs no SDK call or CDK lookup.

- [ ] **Step 1: Write failing whole-stack tests**

Add tests named:

```ts
it('composes one deterministic foundation template without lookups')
it('applies required project, control, owner, stage, and managed-by tags')
it('exports only non-secret resource names and ARNs')
it('contains no plaintext secret, customer identifier, production project reference, or wildcard administrative policy')
it('sets stack termination protection in the cloud assembly')
```

Use synthetic account `111111111111`, Region `eu-central-1`, and synthetic same-account role ARNs. Snapshot tests may supplement but must not replace fine-grained security assertions.

- [ ] **Step 2: Run the whole-stack test and verify it fails**

Run: `npm test --prefix infra/ops02-backup -- --run test/foundation-stack.test.ts`

Expected: FAIL because the stack and app do not exist.

- [ ] **Step 3: Implement the stack composition**

Instantiate `Ops02BackupVault`, `Ops02AccessBoundary`, and `Ops02AuditMonitoring` in that order. Apply the fixed tags with `Tags.of(this).add`. Expose only bucket name, backup KMS key ARN, role ARNs, security topic ARN, and secret ARNs as CloudFormation outputs. Never output generated secret values, policy documents containing secret material, source endpoints, or HMAC values.

- [ ] **Step 4: Implement the CDK app entry point**

Read exact context keys from `app.node.tryGetContext`, pass the resulting record to `parseOps02FoundationConfig`, and create `Ops02FoundationStack` with explicit `env.account` and `env.region`. Set termination protection. Do not call `Aws.ACCOUNT_ID`, availability-zone lookups, SSM lookups, Secrets Manager lookups, or AWS SDK clients during synthesis.

- [ ] **Step 5: Run tests and synthesize offline**

Run: `npm run test --prefix infra/ops02-backup`

Expected: all infrastructure tests PASS.

Run:

```text
npm run synth:test --prefix infra/ops02-backup
```

Expected: PASS, a deterministic `cdk.out` generated locally, and no credential/network prompt.

Run synthesis twice and compare the generated foundation template SHA-256 values.

Expected: identical hashes.

- [ ] **Step 6: Commit Task 5**

```bash
git add infra/ops02-backup/bin/ops02-backup.ts infra/ops02-backup/src/ops02-foundation-stack.ts infra/ops02-backup/test/foundation-stack.test.ts
git commit -m "feat: compose OPS-02 backup foundation stack"
```

---

### Task 6: Credential-free infrastructure CI gate

**Files:**

- Create: `.github/workflows/ops02-infrastructure-ci.yml`
- Create: `scripts/ci/validate-ops02-infrastructure-workflow.test.ts`

**Interfaces:**

- Consumes: `infra/ops02-backup` package scripts from Task 1.
- Produces: a path-filtered GitHub Actions gate that runs `npm ci` and `npm run check` inside the infrastructure package without AWS authority.

- [ ] **Step 1: Write the failing workflow contract test**

Add tests named:

```ts
it('uses read-only repository permissions and pinned actions')
it('installs from the isolated package lock and runs the infrastructure check')
it('contains no AWS credentials, OIDC, bootstrap, deploy, destroy, or production secrets')
it('runs only for OPS-02 infrastructure and governing document changes')
```

Read the workflow as text. Reject case-insensitive matches for `id-token: write`, `aws-access-key`, `configure-aws-credentials`, `cdk deploy`, `cdk bootstrap`, `cdk destroy`, `SUPABASE_`, and `.supabase.co`. Require full action commit SHAs and `permissions: contents: read`.

- [ ] **Step 2: Run the workflow contract test and verify it fails**

Run: `npm test -- --run scripts/ci/validate-ops02-infrastructure-workflow.test.ts`

Expected: FAIL because the workflow does not exist.

- [ ] **Step 3: Create the isolated workflow**

Use the same pinned `actions/checkout` and `actions/setup-node` SHAs as `.github/workflows/ci.yml`, Node.js `22.x`, and npm caching keyed to `infra/ops02-backup/package-lock.json`. Set the step working directory explicitly or use `npm --prefix`; never rely on root-package dependencies.

The only executable sequence is:

```text
npm ci --prefix infra/ops02-backup
npm run check --prefix infra/ops02-backup
```

Configure path filters for the infrastructure package, this workflow, its validator, the OPS-02 spec, and this implementation plan. Do not add a deployment environment or environment secrets.

- [ ] **Step 4: Run root and infrastructure workflow tests**

Run: `npm test -- --run scripts/ci/validate-ops02-infrastructure-workflow.test.ts`

Expected: PASS.

Run: `npm run check --prefix infra/ops02-backup`

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add .github/workflows/ops02-infrastructure-ci.yml scripts/ci/validate-ops02-infrastructure-workflow.test.ts
git commit -m "ci: validate OPS-02 backup infrastructure"
```

---

### Task 7: Foundation runbook, roadmap evidence, and final gates

**Files:**

- Create: `docs/security/OPS-02-aws-foundation-runbook.md`
- Modify: `docs/security/OPS-02-storage-backup-design.md`
- Modify: `docs/superpowers/ROADMAP.md`
- Modify: `docs/superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md`
- Modify after code changes: generated Graphify and codebase-memory artifacts through their supported workflows only

**Interfaces:**

- Consumes: synthesized template, passing tests, exact dependency lock, and CI workflow from Tasks 1–6.
- Produces: an operator-facing local validation runbook and honest roadmap evidence that says “foundation locally verified,” never “backup exists.”

- [ ] **Step 1: Write the foundation runbook**

Document:

- prerequisites and exact Node/npm commands;
- credential-free install, typecheck, test, and synth commands;
- synthetic context values and why they are non-production;
- expected resources and security assertions;
- how to inspect the synthesized template without deploying;
- prohibited commands (`bootstrap`, `deploy`, `destroy`) in this phase;
- stop conditions for secret exposure, wildcard permission, missing retention, non-EU Region, or non-deterministic synthesis;
- the difference between local infrastructure proof and an AWS-deployed backup; and
- the next plans: byte-copy prototype, isolated restore prototype, then separately authorized production rollout.

- [ ] **Step 2: Update the design and roadmap evidence**

Record the selected CDK package boundary and locally proven Phase A evidence only after all local gates pass. Keep `OPS-02` as `Devam ediyor`. Set the next action to the synthetic physical-byte copy prototype; retain explicit statements that no AWS resource, production inventory, byte copy, restore, or deploy occurred.

- [ ] **Step 3: Run the infrastructure gate**

Run: `npm ci --prefix infra/ops02-backup`

Expected: PASS using only the isolated lockfile.

Run: `npm run check --prefix infra/ops02-backup`

Expected: formatting, TypeScript, all CDK assertions, and test synthesis PASS.

- [ ] **Step 4: Run the repository quality gate**

Run: `npm run check`

Expected: root formatting, roadmap validation, lint, typecheck, and tests PASS.

Run: `npm run build`

Expected: production application build PASS with documented CI placeholder Supabase values if required.

- [ ] **Step 5: Review the synthesized security surface**

Inspect the template and produce a redacted evidence summary containing resource counts, assertion counts, package versions, template SHA-256, and forbidden-action scan result. Confirm there is no credential, secret value, production project reference, customer identifier, public bucket, delete permission, retention bypass, or wildcard administrative resource.

- [ ] **Step 6: Refresh architecture artifacts through supported tools**

Run `graphify update .` and its integrity diagnostics. Refresh codebase-memory through MCP when available. Never manually edit generated graph or memory artifacts. If either system is unavailable, record the exact unrefreshed artifact as residual delivery work instead of claiming success.

- [ ] **Step 7: Inspect final Git state and commit documentation**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intended OPS-02 infrastructure, CI, documentation, and supported generated-artifact changes.

```bash
git add docs/security/OPS-02-aws-foundation-runbook.md docs/security/OPS-02-storage-backup-design.md docs/superpowers/ROADMAP.md docs/superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md
git commit -m "docs: record OPS-02 backup foundation evidence"
```

- [ ] **Step 8: Request final review before push or delivery**

Review the complete branch against the design acceptance boundaries. Do not push, open a pull request, merge, deploy, create AWS resources, populate secrets, or access production unless the user separately authorizes that action.

---

## Downstream Plans — Not Executed Here

After this plan passes review, prepare and approve these plans in order:

1. **OPS-02 synthetic byte-copy prototype:** containerized bounded-memory transfer, HMAC identities, draft/completed manifests, independent SHA-256, S3 checksum, resume behavior, source mutation handling, and failure redaction using disposable Supabase/AWS fixtures.
2. **OPS-02 isolated restore prototype:** target guards, overwrite denial, version/checksum/manifest validation, Storage API restore, reference reconciliation, preview checks, and tenant denial tests.
3. **OPS-02 production inventory and cost approval:** separately authorized read-only inventory, measured volume/change rate, Region and budget decision, alert ownership, and final RPO/RTO feasibility.
4. **OPS-02 controlled production backup and recovery proof:** separately authorized credentials, first immutable full set, independent review, isolated production-derived restore, measured recovery evidence, and only then recurring scheduling.

Each downstream plan requires its own review and authorization. Completion of
this foundation plan does not imply that a physical backup exists.

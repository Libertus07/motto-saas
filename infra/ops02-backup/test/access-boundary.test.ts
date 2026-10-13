import { App, Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { beforeAll, describe, expect, it } from 'vitest'
import { Ops02AccessBoundary } from '../src/access-boundary.js'
import { Ops02BackupVault } from '../src/backup-vault.js'
import { parseOps02FoundationConfig } from '../src/config.js'

const config = parseOps02FoundationConfig({
  stage: 'production',
  account: '111111111111',
  region: 'eu-central-1',
  securityPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Security',
  verificationPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Verification',
  recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Recovery',
})

type Statement = {
  Effect: string
  Action: string | string[]
  Resource?: unknown
  Principal?: unknown
  Condition?: Record<string, Record<string, unknown>>
}

function array<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function synthesizeFixture() {
  const app = new App()
  const stack = new Stack(app, 'AccessTest', { env: { account: config.account, region: config.region } })
  const vault = new Ops02BackupVault(stack, 'Vault', { stage: config.stage })
  const boundary = new Ops02AccessBoundary(stack, 'Access', {
    config,
    backupBucket: vault.backupBucket,
    auditBucket: vault.auditBucket,
    backupKey: vault.backupKey,
    auditKey: vault.auditKey,
    alertKey: vault.alertKey,
  })
  const template = Template.fromStack(stack)
  const resolve = (value: unknown): unknown => stack.resolve(value)
  return { templateSource: JSON.stringify(template.toJSON()), boundary, vault, resolve }
}

let synthesizedFixture: ReturnType<typeof synthesizeFixture>

function fixture() {
  const { templateSource, boundary, vault, resolve } = synthesizedFixture
  // Template.toJSON() exposes mutable references. Give each test its own view.
  const template = Template.fromString(templateSource)
  const policies = Object.values(template.findResources('AWS::IAM::Policy'))
  const roleStatements = (role: { roleName: string }): Statement[] =>
    policies
      .filter((policy) =>
        policy.Properties.Roles.some(
          (name: unknown) => JSON.stringify(name) === JSON.stringify(resolve(role.roleName)),
        ),
      )
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
  return { template, boundary, vault, resolve, roleStatements }
}

describe('OPS-02 access boundary', () => {
  beforeAll(() => {
    synthesizedFixture = synthesizeFixture()
  })

  it('creates only uninitialized generated secret containers encrypted by a dedicated key', () => {
    const { template, boundary, resolve } = fixture()
    const secrets = Object.values(template.findResources('AWS::SecretsManager::Secret'))
    expect(secrets).toHaveLength(2)
    expect(secrets.map((secret) => secret.Properties.Name).sort()).toEqual([
      '/motto-saas/ops02/production/identity-hmac',
      '/motto-saas/ops02/production/source-s3',
    ])
    for (const secret of secrets) {
      expect(secret.Properties.KmsKeyId).toEqual(resolve(boundary.secretKey.keyArn))
      expect(secret.Properties.SecretString).toBeUndefined()
      expect(JSON.parse(secret.Properties.GenerateSecretString.SecretStringTemplate)).toEqual({
        status: 'UNINITIALIZED',
      })
      expect(secret.Properties.GenerateSecretString.GenerateStringKey).toBe('bootstrapNonce')
      expect(secret.DeletionPolicy).toBe('Retain')
    }
    template.resourceCountIs('AWS::KMS::Key', 4)
    for (const key of Object.values(template.findResources('AWS::KMS::Key'))) {
      expect(key.Properties.EnableKeyRotation).toBe(true)
      expect(key.DeletionPolicy).toBe('Retain')
    }
  })

  it('trusts ECS tasks only for the backup writer role', () => {
    const { template, boundary, resolve } = fixture()
    const roles = Object.values(template.findResources('AWS::IAM::Role'))
    expect(roles).toHaveLength(5)
    const trusts = roles.flatMap((role) => role.Properties.AssumeRolePolicyDocument.Statement as Statement[])
    expect(
      trusts.filter((statement) => JSON.stringify(statement.Principal).includes('ecs-tasks.amazonaws.com')),
    ).toEqual([
      {
        Effect: 'Allow',
        Action: 'sts:AssumeRole',
        Principal: { Service: 'ecs-tasks.amazonaws.com' },
        Condition: {
          ArnLike: {
            'aws:SourceArn': resolve(Stack.of(boundary).formatArn({ service: 'ecs', resource: '*' })),
          },
          StringEquals: { 'aws:SourceAccount': '111111111111' },
        },
      },
    ])
    expect(trusts.every((statement) => array(statement.Action).every((action) => action === 'sts:AssumeRole'))).toBe(
      true,
    )
    for (const role of roles) expect(role.Properties.ManagedPolicyArns).toBeUndefined()
  })

  it('keeps restore, key administration, and security audit roles separate', () => {
    const { template, boundary, resolve, roleStatements } = fixture()
    const roles = template.findResources('AWS::IAM::Role')
    for (const [role, principal] of [
      [boundary.backupVerifierRole, config.verificationPrincipalArn],
      [boundary.restoreOperatorRole, config.recoveryPrincipalArn],
      [boundary.keyAdministratorRole, config.securityPrincipalArn],
      [boundary.securityAuditorRole, config.securityPrincipalArn],
    ] as const) {
      const reference = resolve(role.roleName) as { Ref: string }
      expect(roles[reference.Ref].Properties.AssumeRolePolicyDocument.Statement).toEqual([
        { Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { AWS: principal } },
      ])
      for (const statement of roleStatements(role)) {
        expect(array(statement.Resource)).not.toContain('*')
        expect(array(statement.Action).filter((action) => /\*|^s3:Delete|bypass|s3:PutBucket/i.test(action))).toEqual(
          [],
        )
      }
    }
    const admin = roleStatements(boundary.keyAdministratorRole).flatMap((statement) => array(statement.Action))
    expect(
      admin.filter((action) => /^(s3:|secretsmanager:)|kms:(Decrypt|Encrypt|GenerateDataKey|ReEncrypt)/.test(action)),
    ).toEqual([])
    const auditor = roleStatements(boundary.securityAuditorRole).flatMap((statement) => array(statement.Action))
    expect(
      auditor.filter((action) =>
        /^(s3:Put|kms:(Put|Encrypt|GenerateDataKey|ReEncrypt|CreateGrant)|secretsmanager:GetSecretValue)/.test(action),
      ),
    ).toEqual([])
  })

  it('grants writer only required backup-prefix and encryption actions', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const statements = roleStatements(boundary.backupWriterRole)
    const actions = [...new Set(statements.flatMap((statement) => array(statement.Action)))].sort()
    expect(actions).toEqual(
      [
        'kms:Decrypt',
        'kms:DescribeKey',
        'kms:Encrypt',
        'kms:GenerateDataKey',
        's3:AbortMultipartUpload',
        's3:GetBucketLocation',
        's3:ListBucket',
        's3:ListBucketMultipartUploads',
        's3:ListMultipartUploadParts',
        's3:PutObject',
        's3:PutObjectRetention',
        'secretsmanager:DescribeSecret',
        'secretsmanager:GetSecretValue',
      ].sort(),
    )
    for (const statement of statements) {
      const actions = array(statement.Action)
      if (
        actions.some((action) =>
          ['s3:PutObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'].includes(action),
        )
      ) {
        expect(array(statement.Resource)).toEqual([
          resolve(vault.backupBucket.arnForObjects('backup-sets/daily/*')),
          resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*')),
        ])
      }
      if (actions.some((action) => action.startsWith('secretsmanager:'))) {
        expect(array(statement.Resource)).toEqual([
          resolve(boundary.sourceCredentialSecret.secretArn),
          resolve(boundary.identityHmacSecret.secretArn),
        ])
      }
      if (actions.some((action) => action.startsWith('kms:'))) {
        expect(
          array(statement.Resource).every((resource) =>
            [vault.backupKey.keyArn, boundary.secretKey.keyArn].some(
              (key) => JSON.stringify(resolve(key)) === JSON.stringify(resource),
            ),
          ),
        ).toBe(true)
      }
      if (
        actions.some((action) =>
          ['s3:GetBucketLocation', 's3:ListBucket', 's3:ListBucketMultipartUploads'].includes(action),
        )
      ) {
        expect(array(statement.Resource)).toEqual([resolve(vault.backupBucket.bucketArn)])
      }
    }
    const listing = statements.filter((statement) => array(statement.Action).includes('s3:ListBucket'))
    expect(listing).toHaveLength(1)
    expect(listing[0].Condition).toEqual({
      StringLike: { 's3:prefix': ['backup-sets/daily/*', 'backup-sets/monthly/*'] },
    })
    const multipartListing = statements.filter((statement) =>
      array(statement.Action).includes('s3:ListBucketMultipartUploads'),
    )
    expect(multipartListing).toHaveLength(1)
    expect(array(multipartListing[0].Action)).toEqual(['s3:ListBucketMultipartUploads'])
    expect(array(multipartListing[0].Resource)).toEqual([resolve(vault.backupBucket.bucketArn)])
    expect(multipartListing[0].Condition).toBeUndefined()
  })

  it('allows the security auditor to decrypt only narrowly readable audit evidence', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const statements = roleStatements(boundary.securityAuditorRole)
    const crypto = statements.filter((statement) =>
      array(statement.Action).some((action) => /^kms:(Decrypt|Encrypt|ReEncrypt|GenerateDataKey)/.test(action)),
    )
    expect(crypto).toHaveLength(1)
    expect(array(crypto[0].Action)).toEqual(['kms:Decrypt'])
    expect(array(crypto[0].Resource)).toEqual([resolve(vault.auditKey.keyArn)])
    expect(crypto[0].Condition).toEqual({ StringEquals: { 'kms:ViaService': 's3.eu-central-1.amazonaws.com' } })
    const reads = statements.filter((statement) =>
      array(statement.Action).some((action) => ['s3:GetObject', 's3:GetObjectVersion'].includes(action)),
    )
    expect(reads.flatMap((statement) => array(statement.Resource))).toEqual([
      resolve(vault.auditBucket.arnForObjects('AWSLogs/*')),
    ])
  })

  it('allows compliant 365-day monthly retention without bypass permission', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const retention = roleStatements(boundary.backupWriterRole).filter((statement) =>
      array(statement.Action).includes('s3:PutObjectRetention'),
    )
    expect(retention).toHaveLength(1)
    expect(array(retention[0].Resource)).toEqual([resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*'))])
    expect(retention[0].Condition).toEqual({
      StringEquals: { 's3:object-lock-mode': 'COMPLIANCE' },
      NumericEquals: { 's3:object-lock-remaining-retention-days': 365 },
    })
  })

  it('grants verifier report and retention access without backup-object reads', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const statements = roleStatements(boundary.backupVerifierRole).filter((statement) => statement.Effect === 'Allow')
    const readable = statements.filter((statement) =>
      array(statement.Action).some((action) => ['s3:GetObject', 's3:GetObjectVersion'].includes(action)),
    )
    expect(readable.flatMap((statement) => array(statement.Resource))).toEqual([
      ...['daily', 'monthly'].flatMap((kind) =>
        ['manifests', 'attestations'].map((type) =>
          resolve(vault.backupBucket.arnForObjects(`backup-sets/${kind}/*/${type}/*`)),
        ),
      ),
      resolve(vault.backupBucket.arnForObjects('reports/inventory/*')),
      resolve(vault.backupBucket.arnForObjects('reports/checksums/*')),
      resolve(vault.auditBucket.arnForObjects('AWSLogs/*')),
    ])
    const actions = statements.flatMap((statement) => array(statement.Action))
    expect(actions).toContain('s3:GetObjectRetention')
    expect(actions).not.toContain('s3:GetObjectAttributes')
    expect(actions).not.toContain('s3:GetObjectVersionAttributes')
    expect(actions.some((action) => /^(s3:Put|secretsmanager:|kms:Encrypt|kms:GenerateDataKey)/.test(action))).toBe(
      false,
    )
    for (const statement of statements.filter((statement) =>
      array(statement.Action).some((action) => action.startsWith('kms:')),
    )) {
      expect(array(statement.Action)).toEqual(['kms:Decrypt'])
      expect(
        array(statement.Resource).every((resource) =>
          [vault.backupKey.keyArn, vault.auditKey.keyArn].some(
            (key) => JSON.stringify(resource) === JSON.stringify(resolve(key)),
          ),
        ),
      ).toBe(true)
      expect(statement.Condition).toEqual({ StringEquals: { 'kms:ViaService': 's3.eu-central-1.amazonaws.com' } })
    }
    const retention = statements.filter((statement) => array(statement.Action).includes('s3:GetObjectRetention'))
    expect(retention.flatMap((statement) => array(statement.Resource))).toEqual([
      resolve(vault.backupBucket.arnForObjects('backup-sets/daily/*')),
      resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*')),
    ])
  })

  it('explicitly denies all verifier payload reads and attributes in both backup classes', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const denied = roleStatements(boundary.backupVerifierRole).filter((statement) => statement.Effect === 'Deny')
    expect(denied).toHaveLength(1)
    expect(array(denied[0].Action).sort()).toEqual([
      's3:GetObject',
      's3:GetObjectAttributes',
      's3:GetObjectVersion',
      's3:GetObjectVersionAttributes',
    ])
    expect(array(denied[0].Resource)).toEqual([
      resolve(vault.backupBucket.arnForObjects('backup-sets/daily/*/objects/*')),
      resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*/objects/*')),
    ])
    expect(denied[0].Condition).toBeUndefined()
  })

  it('covers nested payload keys even when they also match evidence allow wildcards', () => {
    const { boundary, roleStatements } = fixture()
    const statements = roleStatements(boundary.backupVerifierRole)
    // The fixture's synthesized object ARNs share the same bucket token. Compare
    // their literal key suffix using IAM '*' semantics, which include slashes.
    // This demonstrates the overlap; it is not a general IAM policy simulator.
    const matchesKey = (resource: unknown, key: string): boolean => {
      const suffix = (resource as { 'Fn::Join': [string, unknown[]] })['Fn::Join'][1].at(-1)
      expect(typeof suffix).toBe('string')
      const pattern = (suffix as string)
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')
      return new RegExp(`^${pattern}$`).test(`/${key}`)
    }
    const matchingStatements = (effect: string, key: string) =>
      statements.filter(
        (statement) =>
          statement.Effect === effect &&
          array(statement.Action).includes('s3:GetObject') &&
          array(statement.Resource).some((resource) => matchesKey(resource, key)),
      )
    for (const kind of ['daily', 'monthly']) {
      for (const evidence of ['manifests', 'attestations']) {
        const craftedKey = `backup-sets/${kind}/set/objects/id/${evidence}/leak`
        expect(matchingStatements('Allow', craftedKey)).toHaveLength(1)
        expect(matchingStatements('Deny', craftedKey)).toHaveLength(1)
        const legitimateKey = `backup-sets/${kind}/set/${evidence}/report.json`
        expect(matchingStatements('Allow', legitimateKey)).toHaveLength(1)
        expect(matchingStatements('Deny', legitimateKey)).toHaveLength(0)
      }
    }
  })

  it('permits restore version reads only in approved data-object namespaces', () => {
    const { boundary, vault, resolve, roleStatements } = fixture()
    const statements = roleStatements(boundary.restoreOperatorRole)
    const reads = statements.filter((statement) => array(statement.Action).includes('s3:GetObjectVersion'))
    expect(reads.flatMap((statement) => array(statement.Resource))).toEqual([
      resolve(vault.backupBucket.arnForObjects('backup-sets/daily/*/objects/*')),
      resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*/objects/*')),
    ])
    const actions = statements.flatMap((statement) => array(statement.Action))
    expect(actions).toContain('kms:Decrypt')
    expect(
      actions.some((action) =>
        /^(s3:(GetObject$|Put|Delete)|secretsmanager:|kms:(Encrypt|GenerateDataKey))/.test(action),
      ),
    ).toBe(false)
  })

  it('keeps alert-key administration independent from the three OPS-02 administrative keys', () => {
    const { template, boundary, vault, resolve, roleStatements } = fixture()
    const expectedActions = [
      'kms:DescribeKey',
      'kms:GetKeyPolicy',
      'kms:GetKeyRotationStatus',
      'kms:ListResourceTags',
      'kms:PutKeyPolicy',
      'kms:EnableKeyRotation',
      'kms:DisableKeyRotation',
      'kms:EnableKey',
      'kms:DisableKey',
      'kms:ScheduleKeyDeletion',
      'kms:CancelKeyDeletion',
      'kms:UpdateKeyDescription',
      'kms:TagResource',
      'kms:UntagResource',
    ].sort()
    const admin = roleStatements(boundary.keyAdministratorRole)
    expect(admin).toHaveLength(1)
    expect(array(admin[0].Action).sort()).toEqual(expectedActions)
    expect(array(admin[0].Resource)).toEqual([
      resolve(vault.backupKey.keyArn),
      resolve(vault.auditKey.keyArn),
      resolve(boundary.secretKey.keyArn),
    ])
    const alertKeyReference = resolve(vault.alertKey.keyId) as { Ref: string }
    for (const [logicalId, key] of Object.entries(template.findResources('AWS::KMS::Key'))) {
      const policies = (key.Properties.KeyPolicy.Statement as Statement[]).filter(
        (statement) =>
          JSON.stringify(statement.Principal) ===
          JSON.stringify({ AWS: resolve(boundary.keyAdministratorRole.roleArn) }),
      )
      if (logicalId === alertKeyReference.Ref) {
        expect(policies).toEqual([])
        continue
      }
      expect(policies).toHaveLength(1)
      expect(array(policies[0].Action).sort()).toEqual(expectedActions)
      expect(policies[0].Resource).toBe('*')
    }
  })

  it('denies insecure transport, wrong encryption, and invalid monthly retention without bucket-management denies', () => {
    const { template, vault, resolve } = fixture()
    const backupPolicy = Object.values(template.findResources('AWS::S3::BucketPolicy')).find(
      (policy) => JSON.stringify(policy.Properties.Bucket) === JSON.stringify(resolve(vault.backupBucket.bucketName)),
    )!
    const statements = backupPolicy.Properties.PolicyDocument.Statement as Statement[]
    expect(statements.every((statement) => statement.Effect === 'Deny')).toBe(true)
    expect(statements).toContainEqual(
      expect.objectContaining({ Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
    )
    const monthly = statements.filter((statement) => JSON.stringify(statement.Condition).includes('object-lock-'))
    expect(monthly).toHaveLength(3)
    for (const statement of monthly) {
      expect(array(statement.Action)).toEqual(['s3:PutObjectRetention'])
      expect(array(statement.Resource)).toEqual([resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*'))])
    }
    expect(monthly.map((statement) => statement.Condition)).toEqual([
      { StringNotEquals: { 's3:object-lock-mode': 'COMPLIANCE' } },
      { Null: { 's3:object-lock-remaining-retention-days': 'true' } },
      { NumericNotEquals: { 's3:object-lock-remaining-retention-days': 365 } },
    ])
    const encryption = statements.filter((statement) =>
      JSON.stringify(statement.Condition).includes('server-side-encryption'),
    )
    expect(encryption).toHaveLength(4)
    for (const statement of encryption) {
      expect(array(statement.Action)).toEqual(['s3:PutObject'])
      expect(array(statement.Resource)).toEqual([
        resolve(vault.backupBucket.arnForObjects('backup-sets/daily/*')),
        resolve(vault.backupBucket.arnForObjects('backup-sets/monthly/*')),
      ])
    }
    expect(encryption.map((statement) => statement.Condition)).toEqual([
      {
        StringNotEquals: { 's3:x-amz-server-side-encryption': 'aws:kms' },
        Null: { 's3:x-amz-server-side-encryption': 'false' },
      },
      {
        StringNotEquals: { 's3:x-amz-server-side-encryption-aws-kms-key-id': resolve(vault.backupKey.keyArn) },
        Null: { 's3:x-amz-server-side-encryption-aws-kms-key-id': 'false' },
      },
      {
        StringEquals: { 's3:x-amz-server-side-encryption': 'aws:kms' },
        Null: { 's3:x-amz-server-side-encryption-aws-kms-key-id': 'true' },
      },
      { Null: { 's3:x-amz-server-side-encryption-customer-algorithm': 'false' } },
    ])
  })

  it('contains no wildcard resource, delete, governance bypass, bucket mutation, or KMS administration grant in the writer', () => {
    const { boundary, roleStatements } = fixture()
    const statements = roleStatements(boundary.backupWriterRole)
    const forbidden = statements
      .flatMap((statement) => array(statement.Action))
      .filter((action) =>
        /\*|delete|bypass|s3:GetObject|s3:PutBucket|kms:(Create|Put|Disable|Schedule|Cancel|Revoke|Update|Enable|Tag|Untag)/i.test(
          action,
        ),
      )
    expect(forbidden).toEqual([])
    for (const statement of statements) {
      expect(statement.Effect).toBe('Allow')
      expect(array(statement.Resource)).not.toContain('*')
    }
  })
})

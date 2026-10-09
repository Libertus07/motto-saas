import {
  Duration,
  RemovalPolicy,
  Stack,
  aws_iam as iam,
  aws_kms as kms,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { OPS02_RETENTION, type Ops02FoundationConfig } from './config.js'

export interface Ops02AccessBoundaryProps {
  readonly config: Ops02FoundationConfig
  readonly backupBucket: s3.IBucket
  readonly auditBucket: s3.IBucket
  readonly backupKey: kms.IKey
  readonly auditKey: kms.IKey
  readonly alertKey: kms.IKey
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

  constructor(scope: Construct, id: string, props: Ops02AccessBoundaryProps) {
    super(scope, id)
    const { config, backupBucket, auditBucket, backupKey, auditKey, alertKey } = props
    this.secretKey = new kms.Key(this, 'SecretKey', {
      description: `OPS-02 ${config.stage} credential container encryption`,
      enableKeyRotation: true,
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    })
    const secretProps = {
      encryptionKey: this.secretKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ status: 'UNINITIALIZED' }),
        generateStringKey: 'bootstrapNonce',
        passwordLength: 32,
        excludePunctuation: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    }
    this.sourceCredentialSecret = new secretsmanager.Secret(this, 'SourceCredentialSecret', {
      ...secretProps,
      secretName: `/motto-saas/ops02/${config.stage}/source-s3`,
    })
    this.identityHmacSecret = new secretsmanager.Secret(this, 'IdentityHmacSecret', {
      ...secretProps,
      secretName: `/motto-saas/ops02/${config.stage}/identity-hmac`,
    })

    this.backupWriterRole = new iam.Role(this, 'BackupWriterRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        conditions: {
          ArnLike: {
            'aws:SourceArn': Stack.of(this).formatArn({ service: 'ecs', resource: '*' }),
          },
          StringEquals: { 'aws:SourceAccount': config.account },
        },
      }),
    })
    this.backupVerifierRole = new iam.Role(this, 'BackupVerifierRole', {
      assumedBy: new iam.ArnPrincipal(config.verificationPrincipalArn),
    })
    this.restoreOperatorRole = new iam.Role(this, 'RestoreOperatorRole', {
      assumedBy: new iam.ArnPrincipal(config.recoveryPrincipalArn),
    })
    this.keyAdministratorRole = new iam.Role(this, 'KeyAdministratorRole', {
      assumedBy: new iam.ArnPrincipal(config.securityPrincipalArn),
    })
    this.securityAuditorRole = new iam.Role(this, 'SecurityAuditorRole', {
      assumedBy: new iam.ArnPrincipal(config.securityPrincipalArn),
    })

    const backupPrefixes = ['backup-sets/daily/*', 'backup-sets/monthly/*']
    const backupObjects = backupPrefixes.map((prefix) => backupBucket.arnForObjects(prefix))
    const payloadObjects = [
      backupBucket.arnForObjects('backup-sets/daily/*/objects/*'),
      backupBucket.arnForObjects('backup-sets/monthly/*/objects/*'),
    ]
    const monthlyObjects = [backupBucket.arnForObjects('backup-sets/monthly/*')]
    const evidencePrefixes = ['daily', 'monthly']
      .flatMap((kind) => ['manifests', 'attestations'].map((type) => `backup-sets/${kind}/*/${type}/*`))
      .concat(['reports/inventory/*', 'reports/checksums/*'])
    const evidenceObjects = evidencePrefixes.map((prefix) => backupBucket.arnForObjects(prefix))
    const auditObjects = [auditBucket.arnForObjects('AWSLogs/*')]
    const keys = [backupKey, auditKey, this.secretKey]
    const auditableKeys = [...keys, alertKey]
    const secrets = [this.sourceCredentialSecret.secretArn, this.identityHmacSecret.secretArn]

    const allow = (role: iam.Role, actions: string[], resources: string[], conditions?: iam.Conditions) => {
      role.addToPrincipalPolicy(new iam.PolicyStatement({ actions, resources, conditions }))
    }
    const list = (role: iam.Role, bucket: s3.IBucket, prefixes: string[]) => {
      allow(role, ['s3:ListBucket'], [bucket.bucketArn], { StringLike: { 's3:prefix': prefixes } })
    }
    const decrypt = (role: iam.Role, key: kms.IKey) => {
      allow(role, ['kms:Decrypt'], [key.keyArn], {
        StringEquals: { 'kms:ViaService': `s3.${config.region}.amazonaws.com` },
      })
    }

    allow(this.backupWriterRole, ['s3:GetBucketLocation'], [backupBucket.bucketArn])
    list(this.backupWriterRole, backupBucket, backupPrefixes)
    // This action does not support s3:prefix. The dedicated bucket is its minimum
    // resource scope; Phase B must validate the live multipart action/condition matrix.
    allow(this.backupWriterRole, ['s3:ListBucketMultipartUploads'], [backupBucket.bucketArn])
    // Upload responses, not GetObject/attributes calls, supply version/checksum evidence.
    allow(
      this.backupWriterRole,
      ['s3:PutObject', 's3:AbortMultipartUpload', 's3:ListMultipartUploadParts'],
      backupObjects,
    )
    allow(this.backupWriterRole, ['s3:PutObjectRetention'], monthlyObjects, {
      StringEquals: { 's3:object-lock-mode': 'COMPLIANCE' },
      NumericEquals: { 's3:object-lock-remaining-retention-days': OPS02_RETENTION.monthlyDays },
    })
    allow(this.backupWriterRole, ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey'], [backupKey.keyArn], {
      StringEquals: { 'kms:ViaService': `s3.${config.region}.amazonaws.com` },
    })
    allow(this.backupWriterRole, ['kms:DescribeKey'], [backupKey.keyArn, this.secretKey.keyArn])
    allow(this.backupWriterRole, ['kms:Decrypt'], [this.secretKey.keyArn], {
      StringEquals: {
        'kms:ViaService': `secretsmanager.${config.region}.amazonaws.com`,
        'kms:EncryptionContext:SecretARN': secrets,
      },
    })
    allow(this.backupWriterRole, ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'], secrets)

    list(this.backupVerifierRole, backupBucket, evidencePrefixes)
    list(this.backupVerifierRole, auditBucket, ['AWSLogs/*'])
    allow(this.backupVerifierRole, ['s3:GetObject', 's3:GetObjectVersion'], [...evidenceObjects, ...auditObjects])
    // IAM '*' spans slashes: a nested objects/.../manifests/... key can match
    // the evidence allowlist. Explicit denial keeps payload reads restore-only.
    this.backupVerifierRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['s3:GetObject', 's3:GetObjectVersion', 's3:GetObjectAttributes', 's3:GetObjectVersionAttributes'],
        resources: payloadObjects,
      }),
    )
    allow(this.backupVerifierRole, ['s3:GetObjectRetention'], backupObjects)
    allow(this.backupVerifierRole, ['s3:GetBucketLocation'], [backupBucket.bucketArn, auditBucket.bucketArn])
    decrypt(this.backupVerifierRole, backupKey)
    decrypt(this.backupVerifierRole, auditKey)

    allow(this.restoreOperatorRole, ['s3:GetObjectVersion'], payloadObjects)
    decrypt(this.restoreOperatorRole, backupKey)

    const keyAdministrationActions = [
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
    ]
    allow(
      this.keyAdministratorRole,
      keyAdministrationActions,
      keys.map((key) => key.keyArn),
    )
    for (const key of keys) {
      key.addToResourcePolicy(
        new iam.PolicyStatement({
          actions: keyAdministrationActions,
          principals: [this.keyAdministratorRole],
          // KMS key policies use '*' to identify this attached key, not other keys.
          resources: ['*'],
        }),
        false,
      )
    }

    allow(
      this.securityAuditorRole,
      [
        's3:GetBucketLocation',
        's3:GetBucketPolicy',
        's3:GetBucketVersioning',
        's3:GetBucketPublicAccessBlock',
        's3:GetBucketOwnershipControls',
        's3:GetEncryptionConfiguration',
        's3:GetBucketObjectLockConfiguration',
      ],
      [backupBucket.bucketArn, auditBucket.bucketArn],
    )
    list(this.securityAuditorRole, auditBucket, ['AWSLogs/*'])
    allow(this.securityAuditorRole, ['s3:GetObject', 's3:GetObjectVersion'], auditObjects)
    // Audit evidence only: no backup-key or secret-key cryptographic use.
    decrypt(this.securityAuditorRole, auditKey)
    allow(this.securityAuditorRole, ['s3:GetObjectRetention'], backupObjects)
    allow(
      this.securityAuditorRole,
      ['kms:DescribeKey', 'kms:GetKeyPolicy', 'kms:GetKeyRotationStatus', 'kms:ListResourceTags'],
      auditableKeys.map((key) => key.keyArn),
    )

    const deny = (bucket: s3.IBucket, actions: string[], resources: string[], conditions: iam.Conditions) => {
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions,
          resources,
          conditions,
        }),
      )
    }
    for (const bucket of [backupBucket, auditBucket]) {
      deny(bucket, ['s3:*'], [bucket.bucketArn, bucket.arnForObjects('*')], {
        Bool: { 'aws:SecureTransport': 'false' },
      })
    }
    // Missing encryption headers use the vault's KMS default; reject overrides.
    // Requiring headers on every PutObject authorization would break multipart parts.
    deny(backupBucket, ['s3:PutObject'], backupObjects, {
      StringNotEquals: { 's3:x-amz-server-side-encryption': 'aws:kms' },
      Null: { 's3:x-amz-server-side-encryption': 'false' },
    })
    deny(backupBucket, ['s3:PutObject'], backupObjects, {
      StringNotEquals: { 's3:x-amz-server-side-encryption-aws-kms-key-id': backupKey.keyArn },
      Null: { 's3:x-amz-server-side-encryption-aws-kms-key-id': 'false' },
    })
    deny(backupBucket, ['s3:PutObject'], backupObjects, {
      StringEquals: { 's3:x-amz-server-side-encryption': 'aws:kms' },
      Null: { 's3:x-amz-server-side-encryption-aws-kms-key-id': 'true' },
    })
    deny(backupBucket, ['s3:PutObject'], backupObjects, {
      Null: { 's3:x-amz-server-side-encryption-customer-algorithm': 'false' },
    })
    // Phase A constrains explicit retention changes only. Initial monthly uploads
    // may inherit the 90-day default; 365-day multipart proof remains a deployment gate.
    deny(backupBucket, ['s3:PutObjectRetention'], monthlyObjects, {
      StringNotEquals: { 's3:object-lock-mode': 'COMPLIANCE' },
    })
    deny(backupBucket, ['s3:PutObjectRetention'], monthlyObjects, {
      Null: { 's3:object-lock-remaining-retention-days': 'true' },
    })
    deny(backupBucket, ['s3:PutObjectRetention'], monthlyObjects, {
      NumericNotEquals: { 's3:object-lock-remaining-retention-days': OPS02_RETENTION.monthlyDays },
    })
  }
}

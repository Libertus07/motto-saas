import { App, CfnResource, Stack } from 'aws-cdk-lib'
import { Match, Template } from 'aws-cdk-lib/assertions'
import { beforeAll, describe, expect, it } from 'vitest'
import { Ops02BackupVault } from '../src/backup-vault.js'
import type { Ops02Stage } from '../src/config.js'

function synthesizeVault(stage: Ops02Stage) {
  const stack = new Stack(new App(), `Vault-${stage}`)
  const vault = new Ops02BackupVault(stack, 'Vault', { stage })
  const template = Template.fromStack(stack)
  const backupBucketId = stack.getLogicalId(vault.backupBucket.node.defaultChild as CfnResource)
  const auditBucketId = stack.getLogicalId(vault.auditBucket.node.defaultChild as CfnResource)
  const backupKeyId = stack.getLogicalId(vault.backupKey.node.defaultChild as CfnResource)
  const auditKeyId = stack.getLogicalId(vault.auditKey.node.defaultChild as CfnResource)
  const alertKeyId = stack.getLogicalId(vault.alertKey.node.defaultChild as CfnResource)

  return {
    stack,
    vault,
    templateSource: JSON.stringify(template.toJSON()),
    backupBucketId,
    auditBucketId,
    backupKeyId,
    auditKeyId,
    alertKeyId,
  }
}

describe.each<Ops02Stage>(['test', 'production'])('Ops02BackupVault (%s)', (stage) => {
  let synthesizedVault: ReturnType<typeof synthesizeVault>

  beforeAll(() => {
    synthesizedVault = synthesizeVault(stage)
  })

  function createVault() {
    const { templateSource, ...artifacts } = synthesizedVault
    const template = Template.fromString(templateSource)
    return { ...artifacts, template, resources: template.toJSON().Resources }
  }

  it('creates a retained private versioned backup bucket with 90-day compliance lock', () => {
    const { template, resources, backupBucketId } = createVault()

    template.resourceCountIs('AWS::S3::Bucket', 2)
    expect(resources[backupBucketId]).toMatchObject({
      Type: 'AWS::S3::Bucket',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        VersioningConfiguration: { Status: 'Enabled' },
        ObjectLockEnabled: true,
        ObjectLockConfiguration: {
          ObjectLockEnabled: 'Enabled',
          Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 90 } },
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      },
    })
    expect(resources[backupBucketId].Properties).not.toHaveProperty('LoggingConfiguration')
  })

  it('encrypts backup objects with a rotating customer-managed KMS key', () => {
    const { template, resources, backupBucketId, backupKeyId } = createVault()

    template.resourceCountIs('AWS::KMS::Key', 3)
    expect(resources[backupKeyId]).toMatchObject({
      Type: 'AWS::KMS::Key',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { EnableKeyRotation: true, PendingWindowInDays: 30 },
    })
    expect(resources[backupBucketId].Properties.BucketEncryption).toEqual({
      ServerSideEncryptionConfiguration: [
        {
          BucketKeyEnabled: true,
          ServerSideEncryptionByDefault: {
            SSEAlgorithm: 'aws:kms',
            KMSMasterKeyID: { 'Fn::GetAtt': [backupKeyId, 'Arn'] },
          },
        },
      ],
    })
  })

  it('creates a distinct retained audit bucket and audit KMS key', () => {
    const { resources, backupBucketId, auditBucketId, backupKeyId, auditKeyId, alertKeyId } = createVault()

    expect(auditBucketId).not.toBe(backupBucketId)
    expect(auditKeyId).not.toBe(backupKeyId)
    expect(alertKeyId).not.toBe(auditKeyId)
    expect(alertKeyId).not.toBe(backupKeyId)
    expect(resources[alertKeyId]).toMatchObject({
      Type: 'AWS::KMS::Key',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { EnableKeyRotation: true, PendingWindowInDays: 30 },
    })
    expect(resources[auditKeyId]).toMatchObject({
      Type: 'AWS::KMS::Key',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: { EnableKeyRotation: true, PendingWindowInDays: 30 },
    })
    expect(resources[auditBucketId]).toMatchObject({
      Type: 'AWS::S3::Bucket',
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        VersioningConfiguration: { Status: 'Enabled' },
        ObjectLockEnabled: true,
        ObjectLockConfiguration: {
          ObjectLockEnabled: 'Enabled',
          Rule: { DefaultRetention: { Mode: 'COMPLIANCE', Days: 365 } },
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              BucketKeyEnabled: true,
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
                KMSMasterKeyID: { 'Fn::GetAtt': [auditKeyId, 'Arn'] },
              },
            },
          ],
        },
      },
    })
  })

  it('denies non-TLS access and disables ACL ownership', () => {
    const { stack, vault, template, resources, backupBucketId, auditBucketId } = createVault()

    for (const [bucketId, bucket] of [
      [backupBucketId, vault.backupBucket],
      [auditBucketId, vault.auditBucket],
    ] as const) {
      expect(resources[bucketId].Properties.OwnershipControls).toEqual({
        Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }],
      })
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        Bucket: { Ref: bucketId },
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 's3:*',
              Effect: 'Deny',
              Principal: { AWS: '*' },
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
              Resource: stack.resolve([bucket.bucketArn, bucket.arnForObjects('*')]),
            }),
          ]),
        },
      })
    }
  })

  it('never configures automatic bucket deletion', () => {
    const { template } = createVault()

    template.resourceCountIs('Custom::S3AutoDeleteObjects', 0)
    template.resourceCountIs('AWS::Lambda::Function', 0)
  })
})

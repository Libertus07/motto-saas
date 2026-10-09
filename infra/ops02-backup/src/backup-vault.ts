import { Duration, RemovalPolicy, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { OPS02_RETENTION, type Ops02Stage } from './config.js'

export interface Ops02BackupVaultProps {
  readonly stage: Ops02Stage
}

export class Ops02BackupVault extends Construct {
  public readonly backupBucket: s3.Bucket
  public readonly auditBucket: s3.Bucket
  public readonly backupKey: kms.Key
  public readonly auditKey: kms.Key
  public readonly alertKey: kms.Key

  constructor(scope: Construct, id: string, props: Ops02BackupVaultProps) {
    super(scope, id)

    this.backupKey = new kms.Key(this, 'BackupKey', {
      description: `OPS-02 ${props.stage} backup encryption`,
      enableKeyRotation: true,
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.auditKey = new kms.Key(this, 'AuditKey', {
      description: `OPS-02 ${props.stage} audit encryption`,
      enableKeyRotation: true,
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    })
    // Keep the alert path independent from the audit key it monitors. The
    // OPS-02 key-administrator role intentionally receives no administration
    // grant on this key; account-level break-glass administration remains.
    this.alertKey = new kms.Key(this, 'AlertKey', {
      description: `OPS-02 ${props.stage} security alert encryption`,
      enableKeyRotation: true,
      pendingWindow: Duration.days(30),
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.backupBucket = new s3.Bucket(this, 'BackupBucket', {
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(Duration.days(OPS02_RETENTION.dailyDays)),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.backupKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.auditBucket = new s3.Bucket(this, 'AuditBucket', {
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(Duration.days(OPS02_RETENTION.auditDays)),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.auditKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      enforceSSL: true,
      autoDeleteObjects: false,
      removalPolicy: RemovalPolicy.RETAIN,
    })
  }
}

import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { Ops02AccessBoundary } from './access-boundary.js'
import { Ops02AuditMonitoring } from './audit-monitoring.js'
import { Ops02BackupVault } from './backup-vault.js'
import type { Ops02FoundationConfig } from './config.js'

export interface Ops02FoundationStackProps extends StackProps {
  readonly config: Ops02FoundationConfig
}

export class Ops02FoundationStack extends Stack {
  constructor(scope: Construct, id: string, props: Ops02FoundationStackProps) {
    super(scope, id, props)

    const { config } = props
    const vault = new Ops02BackupVault(this, 'Vault', { stage: config.stage })
    const access = new Ops02AccessBoundary(this, 'Access', {
      config,
      backupBucket: vault.backupBucket,
      auditBucket: vault.auditBucket,
      backupKey: vault.backupKey,
      auditKey: vault.auditKey,
    })
    const monitoring = new Ops02AuditMonitoring(this, 'Monitoring', {
      backupBucket: vault.backupBucket,
      auditBucket: vault.auditBucket,
      auditKey: vault.auditKey,
      securityAuditorRole: access.securityAuditorRole,
    })

    Tags.of(this).add('Project', 'MottoSaaS')
    Tags.of(this).add('Control', 'OPS-02')
    Tags.of(this).add('Owner', 'Motto SaaS platform owner')
    Tags.of(this).add('Stage', config.stage)
    Tags.of(this).add('ManagedBy', 'CDK')

    for (const [name, value] of Object.entries({
      BackupBucketName: vault.backupBucket.bucketName,
      AuditBucketName: vault.auditBucket.bucketName,
      BackupKeyArn: vault.backupKey.keyArn,
      AuditKeyArn: vault.auditKey.keyArn,
      BackupWriterRoleArn: access.backupWriterRole.roleArn,
      BackupVerifierRoleArn: access.backupVerifierRole.roleArn,
      RestoreOperatorRoleArn: access.restoreOperatorRole.roleArn,
      KeyAdministratorRoleArn: access.keyAdministratorRole.roleArn,
      SecurityAuditorRoleArn: access.securityAuditorRole.roleArn,
      SecurityTopicArn: monitoring.securityTopic.topicArn,
      SourceCredentialSecretArn: access.sourceCredentialSecret.secretArn,
      IdentityHmacSecretArn: access.identityHmacSecret.secretArn,
    })) {
      new CfnOutput(this, name, { value })
    }
  }
}

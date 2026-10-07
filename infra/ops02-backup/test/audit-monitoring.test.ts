import { App, ArnFormat, Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { describe, expect, it } from 'vitest'
import { Ops02AccessBoundary } from '../src/access-boundary.js'
import { Ops02AuditMonitoring } from '../src/audit-monitoring.js'
import { Ops02BackupVault } from '../src/backup-vault.js'
import { parseOps02FoundationConfig } from '../src/config.js'

const config = parseOps02FoundationConfig({
  stage: 'test',
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
  Principal?: { Service?: string; AWS?: unknown }
  Condition?: Record<string, Record<string, unknown>>
}

function array<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

function fixture(stackId = 'AuditTest', monitoringId = 'Monitoring') {
  const app = new App()
  const stack = new Stack(app, stackId, { env: { account: config.account, region: config.region } })
  const vault = new Ops02BackupVault(stack, 'Vault', { stage: config.stage })
  const access = new Ops02AccessBoundary(stack, 'Access', {
    config,
    backupBucket: vault.backupBucket,
    auditBucket: vault.auditBucket,
    backupKey: vault.backupKey,
    auditKey: vault.auditKey,
  })
  const monitoring = new Ops02AuditMonitoring(stack, monitoringId, {
    backupBucket: vault.backupBucket,
    auditBucket: vault.auditBucket,
    auditKey: vault.auditKey,
    securityAuditorRole: access.securityAuditorRole,
  })
  const template = Template.fromStack(stack)
  const resolve = (value: unknown): unknown => stack.resolve(value)
  const trail = Object.values(template.findResources('AWS::CloudTrail::Trail'))[0]
  const rule = Object.values(template.findResources('AWS::Events::Rule'))[0]
  const group = Object.values(template.findResources('AWS::Logs::LogGroup'))[0]
  // Policy ARNs use explicit names, avoiding circular resource dependencies.
  const trailArn = stack.formatArn({
    service: 'cloudtrail',
    resource: 'trail',
    resourceName: trail.Properties.TrailName,
  })
  const ruleArn = stack.formatArn({ service: 'events', resource: 'rule', resourceName: rule.Properties.Name })
  const logGroupArn = stack.formatArn({
    service: 'logs',
    resource: 'log-group',
    resourceName: group.Properties.LogGroupName,
    arnFormat: ArnFormat.COLON_RESOURCE_NAME,
  })
  const roleStatements = (roleName: unknown): Statement[] =>
    Object.values(template.findResources('AWS::IAM::Policy'))
      .filter((policy) =>
        policy.Properties.Roles.some((name: unknown) => JSON.stringify(name) === JSON.stringify(roleName)),
      )
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
  return { template, vault, access, monitoring, resolve, trail, rule, roleStatements, trailArn, ruleArn, logGroupArn }
}

describe('OPS-02 audit monitoring', () => {
  it('keeps security rule names within 64 characters for long valid construct paths and synthesizes deterministically', () => {
    const stackId = 'Ops02BackupFoundationForTheProductionSecurityAuditEnvironmentAndNameBoundaryRegression'
    const scopeId = 'AuditMonitoringForTheSeparateImmutableBackupDestinationAndSecurityNotificationBoundary'
    const first = fixture(stackId, scopeId)
    const second = fixture(stackId, scopeId)
    expect(first.rule.Properties.Name.length).toBeLessThanOrEqual(64)
    expect(first.rule.Properties.Name).toMatch(/-security$/)
    expect(first.template.toJSON()).toEqual(second.template.toJSON())
  })

  // Removing encryption, validation, delivery, or retention must break this contract.
  it('writes an encrypted validated multi-region trail to the separate audit bucket', () => {
    const { template, vault, monitoring, resolve, trail } = fixture()
    template.resourceCountIs('AWS::CloudTrail::Trail', 1)
    expect(trail.Properties).toMatchObject({
      IsLogging: true,
      IsMultiRegionTrail: true,
      IncludeGlobalServiceEvents: true,
      EnableLogFileValidation: true,
      S3BucketName: resolve(vault.auditBucket.bucketName),
      KMSKeyId: resolve(vault.auditKey.keyArn),
      CloudWatchLogsLogGroupArn: resolve(monitoring.trailLogGroup.logGroupArn),
    })
    expect(trail.Properties.S3BucketName).not.toEqual(resolve(vault.backupBucket.bucketName))
    expect(trail.Properties.CloudWatchLogsRoleArn).toBeDefined()
    const group = Object.values(template.findResources('AWS::Logs::LogGroup'))[0]
    expect(group.Properties.KmsKeyId).toEqual(resolve(vault.auditKey.keyArn))
    expect(group.Properties.RetentionInDays).toBe(365)
    expect(group.DeletionPolicy).toBe('Retain')
    expect(group.UpdateReplacePolicy).toBe('Retain')
    const deliveryRole = (trail.Properties.CloudWatchLogsRoleArn as { 'Fn::GetAtt': [string, string] })['Fn::GetAtt'][0]
    const statements = roleStatementsFor(template, { Ref: deliveryRole })
    expect(statements.flatMap((statement) => array(statement.Action)).sort()).toEqual([
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ])
    for (const statement of statements) {
      expect(array(statement.Resource)).toEqual([resolve(monitoring.trailLogGroup.logGroupArn)])
    }
  })

  // Broad/all-bucket selectors or a lost backup prefix must fail.
  it('selects object data events only for the backup bucket', () => {
    const { trail, vault, resolve } = fixture()
    expect(trail.Properties.EventSelectors).toEqual([
      { IncludeManagementEvents: true, ReadWriteType: 'All' },
      {
        DataResources: [{ Type: 'AWS::S3::Object', Values: [resolve(`${vault.backupBucket.bucketArn}/backup-sets/`)] }],
        IncludeManagementEvents: false,
        ReadWriteType: 'All',
      },
    ])
  })

  it('does not recursively select the CloudTrail audit bucket', () => {
    const { trail, vault, resolve } = fixture()
    const values = trail.Properties.EventSelectors.flatMap(
      (selector: { DataResources?: { Values: unknown[] }[] }) =>
        selector.DataResources?.flatMap((resource) => resource.Values) ?? [],
    )
    expect(values).toHaveLength(1)
    expect(JSON.stringify(values)).not.toContain(JSON.stringify(resolve(vault.auditBucket.bucketArn)))
    expect(values).not.toContain('arn:aws:s3:::')
  })

  // Each missing security event, target, or encryption key must fail.
  it('routes bucket, Object Lock, KMS, and deletion-risk events to an encrypted topic', () => {
    const { template, monitoring, vault, resolve, rule } = fixture()
    template.resourceCountIs('AWS::Events::Rule', 1)
    template.resourceCountIs('AWS::SNS::Topic', 1)
    expect(rule.Properties.State).toBe('ENABLED')
    expect(rule.Properties.EventPattern).toEqual({
      source: ['aws.s3', 'aws.kms'],
      'detail-type': ['AWS API Call via CloudTrail'],
      detail: {
        eventSource: ['s3.amazonaws.com', 'kms.amazonaws.com'],
        eventName: [
          'PutBucketPolicy',
          'DeleteBucketPolicy',
          'PutBucketPublicAccessBlock',
          'DeleteBucketPublicAccessBlock',
          'PutBucketVersioning',
          'PutObjectLockConfiguration',
          'DeleteObject',
          'DeleteObjects',
          'ScheduleKeyDeletion',
          'DisableKey',
          'PutKeyPolicy',
        ],
      },
    })
    expect(rule.Properties.Targets).toHaveLength(1)
    expect(rule.Properties.Targets[0].Arn).toEqual(resolve(monitoring.securityTopic.topicArn))
    const topic = Object.values(template.findResources('AWS::SNS::Topic'))[0]
    expect(topic.Properties.KmsMasterKeyId).toEqual(resolve(vault.auditKey.keyArn))
  })

  it('creates no email, webhook, or external subscription before owner approval', () => {
    const { template } = fixture()
    template.resourceCountIs('AWS::SNS::Subscription', 0)
    template.resourceCountIs('AWS::Events::ApiDestination', 0)
    const topic = Object.values(template.findResources('AWS::SNS::Topic'))[0]
    expect(topic.Properties.Subscription).toBeUndefined()
  })

  it('grants security auditor only scoped trail, log, and topic read visibility', () => {
    const { access, monitoring, resolve, roleStatements } = fixture()
    const statements = roleStatements(resolve(access.securityAuditorRole.roleName)).filter((statement) =>
      array(statement.Action).some((action) => /^(cloudtrail|logs|sns):/.test(action)),
    )
    const actions = statements.flatMap((statement) => array(statement.Action)).sort()
    expect(actions).toEqual(
      [
        'cloudtrail:DescribeTrails',
        'cloudtrail:GetTrail',
        'cloudtrail:GetTrailStatus',
        'cloudtrail:GetEventSelectors',
        'logs:DescribeLogGroups',
        'logs:DescribeLogStreams',
        'logs:GetLogEvents',
        'logs:FilterLogEvents',
        'sns:GetTopicAttributes',
        'sns:ListSubscriptionsByTopic',
      ].sort(),
    )
    for (const statement of statements) {
      const action = array(statement.Action)[0]
      if (action === 'logs:DescribeLogGroups' || action === 'cloudtrail:DescribeTrails') {
        expect(array(statement.Action)).toEqual([action])
        expect(array(statement.Resource)).toEqual(['*'])
        continue
      }
      const resource = action.startsWith('cloudtrail:')
        ? monitoring.trail.trailArn
        : action.startsWith('logs:')
          ? monitoring.trailLogGroup.logGroupArn
          : monitoring.securityTopic.topicArn
      expect(array(statement.Resource)).toEqual([resolve(resource)])
    }
    const wildcardStatements = roleStatements(resolve(access.securityAuditorRole.roleName)).filter((statement) =>
      array(statement.Resource).includes('*'),
    )
    expect(wildcardStatements).toHaveLength(2)
    expect(wildcardStatements).toEqual(
      expect.arrayContaining([
        { Effect: 'Allow', Action: 'logs:DescribeLogGroups', Resource: '*' },
        { Effect: 'Allow', Action: 'cloudtrail:DescribeTrails', Resource: '*' },
      ]),
    )
  })

  it('limits CloudTrail bucket access and KMS use to this audit destination and trail', () => {
    const { template, vault, resolve, trailArn, logGroupArn } = fixture()
    const bucketStatements: Statement[] = Object.values(template.findResources('AWS::S3::BucketPolicy'))
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .filter((statement: Statement) => statement.Principal?.Service === 'cloudtrail.amazonaws.com')
    expect(bucketStatements).toHaveLength(2)
    for (const statement of bucketStatements) {
      expect(statement.Effect).toBe('Allow')
      expect(statement.Condition?.StringEquals?.['aws:SourceArn']).toEqual(resolve(trailArn))
      const actions = array(statement.Action)
      if (actions.includes('s3:GetBucketAcl')) {
        expect(array(statement.Resource)).toEqual([resolve(vault.auditBucket.bucketArn)])
      } else {
        expect(actions).toEqual(['s3:PutObject'])
        expect(array(statement.Resource)).toEqual([resolve(vault.auditBucket.arnForObjects('AWSLogs/111111111111/*'))])
        expect(statement.Condition?.StringEquals?.['s3:x-amz-acl']).toBe('bucket-owner-full-control')
      }
    }
    const keyReference = resolve(vault.auditKey.keyId) as { Ref: string }
    const keyStatements: Statement[] =
      template.findResources('AWS::KMS::Key')[keyReference.Ref].Properties.KeyPolicy.Statement
    const cloudtrailStatements = keyStatements.filter(
      (statement) => statement.Principal?.Service === 'cloudtrail.amazonaws.com',
    )
    expect(cloudtrailStatements).toHaveLength(3)
    expect(cloudtrailStatements.map((statement) => array(statement.Action)).sort()).toEqual(
      [['kms:Decrypt'], ['kms:DescribeKey'], ['kms:GenerateDataKey*']].sort(),
    )
    for (const statement of cloudtrailStatements) {
      expect(statement.Condition?.StringEquals?.['aws:SourceArn']).toEqual(resolve(trailArn))
      expect(
        array(statement.Action).every((action) =>
          ['kms:GenerateDataKey*', 'kms:DescribeKey', 'kms:Decrypt'].includes(action),
        ),
      ).toBe(true)
    }
    const dataKeyStatement = cloudtrailStatements.find((statement) =>
      array(statement.Action).includes('kms:GenerateDataKey*'),
    )!
    expect(dataKeyStatement.Condition?.StringLike?.['kms:EncryptionContext:aws:cloudtrail:arn']).toEqual(
      resolve(trailArn),
    )
    const decryptStatement = cloudtrailStatements.find((statement) => array(statement.Action).includes('kms:Decrypt'))!
    expect(decryptStatement).toEqual({
      Effect: 'Allow',
      Principal: { Service: 'cloudtrail.amazonaws.com' },
      Action: 'kms:Decrypt',
      Resource: '*',
      Condition: { StringEquals: { 'aws:SourceArn': resolve(trailArn) } },
    })
    const logsStatements = keyStatements.filter(
      (statement) => statement.Principal?.Service === 'logs.eu-central-1.amazonaws.com',
    )
    expect(logsStatements).toHaveLength(1)
    expect(logsStatements[0].Condition?.ArnEquals?.['kms:EncryptionContext:aws:logs:arn']).toEqual(resolve(logGroupArn))
    expect(keyStatements.filter((statement) => statement.Principal?.Service === 'events.amazonaws.com')).toEqual([])
    expect(keyStatements.filter((statement) => statement.Principal?.AWS === '*')).toEqual([])
  })

  it('uses a rule-scoped delivery role without granting the auditor publish or mutation', () => {
    const { template, rule, monitoring, vault, access, resolve, roleStatements, ruleArn } = fixture()
    const roleId = (rule.Properties.Targets[0].RoleArn as { 'Fn::GetAtt': [string, string] })['Fn::GetAtt'][0]
    const role = template.findResources('AWS::IAM::Role')[roleId]
    expect(role.Properties.AssumeRolePolicyDocument.Statement).toEqual([
      {
        Effect: 'Allow',
        Action: 'sts:AssumeRole',
        Principal: { Service: 'events.amazonaws.com' },
        Condition: {
          ArnEquals: { 'aws:SourceArn': resolve(ruleArn) },
          StringEquals: { 'aws:SourceAccount': '111111111111' },
        },
      },
    ])
    const delivery = roleStatements({ Ref: roleId })
    expect(delivery.flatMap((statement) => array(statement.Action)).sort()).toEqual([
      'kms:Decrypt',
      'kms:GenerateDataKey',
      'sns:Publish',
    ])
    for (const statement of delivery) {
      if (array(statement.Action).includes('sns:Publish')) {
        expect(array(statement.Resource)).toEqual([resolve(monitoring.securityTopic.topicArn)])
      } else {
        expect(array(statement.Resource)).toEqual([resolve(vault.auditKey.keyArn)])
        expect(statement.Condition?.StringEquals).toEqual({
          'kms:ViaService': 'sns.eu-central-1.amazonaws.com',
          'kms:EncryptionContext:aws:sns:topicArn': resolve(monitoring.securityTopic.topicArn),
        })
      }
    }
    const auditorActions = roleStatements(resolve(access.securityAuditorRole.roleName)).flatMap((statement) =>
      array(statement.Action),
    )
    expect(
      auditorActions.filter((action) =>
        /^(sns:Publish|.*:(Put|Delete|Create|Update|Set|Disable|Schedule))/.test(action),
      ),
    ).toEqual([])
    template.resourceCountIs('AWS::SNS::TopicPolicy', 0)
  })
})

function roleStatementsFor(template: Template, roleName: unknown): Statement[] {
  return Object.values(template.findResources('AWS::IAM::Policy'))
    .filter((policy) =>
      policy.Properties.Roles.some((name: unknown) => JSON.stringify(name) === JSON.stringify(roleName)),
    )
    .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
}

import {
  ArnFormat,
  Names,
  RemovalPolicy,
  Stack,
  aws_cloudtrail as cloudtrail,
  aws_events as events,
  aws_iam as iam,
  aws_kms as kms,
  aws_logs as logs,
  aws_s3 as s3,
  aws_sns as sns,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

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

  constructor(scope: Construct, id: string, props: Ops02AuditMonitoringProps) {
    super(scope, id)
    const stack = Stack.of(this)
    // EventBridge caps names at 64; reserve nine characters for '-security'.
    const resourceName = Names.uniqueResourceName(this, { maxLength: 55, separator: '-' })
    const trailName = `${resourceName}-trail`
    const ruleName = `${resourceName}-security`
    const logGroupName = `/motto-saas/ops02/${resourceName}/cloudtrail`
    // Explicit names let policies refer to resources without key/bucket cycles.
    const trailArn = stack.formatArn({ service: 'cloudtrail', resource: 'trail', resourceName: trailName })
    const ruleArn = stack.formatArn({ service: 'events', resource: 'rule', resourceName: ruleName })
    const logGroupArn = stack.formatArn({
      service: 'logs',
      resource: 'log-group',
      resourceName: logGroupName,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    })

    this.trailLogGroup = new logs.LogGroup(this, 'TrailLogGroup', {
      logGroupName,
      encryptionKey: props.auditKey,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    props.auditKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal(`logs.${stack.region}.amazonaws.com`)],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        resources: ['*'],
        conditions: { ArnEquals: { 'kms:EncryptionContext:aws:logs:arn': logGroupArn } },
      }),
    )
    props.auditKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['kms:GenerateDataKey*'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'aws:SourceArn': trailArn },
          StringLike: { 'kms:EncryptionContext:aws:cloudtrail:arn': trailArn },
        },
      }),
    )
    props.auditKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['kms:DescribeKey'],
        resources: ['*'],
        conditions: { StringEquals: { 'aws:SourceArn': trailArn } },
      }),
    )
    // Existing audit buckets use S3 Bucket Keys, which require CloudTrail to
    // decrypt during trail setup. Scope by SourceArn, not the data-key context.
    props.auditKey.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: { StringEquals: { 'aws:SourceArn': trailArn } },
      }),
    )

    // Trail's L2 automatically adds unconditioned service-principal bucket grants.
    // A name-only reference suppresses them; the supplied bucket receives only
    // the explicit trail-scoped policies below (no new bucket is created).
    const auditDestination = s3.Bucket.fromBucketAttributes(this, 'AuditDestination', {
      bucketName: props.auditBucket.bucketName,
      bucketArn: props.auditBucket.bucketArn,
    })
    this.trail = new cloudtrail.Trail(this, 'Trail', {
      trailName,
      bucket: auditDestination,
      encryptionKey: props.auditKey,
      isMultiRegionTrail: true,
      includeGlobalServiceEvents: true,
      enableFileValidation: true,
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: this.trailLogGroup,
      managementEvents: cloudtrail.ReadWriteType.ALL,
    })
    this.trail.addS3EventSelector([{ bucket: props.backupBucket, objectPrefix: 'backup-sets/' }], {
      includeManagementEvents: false,
      readWriteType: cloudtrail.ReadWriteType.ALL,
    })
    for (const statement of [
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['s3:GetBucketAcl'],
        resources: [props.auditBucket.bucketArn],
        conditions: { StringEquals: { 'aws:SourceArn': trailArn } },
      }),
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [props.auditBucket.arnForObjects(`AWSLogs/${stack.account}/*`)],
        conditions: {
          StringEquals: { 'aws:SourceArn': trailArn, 's3:x-amz-acl': 'bucket-owner-full-control' },
        },
      }),
    ]) {
      const policy = props.auditBucket.addToResourcePolicy(statement)
      if (!policy.statementAdded || !policy.policyDependable) {
        throw new Error('OPS-02 requires a mutable audit bucket policy for trail-scoped log delivery')
      }
      this.trail.node.addDependency(policy.policyDependable)
    }

    this.securityTopic = new sns.Topic(this, 'SecurityTopic', { masterKey: props.auditKey })
    const deliveryRole = new iam.Role(this, 'SecurityDeliveryRole', {
      assumedBy: new iam.ServicePrincipal('events.amazonaws.com', {
        conditions: {
          ArnEquals: { 'aws:SourceArn': ruleArn },
          StringEquals: { 'aws:SourceAccount': stack.account },
        },
      }),
    })
    deliveryRole.addToPrincipalPolicy(
      new iam.PolicyStatement({ actions: ['sns:Publish'], resources: [this.securityTopic.topicArn] }),
    )
    deliveryRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: [props.auditKey.keyArn],
        conditions: {
          StringEquals: {
            'kms:ViaService': `sns.${stack.region}.amazonaws.com`,
            'kms:EncryptionContext:aws:sns:topicArn': this.securityTopic.topicArn,
          },
        },
      }),
    )
    this.highRiskEventRule = new events.Rule(this, 'HighRiskEventRule', {
      ruleName,
      eventPattern: {
        source: ['aws.s3', 'aws.kms'],
        detailType: ['AWS API Call via CloudTrail'],
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
      },
      // Avoid grantPublish's broader automatic KMS grant; use the scoped role.
      targets: [
        {
          bind: () => ({ arn: this.securityTopic.topicArn, role: deliveryRole, targetResource: this.securityTopic }),
        },
      ],
    })

    // These discovery actions do not support resource-level authorization.
    // They expose configuration, not event contents or mutations; other auditor
    // permissions remain scoped to the exact trail, log group, or topic.
    props.securityAuditorRole.addToPrincipalPolicy(
      new iam.PolicyStatement({ actions: ['logs:DescribeLogGroups'], resources: ['*'] }),
    )
    props.securityAuditorRole.addToPrincipalPolicy(
      new iam.PolicyStatement({ actions: ['cloudtrail:DescribeTrails'], resources: ['*'] }),
    )
    for (const [actions, resource] of [
      [['cloudtrail:GetTrail', 'cloudtrail:GetTrailStatus', 'cloudtrail:GetEventSelectors'], this.trail.trailArn],
      [['logs:DescribeLogStreams', 'logs:GetLogEvents', 'logs:FilterLogEvents'], this.trailLogGroup.logGroupArn],
      [['sns:GetTopicAttributes', 'sns:ListSubscriptionsByTopic'], this.securityTopic.topicArn],
    ] as const) {
      props.securityAuditorRole.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: [...actions], resources: [resource] }),
      )
    }
  }
}

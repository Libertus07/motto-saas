import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { App, Stack } from 'aws-cdk-lib'
import { Template } from 'aws-cdk-lib/assertions'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Ops02AccessBoundary } from '../src/access-boundary.js'
import { Ops02AuditMonitoring } from '../src/audit-monitoring.js'
import { Ops02BackupVault } from '../src/backup-vault.js'
import { parseOps02FoundationConfig } from '../src/config.js'
import { Ops02FoundationStack } from '../src/ops02-foundation-stack.js'

const context = {
  stage: 'test',
  account: '111111111111',
  region: 'eu-central-1',
  securityPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Security',
  verificationPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Verification',
  recoveryPrincipalArn: 'arn:aws:iam::111111111111:role/Ops02Recovery',
}
const directories: string[] = []
const packageDirectory = fileURLToPath(new URL('../', import.meta.url))

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'ops02-foundation-'))
  directories.push(directory)
  return directory
}

afterAll(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const app = new App({ outdir: temporaryDirectory(), autoSynth: false })
  const config = parseOps02FoundationConfig(context)
  const stack = new Ops02FoundationStack(app, 'Ops02BackupFoundation-test', {
    config,
    env: { account: config.account, region: config.region },
    terminationProtection: true,
  })
  const template = Template.fromStack(stack)
  return { app, stack, template }
}

function runApp(input: Record<string, unknown>) {
  const outdir = temporaryDirectory()
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^(AWS_|CDK_|SUPABASE_)/i.test(key)),
  )
  Object.assign(env, {
    CDK_CONTEXT_JSON: JSON.stringify(input),
    CDK_OUTDIR: outdir,
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_CONFIG_FILE: join(outdir, 'absent-config'),
    AWS_SHARED_CREDENTIALS_FILE: join(outdir, 'absent-credentials'),
    // Synthetic environment distractors must never replace validated context.
    CDK_DEFAULT_ACCOUNT: '222222222222',
    CDK_DEFAULT_REGION: 'us-east-1',
  })
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'bin/ops02-backup.ts'], {
    cwd: packageDirectory,
    env,
    encoding: 'utf8',
    timeout: 10000,
  })
  return { result, outdir }
}

function array<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value]
}

type Statement = { Effect: string; Action: string | string[]; Resource?: unknown }

describe('OPS-02 foundation stack', () => {
  let appRun: ReturnType<typeof runApp>
  let invalidAppRun: ReturnType<typeof runApp>

  beforeAll(() => {
    appRun = runApp({ ...context, unapprovedContext: 'OPS02_PRIVATE_CANARY' })
    invalidAppRun = runApp({ ...context, account: undefined })
  })

  it('composes one deterministic foundation template without lookups', () => {
    const first = fixture()
    const second = fixture()
    expect(first.template.toJSON()).toEqual(second.template.toJSON())
    expect(first.stack.node.children.filter((child) => child instanceof Ops02BackupVault)).toHaveLength(1)
    expect(first.stack.node.children.filter((child) => child instanceof Ops02AccessBoundary)).toHaveLength(1)
    expect(first.stack.node.children.filter((child) => child instanceof Ops02AuditMonitoring)).toHaveLength(1)
    expect(
      first.stack.node.children
        .filter(
          (child) =>
            child instanceof Ops02BackupVault ||
            child instanceof Ops02AccessBoundary ||
            child instanceof Ops02AuditMonitoring,
        )
        .map((child) => child.constructor.name),
    ).toEqual(['Ops02BackupVault', 'Ops02AccessBoundary', 'Ops02AuditMonitoring'])
    expect(first.app.node.children.filter((child) => Stack.isStack(child))).toHaveLength(1)
    const assembly = first.app.synth()
    expect(assembly.stacks).toHaveLength(1)
    expect(assembly.manifest.missing ?? []).toEqual([])
    for (const [type, count] of Object.entries({
      'AWS::S3::Bucket': 2,
      'AWS::KMS::Key': 3,
      'AWS::SecretsManager::Secret': 2,
      'AWS::IAM::Role': 7,
      'AWS::CloudTrail::Trail': 1,
      'AWS::Logs::LogGroup': 1,
      'AWS::SNS::Topic': 1,
      'AWS::SNS::Subscription': 0,
      'AWS::Events::Rule': 1,
      'AWS::Lambda::Function': 0,
    })) {
      first.template.resourceCountIs(type, count)
    }
    expect(Object.keys(first.template.toJSON().Resources).filter((id) => id.startsWith('Custom'))).toEqual([])

    const { result, outdir } = appRun
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8'))
    const stacks = Object.values(manifest.artifacts) as { type: string; environment?: string; properties: object }[]
    expect(stacks.filter((artifact) => artifact.type === 'aws:cloudformation:stack')).toEqual([
      expect.objectContaining({ environment: 'aws://111111111111/eu-central-1' }),
    ])
    expect(manifest.missing ?? []).toEqual([])
    expect(existsSync(join(packageDirectory, 'cdk.context.json'))).toBe(false)
    const emitted = JSON.parse(readFileSync(join(outdir, 'Ops02BackupFoundation-test.template.json'), 'utf8'))
    expect(emitted).toEqual(first.template.toJSON())
    expect(JSON.stringify(emitted)).not.toContain('OPS02_PRIVATE_CANARY')

    const invalid = invalidAppRun
    expect(invalid.result.status).not.toBe(0)
    expect(invalid.result.stderr).toContain('account:')
    expect(existsSync(join(invalid.outdir, 'manifest.json'))).toBe(false)
  })

  it('applies required project, control, owner, stage, and managed-by tags', () => {
    const { template } = fixture()
    for (const type of [
      'AWS::S3::Bucket',
      'AWS::KMS::Key',
      'AWS::SecretsManager::Secret',
      'AWS::IAM::Role',
      'AWS::CloudTrail::Trail',
      'AWS::Logs::LogGroup',
      'AWS::SNS::Topic',
      'AWS::Events::Rule',
    ]) {
      const resources = Object.values(template.findResources(type))
      expect(resources.length).toBeGreaterThan(0)
      for (const resource of resources) {
        expect(resource.Properties.Tags).toEqual([
          { Key: 'Control', Value: 'OPS-02' },
          { Key: 'ManagedBy', Value: 'CDK' },
          { Key: 'Owner', Value: 'Motto SaaS platform owner' },
          { Key: 'Project', Value: 'MottoSaaS' },
          { Key: 'Stage', Value: 'test' },
        ])
      }
    }
  })

  it('exports only non-secret resource names and ARNs', () => {
    const { stack, template } = fixture()
    const vault = stack.node.children.find((child) => child instanceof Ops02BackupVault) as Ops02BackupVault
    const access = stack.node.children.find((child) => child instanceof Ops02AccessBoundary) as Ops02AccessBoundary
    const monitoring = stack.node.children.find(
      (child) => child instanceof Ops02AuditMonitoring,
    ) as Ops02AuditMonitoring
    const outputs = template.toJSON().Outputs
    expect(Object.keys(outputs).sort()).toEqual(
      [
        'BackupBucketName',
        'AuditBucketName',
        'BackupKeyArn',
        'AuditKeyArn',
        'BackupWriterRoleArn',
        'BackupVerifierRoleArn',
        'RestoreOperatorRoleArn',
        'KeyAdministratorRoleArn',
        'SecurityAuditorRoleArn',
        'SecurityTopicArn',
        'SourceCredentialSecretArn',
        'IdentityHmacSecretArn',
      ].sort(),
    )
    expect(outputs).toEqual(
      Object.fromEntries(
        Object.entries({
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
        }).map(([name, value]) => [name, { Value: stack.resolve(value) }]),
      ),
    )
    expect(JSON.stringify(outputs)).not.toMatch(
      /SecretString|PolicyDocument|bootstrapNonce|UNINITIALIZED|https?:|hmacValue/i,
    )
  })

  it('contains no plaintext secret, customer identifier, production project reference, or wildcard administrative policy', () => {
    const { template } = fixture()
    const json = JSON.stringify(template.toJSON())
    expect(json).not.toMatch(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|eyJ[A-Za-z0-9_-]+\.|supabase\.co|service_role/i)
    expect(json).not.toMatch(/customerId|tenantId|organizationId|projectRef|hmacValue|accessKeyId|secretAccessKey/i)
    expect(json.match(/\b\d{12}\b/g)?.every((account) => account === '111111111111')).toBe(true)
    expect(json).not.toContain('production')
    for (const secret of Object.values(template.findResources('AWS::SecretsManager::Secret'))) {
      expect(secret.Properties).not.toHaveProperty('SecretString')
      expect(JSON.parse(secret.Properties.GenerateSecretString.SecretStringTemplate)).toEqual({
        status: 'UNINITIALIZED',
      })
      expect(secret.Properties.GenerateSecretString.GenerateStringKey).toBe('bootstrapNonce')
    }
    // Attached KMS key-policy Resource='*' is not an identity-policy admin grant.
    const identityPolicies = Object.values(template.findResources('AWS::IAM::Policy'))
    expect(identityPolicies.length).toBeGreaterThan(0)
    for (const policy of identityPolicies) {
      for (const statement of policy.Properties.PolicyDocument.Statement as Statement[]) {
        if (statement.Effect !== 'Allow') continue
        const actions = array(statement.Action)
        expect(actions.some((action) => action.includes('*'))).toBe(false)
        if (array(statement.Resource).includes('*')) {
          expect(
            actions.every((action) => ['logs:DescribeLogGroups', 'cloudtrail:DescribeTrails'].includes(action)),
          ).toBe(true)
        }
        expect(actions).not.toContain('s3:DeleteObject')
        expect(actions).not.toContain('s3:DeleteObjectVersion')
        expect(actions).not.toContain('s3:BypassGovernanceRetention')
      }
    }
    for (const role of Object.values(template.findResources('AWS::IAM::Role'))) {
      expect(role.Properties.ManagedPolicyArns ?? []).toEqual([])
      expect(role.Properties.Policies ?? []).toEqual([])
    }
    template.resourceCountIs('AWS::IAM::ManagedPolicy', 0)
  })

  it('sets stack termination protection in the cloud assembly', () => {
    const { app, stack } = fixture()
    expect(stack.terminationProtection).toBe(true)
    expect(app.synth().getStackArtifact('Ops02BackupFoundation-test').terminationProtection).toBe(true)
    const { result, outdir } = appRun
    expect(result.status, result.stderr).toBe(0)
    const manifest = JSON.parse(readFileSync(join(outdir, 'manifest.json'), 'utf8'))
    expect(manifest.artifacts['Ops02BackupFoundation-test'].properties.terminationProtection).toBe(true)
  })
})

import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Reuse the YAML parser already locked by the root ESLint toolchain; no new dependency.
const yaml = createRequire(import.meta.url)('js-yaml') as {
  load: (source: string, options: { schema: unknown }) => unknown
  JSON_SCHEMA: unknown
}

interface WorkflowStep {
  name: string
  uses?: string
  run?: string
  with?: Record<string, string>
  env?: Record<string, string>
}

interface Workflow {
  name: string
  on: Record<string, { branches: string[]; paths: string[] }>
  permissions: Record<string, string>
  jobs: Record<string, { 'runs-on': string; 'timeout-minutes': number; steps: WorkflowStep[] }>
}

function readWorkflow() {
  const workflowPath = path.resolve('.github/workflows/ops02-infrastructure-ci.yml')
  expect(fs.existsSync(workflowPath), 'OPS-02 infrastructure workflow must exist').toBe(true)
  const source = fs.readFileSync(workflowPath, 'utf8')
  const workflow = yaml.load(source, { schema: yaml.JSON_SCHEMA }) as Workflow

  expect(Object.keys(workflow).sort()).toEqual(['jobs', 'name', 'on', 'permissions'])
  expect(Object.keys(workflow.jobs)).toEqual(['infrastructure'])
  const job = workflow.jobs.infrastructure
  expect(Object.keys(job).sort()).toEqual(['runs-on', 'steps', 'timeout-minutes'])
  expect(job['runs-on']).toBe('ubuntu-latest')
  expect(job['timeout-minutes']).toBe(20)
  expect(job.steps).toHaveLength(4)

  return { source, workflow, steps: job.steps }
}

const forbiddenTokens =
  /id-token\s*:|aws[-_]access[-_]key|aws[-_]secret[-_]access[-_]key|aws[-_]session[-_]token|configure-aws-credentials|web[-_]identity[-_]token|container[-_]credentials|\b(?:bootstrap|deploy|destroy)\b|supabase_|\.supabase\.co|\bsecrets\s*[.[]|\benvironment\s*:|https?:\/\/|\b(?:curl|wget)\b/i

function expectNoAuthorityOrLiveCalls(source: string) {
  expect(source).not.toMatch(forbiddenTokens)
}

describe('OPS-02 infrastructure workflow contract', () => {
  it('uses read-only repository permissions and pinned actions', () => {
    const { workflow, steps } = readWorkflow()
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(steps[0]).toEqual({
      name: 'Checkout repository',
      uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    })
    expect(steps[1].uses).toBe('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020')
    expect(Object.keys(steps[1]).sort()).toEqual(['name', 'uses', 'with'])
    const approvedCi = yaml.load(fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8'), {
      schema: yaml.JSON_SCHEMA,
    }) as Workflow
    expect(approvedCi.jobs['lint-and-test'].steps.slice(0, 2).map((step) => step.uses)).toEqual([
      steps[0].uses,
      steps[1].uses,
    ])
    for (const step of steps.filter((step) => step.uses)) {
      expect(step.uses).toMatch(/^actions\/(?:checkout|setup-node)@[a-f0-9]{40}$/)
    }
  })

  it('installs from the isolated package lock and runs the infrastructure check', () => {
    const { steps } = readWorkflow()
    expect(steps[1].with).toEqual({
      'node-version': '22.x',
      cache: 'npm',
      'cache-dependency-path': 'infra/ops02-backup/package-lock.json',
    })
    expect(steps.filter((step) => step.run).map((step) => step.run)).toEqual([
      'npm ci --prefix infra/ops02-backup',
      'npm run check --prefix infra/ops02-backup',
    ])
    expect(steps[2]).toEqual({
      name: 'Install infrastructure dependencies',
      run: 'npm ci --prefix infra/ops02-backup',
    })
    expect(steps[3]).toEqual({
      name: 'Check infrastructure offline',
      run: 'npm run check --prefix infra/ops02-backup',
      env: {
        AWS_EC2_METADATA_DISABLED: 'true',
        AWS_CONFIG_FILE: '${{ runner.temp }}/ops02-no-aws-config',
        AWS_SHARED_CREDENTIALS_FILE: '${{ runner.temp }}/ops02-no-aws-credentials',
        CDK_DISABLE_CLI_TELEMETRY: 'true',
        CDK_DISABLE_VERSION_CHECK: 'true',
        npm_config_offline: 'true',
      },
    })
    const cdk = JSON.parse(fs.readFileSync(path.resolve('infra/ops02-backup/cdk.json'), 'utf8'))
    expect(cdk).toMatchObject({
      lookups: false,
      notices: false,
      versionReporting: false,
      context: { 'cli-telemetry': false },
    })
  })

  it('contains no AWS credentials, OIDC, bootstrap, deploy, destroy, or production secrets', () => {
    const { source } = readWorkflow()
    const scripts = JSON.parse(fs.readFileSync(path.resolve('infra/ops02-backup/package.json'), 'utf8')).scripts
    expect(scripts.check).toBe('npm run format:check && npm run typecheck && npm run test && npm run synth:test')
    expectNoAuthorityOrLiveCalls(source)
    expectNoAuthorityOrLiveCalls(JSON.stringify(scripts))
    for (const token of [
      'Id-ToKeN: WrItE',
      'AwS-AcCeSs-KeY',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'CoNfIgUrE-AwS-CrEdEnTiAlS',
      'CdK DePlOy',
      'CDK BOOTSTRAP',
      'cDk DeStRoY',
      'SuPaBaSe_',
      '.SuPaBaSe.Co',
      '${{ SeCrEtS.TEST }}',
      'EnViRoNmEnT: production',
    ]) {
      expect(() => expectNoAuthorityOrLiveCalls(`${source}\n${token}`), token).toThrow()
    }
  })

  it('runs only for OPS-02 infrastructure and governing document changes', () => {
    const { workflow } = readWorkflow()
    expect(Object.keys(workflow.on).sort()).toEqual(['pull_request', 'push'])
    for (const event of ['pull_request', 'push']) {
      expect(workflow.on[event]).toEqual({
        branches: ['main', 'master'],
        paths: [
          'infra/ops02-backup/**',
          '.github/workflows/ops02-infrastructure-ci.yml',
          'scripts/ci/validate-ops02-infrastructure-workflow.test.ts',
          'docs/superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md',
          'docs/superpowers/plans/2026-10-06-ops-02-aws-backup-foundation.md',
        ],
      })
    }
  })
})

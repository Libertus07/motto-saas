import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const projectRef = 'zahdmrvhxsmqpeesrfkt'
const capturedAt = '2026-09-22T12:00:00.000Z'
const databaseUrl = `postgresql://postgres:database-secret@db.${projectRef}.supabase.co:5432/postgres`
const encodedKey = Buffer.alloc(32, 9).toString('base64')
const cliPath = path.resolve('scripts/security/create-storage-inventory.mjs')
let tempDirectory: string
let preloadPath: string

beforeAll(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'motto-storage-inventory-'))
  preloadPath = path.join(tempDirectory, 'mock-pg.mjs')
  const mockModule = `
export class Client {
  constructor(options) {
    if ('connectionString' in options) throw new Error('raw_connection_string_forbidden')
    if (!options.host || !options.port || !options.user || options.database !== 'postgres') {
      throw new Error('explicit_database_config_required')
    }
  }
  async connect() {}
  async end() {}
  async query(text) {
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] }
    if (text === 'SHOW transaction_isolation') return { rows: [{ transaction_isolation: 'repeatable read' }] }
    if (text.includes('FROM storage.buckets')) {
      if (process.env.OPS02_FAKE_MODE === 'adapter-failure') throw new Error(process.env.OPS02_DATABASE_URL)
      return { rows: [{ id: 'motto_assets', public: false, file_size_limit: 3145728, allowed_mime_types: ['application/pdf'] }] }
    }
    if (text.includes('FROM storage.objects')) return { rows: [{ bucket_id: 'motto_assets', name: 'org-secret/object-secret.pdf', size_bytes: '12', updated_at: '${capturedAt}' }] }
    if (text.includes('AS document_references')) return { rows: [{ source_table: 'investments', source_id: 'row-secret', organization_id: 'org-secret', document_url: 'storage://motto_assets/org-secret/object-secret.pdf' }] }
    return { rows: [] }
  }
}
`
  const dataUrl = `data:text/javascript,${encodeURIComponent(mockModule)}`
  fs.writeFileSync(
    preloadPath,
    `import { registerHooks } from 'node:module'\nregisterHooks({ resolve(specifier, context, nextResolve) { return specifier === 'pg' ? { shortCircuit: true, url: ${JSON.stringify(dataUrl)} } : nextResolve(specifier, context) } })\n`,
  )
})

afterAll(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true })
})

function baseEnvironment(outputFile = path.join(tempDirectory, 'manifest.json')) {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV,
    OPS02_DATABASE_URL: databaseUrl,
    OPS02_TARGET_PROJECT_REF: projectRef,
    OPS02_CAPTURED_AT_UTC: capturedAt,
    OPS02_INVENTORY_HMAC_KEY: encodedKey,
    OPS02_OUTPUT_FILE: outputFile,
  }
  return environment
}

function runCli(overrides: Record<string, string | undefined> = {}, mockPostgres = false) {
  const environment = baseEnvironment()
  if (mockPostgres) environment.NODE_OPTIONS = `--import=${pathToFileURL(preloadPath).href}`
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[name]
    else environment[name] = value
  }
  return spawnSync(process.execPath, [cliPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: environment,
  })
}

function parseFailure(result: ReturnType<typeof runCli>) {
  return JSON.parse(result.stderr.trim())
}

describe('OPS-02 storage inventory CLI', () => {
  it('returns a redacted failure when a required variable is missing', () => {
    const result = runCli({ OPS02_DATABASE_URL: undefined })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'required_value_missing' })
    expect(`${result.stdout}${result.stderr}`).not.toContain(databaseUrl)
  })

  it('rejects a different project before loading the database client', () => {
    const result = runCli({
      OPS02_TARGET_PROJECT_REF: 'differentproject0000',
      OPS02_DATABASE_URL: 'not-a-database-url',
    })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'target_project_mismatch' })
  })

  it.each([
    'postgresql://postgres:database-secret@db.differentproject0000.supabase.co:5432/postgres',
    'postgresql://postgres.differentproject0000:database-secret@aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
    'postgresql://postgres:database-secret@127.0.0.1:5432/postgres',
  ])('rejects a database endpoint that is not bound to the approved project: %s', (untrustedDatabaseUrl) => {
    const result = runCli({ OPS02_DATABASE_URL: untrustedDatabaseUrl })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'database_project_mismatch' })
    expect(`${result.stdout}${result.stderr}`).not.toContain(untrustedDatabaseUrl)
  })

  it.each([
    [`postgresql://postgres:database-secret@db.${projectRef}.supabase.co:5432/postgres`, 'direct-5432'],
    [`postgresql://postgres:database-secret@db.${projectRef}.supabase.co:6543/postgres`, 'dedicated-6543'],
    [
      `postgresql://inventory_reader.${projectRef}:database-secret@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
      'shared-5432',
    ],
    [
      `postgresql://inventory_reader.${projectRef}:database-secret@aws-1-eu-central-1.pooler.supabase.com:6543/postgres`,
      'shared-6543',
    ],
  ])('accepts an official approved-project endpoint: %s', (approvedDatabaseUrl, outputName) => {
    const outputFile = path.join(tempDirectory, `${outputName}.json`)
    const result = runCli(
      {
        OPS02_DATABASE_URL: approvedDatabaseUrl,
        OPS02_OUTPUT_FILE: outputFile,
      },
      true,
    )

    expect(result.status).toBe(0)
  })

  it.each(['host', 'port', 'user', 'password', 'dbname', 'database', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert'])(
    'rejects the database connection query override: %s',
    (parameter) => {
      const separator = parameter === 'host' ? '198.51.100.10' : 'override'
      const result = runCli({ OPS02_DATABASE_URL: `${databaseUrl}?${parameter}=${separator}` })

      expect(result.status).toBe(1)
      expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'database_url_overrides_forbidden' })
    },
  )

  it('rejects a database URL fragment before loading the database client', () => {
    const result = runCli({ OPS02_DATABASE_URL: `${databaseUrl}#redirected` })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'database_url_overrides_forbidden' })
  })

  const commonDirectory = path.resolve(
    execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(),
  )

  it.each([
    path.join(process.cwd(), 'unsafe-inventory.json'),
    path.join(path.dirname(commonDirectory), '.worktrees', 'unsafe-inventory.json'),
  ])('rejects output beneath a repository or linked worktree: %s', (outputFile) => {
    const result = runCli({ OPS02_OUTPUT_FILE: outputFile })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'unsafe_output_path' })
  })

  it.each(['not-base64', Buffer.alloc(31, 1).toString('base64')])('rejects invalid HMAC key material', (key) => {
    const result = runCli({ OPS02_INVENTORY_HMAC_KEY: key })

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'inventory_hmac_key_invalid' })
    expect(`${result.stdout}${result.stderr}`).not.toContain(key)
  })

  it('removes temporary output when the adapter fails', () => {
    const outputFile = path.join(tempDirectory, 'adapter-failure.json')
    const result = runCli({ OPS02_FAKE_MODE: 'adapter-failure', OPS02_OUTPUT_FILE: outputFile }, true)

    expect(result.status).toBe(1)
    expect(parseFailure(result)).toEqual({ status: 'FAIL', code: 'inventory_failed' })
    expect(fs.existsSync(outputFile)).toBe(false)
    expect(fs.readdirSync(tempDirectory).some((name) => name.startsWith('adapter-failure.json.tmp-'))).toBe(false)
    expect(`${result.stdout}${result.stderr}`).not.toContain(databaseUrl)
  })

  it('writes an atomic secret-free manifest and prints only redacted evidence', () => {
    const outputFile = path.join(tempDirectory, 'success.json')
    const result = runCli({ OPS02_OUTPUT_FILE: outputFile }, true)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const evidence = JSON.parse(result.stdout.trim())
    const bytes = fs.readFileSync(outputFile)
    expect(evidence).toEqual({
      status: 'PASS',
      schema_version: 'motto-saas-storage-inventory-v1',
      captured_at_utc: capturedAt,
      buckets: 1,
      objects: 1,
      references: 1,
      manifest_sha256: createHash('sha256').update(bytes).digest('hex'),
      output_file_name: 'success.json',
    })
    for (const secret of [databaseUrl, encodedKey, 'database-secret', 'org-secret', 'object-secret.pdf', outputFile]) {
      expect(`${result.stdout}${result.stderr}`).not.toContain(secret)
      expect(bytes.toString('utf8')).not.toContain(secret)
    }
  })

  it('keeps the package command and DPAPI wrappers on the dedicated OPS-02 contract', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
    const initializer = fs.readFileSync(path.resolve('scripts/security/Initialize-StorageInventoryKey.ps1'), 'utf8')
    const wrapper = fs.readFileSync(path.resolve('scripts/security/New-StorageInventory.ps1'), 'utf8')

    expect(packageJson.scripts['ops:storage-inventory']).toBe('node scripts/security/create-storage-inventory.mjs')
    expect(initializer).toContain('storage-inventory-hmac-key.dpapi')
    expect(initializer).toContain('DataProtectionScope]::CurrentUser')
    expect(initializer).toContain('Test-Path -LiteralPath $KeyPath')
    expect(wrapper).toContain('OPS02_DATABASE_URL')
    expect(wrapper).toContain('[string]$DatabaseUrl = $env:OPS02_DATABASE_URL')
    expect(wrapper).not.toContain('[Parameter(Mandatory)]\n    [string]$DatabaseUrl')
    expect(wrapper).toContain("SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')")
    expect(wrapper).toContain('[Array]::Clear($keyBytes, 0, $keyBytes.Length)')
  })
})

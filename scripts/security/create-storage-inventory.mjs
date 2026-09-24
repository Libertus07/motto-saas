import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, open, realpath, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { buildStorageInventory, createIdentityHasher } from './storage-inventory-contract.mjs'
import { collectStorageInventoryRows } from './storage-inventory-postgres.mjs'

const EXPECTED_PROJECT_REF = 'zahdmrvhxsmqpeesrfkt'
const REQUIRED_ENVIRONMENT = [
  'OPS02_DATABASE_URL',
  'OPS02_TARGET_PROJECT_REF',
  'OPS02_CAPTURED_AT_UTC',
  'OPS02_INVENTORY_HMAC_KEY',
  'OPS02_OUTPUT_FILE',
]
const SAFE_ERROR_CODES = new Set([
  'required_value_missing',
  'target_project_mismatch',
  'capture_time_invalid',
  'database_url_invalid',
  'database_project_mismatch',
  'inventory_hmac_key_invalid',
  'unsafe_output_path',
  'output_directory_unavailable',
  'output_file_exists',
])

class InventoryError extends Error {
  constructor(code) {
    super(code)
    this.name = 'InventoryError'
  }
}

function fail(code) {
  throw new InventoryError(code)
}

function readRequiredEnvironment(environment) {
  const values = {}
  for (const name of REQUIRED_ENVIRONMENT) {
    const value = environment[name]?.trim()
    if (!value) fail('required_value_missing')
    values[name] = value
  }
  return values
}

function validateCapturedAt(value) {
  const milliseconds = Date.parse(value)
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail('capture_time_invalid')
  }
}

function decodeInventoryKey(encodedKey) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(encodedKey) || encodedKey.length % 4 !== 0) {
    fail('inventory_hmac_key_invalid')
  }
  const key = Buffer.from(encodedKey, 'base64')
  const canonicalInput = encodedKey.replace(/=+$/u, '')
  const canonicalKey = key.toString('base64').replace(/=+$/u, '')
  if (key.length < 32 || canonicalInput !== canonicalKey) {
    key.fill(0)
    fail('inventory_hmac_key_invalid')
  }
  return key
}

function validateDatabaseUrl(value) {
  let databaseUrl
  try {
    databaseUrl = new URL(value)
  } catch {
    fail('database_url_invalid')
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) fail('database_url_invalid')

  const directHost = `db.${EXPECTED_PROJECT_REF}.supabase.co`
  const port = databaseUrl.port || '5432'
  const supportedPort = port === '5432' || port === '6543'
  const directConnection = databaseUrl.hostname === directHost
  const poolerConnection =
    /^[a-z0-9-]+[.]pooler[.]supabase[.]com$/u.test(databaseUrl.hostname) &&
    databaseUrl.username.endsWith(`.${EXPECTED_PROJECT_REF}`)

  if (!supportedPort || databaseUrl.pathname !== '/postgres' || (!directConnection && !poolerConnection)) {
    fail('database_project_mismatch')
  }
}

function gitOutput(args) {
  return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

async function getProtectedRepositoryRoots() {
  const commonDirectory = path.resolve(process.cwd(), gitOutput(['rev-parse', '--git-common-dir']))
  const repositoryRoot = path.dirname(commonDirectory)
  const worktrees = gitOutput(['worktree', 'list', '--porcelain'])
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
  const roots = await Promise.all([repositoryRoot, ...worktrees].map((root) => realpath(root)))
  return [...new Set(roots.map((root) => path.resolve(root)))]
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function resolveSafeOutput(rawOutput) {
  const requestedOutput = path.resolve(rawOutput)
  const parent = path.dirname(requestedOutput)
  let parentStats
  let resolvedParent
  try {
    ;[parentStats, resolvedParent] = await Promise.all([stat(parent), realpath(parent)])
  } catch {
    fail('output_directory_unavailable')
  }
  if (!parentStats.isDirectory()) fail('output_directory_unavailable')

  const resolvedOutput = path.join(resolvedParent, path.basename(requestedOutput))
  const protectedRoots = await getProtectedRepositoryRoots()
  if (protectedRoots.some((root) => isWithin(root, resolvedOutput))) fail('unsafe_output_path')

  try {
    await access(resolvedOutput)
    fail('output_file_exists')
  } catch (error) {
    if (error instanceof InventoryError) throw error
    if (error?.code !== 'ENOENT') fail('output_file_exists')
  }
  return resolvedOutput
}

async function writeManifestAtomically(outputFile, bytes) {
  const temporaryFile = `${outputFile}.tmp-${process.pid}`
  let fileHandle
  try {
    fileHandle = await open(temporaryFile, 'wx', 0o600)
    await fileHandle.writeFile(bytes)
    await fileHandle.sync()
    await fileHandle.close()
    fileHandle = undefined
    await rename(temporaryFile, outputFile)
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => undefined)
    await unlink(temporaryFile).catch(() => undefined)
    throw error
  }
}

export async function createStorageInventory(environment = process.env) {
  let client
  let key
  let temporaryOutput
  try {
    const values = readRequiredEnvironment(environment)
    if (values.OPS02_TARGET_PROJECT_REF !== EXPECTED_PROJECT_REF) fail('target_project_mismatch')
    validateCapturedAt(values.OPS02_CAPTURED_AT_UTC)
    validateDatabaseUrl(values.OPS02_DATABASE_URL)
    key = decodeInventoryKey(values.OPS02_INVENTORY_HMAC_KEY)
    const outputFile = await resolveSafeOutput(values.OPS02_OUTPUT_FILE)
    temporaryOutput = `${outputFile}.tmp-${process.pid}`

    const pg = await import('pg')
    const Client = pg.Client ?? pg.default?.Client
    if (typeof Client !== 'function') throw new Error('inventory_postgres_client_unavailable')
    client = new Client({
      connectionString: values.OPS02_DATABASE_URL,
      application_name: 'motto-saas-ops02-readonly-inventory',
      connectionTimeoutMillis: 10_000,
    })
    await client.connect()
    const rows = await collectStorageInventoryRows(client, { pageSize: 1000 })
    const manifest = buildStorageInventory({
      projectRef: values.OPS02_TARGET_PROJECT_REF,
      capturedAt: values.OPS02_CAPTURED_AT_UTC,
      ...rows,
      hashIdentity: createIdentityHasher(key),
    })
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await writeManifestAtomically(outputFile, bytes)

    return {
      status: 'PASS',
      schema_version: manifest.schema_version,
      captured_at_utc: manifest.captured_at_utc,
      buckets: manifest.totals.buckets,
      objects: manifest.totals.objects,
      references: manifest.totals.references,
      manifest_sha256: createHash('sha256').update(bytes).digest('hex'),
      output_file_name: path.basename(outputFile),
    }
  } finally {
    if (client) await client.end().catch(() => undefined)
    if (key) key.fill(0)
    if (temporaryOutput) await unlink(temporaryOutput).catch(() => undefined)
  }
}

async function main() {
  try {
    const evidence = await createStorageInventory()
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
  } catch (error) {
    const code =
      error instanceof InventoryError && SAFE_ERROR_CODES.has(error.message) ? error.message : 'inventory_failed'
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code })}\n`)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url || fileURLToPath(import.meta.url) === process.argv[1]) await main()

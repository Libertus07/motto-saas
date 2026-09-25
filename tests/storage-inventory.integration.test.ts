import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildStorageInventory, createIdentityHasher } from '../scripts/security/storage-inventory-contract.mjs'
import { collectStorageInventoryRows } from '../scripts/security/storage-inventory-postgres.mjs'

interface PgClientLike {
  connect(): Promise<void>
  end(): Promise<void>
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

const { Client } = createRequire(import.meta.url)('pg') as {
  Client: new (options: Record<string, unknown>) => PgClientLike
}

const requiredEnvironment = ['TEST_DATABASE_URL', 'TEST_SUPABASE_URL', 'TEST_SUPABASE_SERVICE_ROLE_KEY'] as const
const integrationEnabled =
  process.env.RUN_OPS02_STORAGE_INTEGRATION === 'true' &&
  requiredEnvironment.every((name) => Boolean(process.env[name]))
const describeIntegration = integrationEnabled ? describe : describe.skip

function requireEnvironment(name: (typeof requiredEnvironment)[number]) {
  const value = process.env[name]
  if (!value) throw new Error(`OPS-02 local integration requires ${name}.`)
  return value
}

function assertLocalEndpoint(value: string, kind: 'database' | 'api') {
  const endpoint = new URL(value)
  if (!['127.0.0.1', 'localhost'].includes(endpoint.hostname)) {
    throw new Error(`OPS-02 integration refuses a non-local ${kind} endpoint.`)
  }
  if (kind === 'api' && endpoint.protocol !== 'http:') {
    throw new Error('OPS-02 integration expects the local HTTP API endpoint.')
  }
  if (kind === 'database' && !['postgres:', 'postgresql:'].includes(endpoint.protocol)) {
    throw new Error('OPS-02 integration expects a PostgreSQL database endpoint.')
  }
  if (endpoint.search !== '' || endpoint.hash !== '') {
    throw new Error(`OPS-02 integration rejects ${kind} endpoint overrides.`)
  }
}

function createLocalDatabaseConfig(value: string) {
  assertLocalEndpoint(value, 'database')
  const endpoint = new URL(value)
  return {
    host: endpoint.hostname,
    port: Number(endpoint.port || '5432'),
    user: decodeURIComponent(endpoint.username),
    password: decodeURIComponent(endpoint.password),
    database: decodeURIComponent(endpoint.pathname.slice(1)),
    ssl: false,
  }
}

describe('OPS-02 local endpoint guard', () => {
  it.each([
    ['postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=198.51.100.10', 'database'],
    ['postgresql://postgres:postgres@localhost:54322/postgres?sslmode=require', 'database'],
    ['http://127.0.0.1:54321?redirect=https://example.com', 'api'],
  ] as const)('rejects connection-routing overrides before local integration: %s', (value, kind) => {
    expect(() => assertLocalEndpoint(value, kind)).toThrow('endpoint overrides')
  })
})

describeIntegration('OPS-02 local storage inventory integration', () => {
  const organizationId = randomUUID()
  const referencedObjectPath = `${organizationId}/investment-document/${randomUUID()}.pdf`
  const unreferencedObjectPath = `${organizationId}/investment-document/${randomUUID()}.pdf`
  const missingObjectPath = `${organizationId}/investment-document/${randomUUID()}.pdf`
  const concurrentObjectPath = `${organizationId}/zz-concurrent/${randomUUID()}.pdf`
  const referencedInvestmentId = randomUUID()
  const missingInvestmentId = randomUUID()
  const slug = `ops02-${organizationId}`
  const databaseUrl = integrationEnabled ? requireEnvironment('TEST_DATABASE_URL') : ''
  const supabaseUrl = integrationEnabled ? requireEnvironment('TEST_SUPABASE_URL') : ''
  const serviceRoleKey = integrationEnabled ? requireEnvironment('TEST_SUPABASE_SERVICE_ROLE_KEY') : ''
  let adminClient: PgClientLike
  let collectorClient: PgClientLike
  let storageClient: SupabaseClient

  beforeAll(async () => {
    assertLocalEndpoint(databaseUrl, 'database')
    assertLocalEndpoint(supabaseUrl, 'api')

    const localDatabaseConfig = createLocalDatabaseConfig(databaseUrl)
    adminClient = new Client({ ...localDatabaseConfig, application_name: 'motto-saas-ops02-integration-setup' })
    collectorClient = new Client({
      ...localDatabaseConfig,
      application_name: 'motto-saas-ops02-integration-collector',
    })
    storageClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await adminClient.connect()
    await collectorClient.connect()

    await adminClient.query('INSERT INTO public.organizations (id, name, slug) VALUES ($1, $2, $3)', [
      organizationId,
      'OPS-02 local integration organization',
      slug,
    ])

    for (const objectPath of [referencedObjectPath, unreferencedObjectPath]) {
      const { error } = await storageClient.storage
        .from('motto_assets')
        .upload(objectPath, Buffer.from(`OPS-02 fixture ${objectPath}`), {
          contentType: 'application/pdf',
          upsert: false,
        })
      if (error) throw new Error(`Local Storage fixture upload failed: ${error.message}`)
    }

    await adminClient.query(
      `
        INSERT INTO public.investments (
          id, asset_type, name, quantity, average_cost, current_manual_value,
          purchase_date, document_url, organization_id
        )
        VALUES
          ($1, 'test', 'OPS-02 referenced fixture', 1, 1, 1, CURRENT_DATE, $2, $3),
          ($4, 'test', 'OPS-02 missing fixture', 1, 1, 1, CURRENT_DATE, $5, $3)
      `,
      [
        referencedInvestmentId,
        `storage://motto_assets/${referencedObjectPath}`,
        organizationId,
        missingInvestmentId,
        `storage://motto_assets/${missingObjectPath}`,
      ],
    )
  }, 30_000)

  afterAll(async () => {
    const cleanupErrors: unknown[] = []
    if (storageClient) {
      try {
        const { error } = await storageClient.storage
          .from('motto_assets')
          .remove([referencedObjectPath, unreferencedObjectPath, concurrentObjectPath])
        if (error) cleanupErrors.push(new Error(`Local Storage fixture cleanup failed: ${error.message}`))
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (adminClient) {
      try {
        await adminClient.query('DELETE FROM public.investments WHERE id = ANY($1::uuid[])', [
          [referencedInvestmentId, missingInvestmentId],
        ])
        await adminClient.query('DELETE FROM public.organizations WHERE id = $1', [organizationId])
      } catch (error) {
        cleanupErrors.push(error)
      } finally {
        await adminClient.end().catch((error) => cleanupErrors.push(error))
      }
    }
    if (collectorClient) await collectorClient.end().catch((error) => cleanupErrors.push(error))
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'OPS-02 integration cleanup failed.')
  }, 30_000)

  it('proves read-only collection and pseudonymous reconciliation against local Storage', async () => {
    let observedReadOnly: string | undefined
    let observedIsolation: string | undefined
    let concurrentObjectUploaded = false
    const observingClient = {
      query: async (text: string, values?: unknown[]) => {
        const result = await collectorClient.query(text, values)
        if (text === 'SHOW transaction_read_only') {
          const readOnly = result.rows[0]?.transaction_read_only
          observedReadOnly = typeof readOnly === 'string' ? readOnly : undefined
        }
        if (text === 'SHOW transaction_isolation') {
          const isolation = result.rows[0]?.transaction_isolation
          observedIsolation = typeof isolation === 'string' ? isolation : undefined
        }
        if (text.includes('FROM storage.buckets') && !concurrentObjectUploaded) {
          const { error } = await storageClient.storage
            .from('motto_assets')
            .upload(concurrentObjectPath, Buffer.from('OPS-02 concurrent fixture'), {
              contentType: 'application/pdf',
              upsert: false,
            })
          if (error) throw new Error(`Concurrent local Storage fixture upload failed: ${error.message}`)
          concurrentObjectUploaded = true
        }
        return result
      },
    }

    const rows = await collectStorageInventoryRows(observingClient, { pageSize: 2 })
    const hashIdentity = createIdentityHasher(Buffer.alloc(32, 4))
    const manifest = buildStorageInventory({
      projectRef: 'zahdmrvhxsmqpeesrfkt',
      capturedAt: '2026-09-22T12:00:00.000Z',
      ...rows,
      hashIdentity,
    })
    const referencedId = hashIdentity('motto_assets', referencedObjectPath)
    const unreferencedId = hashIdentity('motto_assets', unreferencedObjectPath)
    const missingId = hashIdentity('motto_assets', missingObjectPath)
    const concurrentId = hashIdentity('motto_assets', concurrentObjectPath)

    expect(observedReadOnly).toBe('on')
    expect(observedIsolation).toBe('repeatable read')
    expect(manifest.buckets).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'motto_assets' })]))
    expect(manifest.object_ids).toContain(referencedId)
    expect(manifest.object_ids).toContain(unreferencedId)
    expect(manifest.referenced_missing_object_ids).toContain(missingId)
    expect(manifest.unreferenced_object_ids).toContain(unreferencedId)
    expect(manifest.unreferenced_object_ids).not.toContain(referencedId)
    expect(manifest.object_ids).not.toContain(concurrentId)

    const serialized = JSON.stringify(manifest)
    expect(serialized).not.toContain(organizationId)
    expect(serialized).not.toContain(referencedObjectPath)
    expect(serialized).not.toContain(unreferencedObjectPath)
    expect(serialized).not.toContain(missingObjectPath)
  }, 30_000)
})

import { describe, expect, it } from 'vitest'

import { collectStorageInventoryRows } from './storage-inventory-postgres.mjs'

interface QueryCall {
  text: string
  values?: unknown[]
}

class ScriptedClient {
  calls: QueryCall[] = []
  readonly readOnly: string
  readonly isolation: string
  readonly failOnObjects: boolean

  constructor({ readOnly = 'on', isolation = 'repeatable read', failOnObjects = false } = {}) {
    this.readOnly = readOnly
    this.isolation = isolation
    this.failOnObjects = failOnObjects
  }

  get sql() {
    return this.calls.map(({ text }) => text)
  }

  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values })
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: this.readOnly }] }
    if (text === 'SHOW transaction_isolation') return { rows: [{ transaction_isolation: this.isolation }] }
    if (text.includes('FROM storage.buckets')) {
      return {
        rows: [{ id: 'motto_assets', public: false, file_size_limit: 3145728, allowed_mime_types: null }],
      }
    }
    if (text.includes('FROM storage.objects')) {
      if (this.failOnObjects) throw new Error('database_unavailable')
      if (values?.[0] === null) {
        return {
          rows: [
            { bucket_id: 'motto_assets', name: 'a.pdf', size_bytes: '1', updated_at: '2026-09-22T10:00:00.000Z' },
            { bucket_id: 'motto_assets', name: 'b.pdf', size_bytes: '2', updated_at: '2026-09-22T10:00:00.000Z' },
          ],
        }
      }
      if (values?.[0] === 'motto_assets' && values?.[1] === 'b.pdf') {
        return {
          rows: [{ bucket_id: 'receipts', name: 'c.pdf', size_bytes: '3', updated_at: '2026-09-22T10:00:00.000Z' }],
        }
      }
      return { rows: [] }
    }
    if (text.includes('AS document_references')) {
      if (values?.[0] === null) {
        return {
          rows: [
            {
              source_table: 'investment_transactions',
              source_id: '1',
              organization_id: 'org-a',
              document_url: 'storage://motto_assets/a.pdf',
            },
            {
              source_table: 'investments',
              source_id: '2',
              organization_id: 'org-a',
              document_url: 'storage://motto_assets/b.pdf',
            },
          ],
        }
      }
      if (values?.[0] === 'investments' && values?.[1] === '2') {
        return {
          rows: [
            {
              source_table: 'stock_movements',
              source_id: '3',
              organization_id: 'org-b',
              document_url: 'storage://receipts/c.pdf',
            },
          ],
        }
      }
      return { rows: [] }
    }
    return { rows: [] }
  }
}

describe('OPS-02 read-only PostgreSQL inventory adapter', () => {
  it('verifies read-only mode and exhausts object and reference keyset pages', async () => {
    const client = new ScriptedClient()

    const result = await collectStorageInventoryRows(client, { pageSize: 2 })

    expect(client.sql[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(client.sql[1]).toContain("SET LOCAL statement_timeout = '30s'")
    expect(client.sql[2]).toBe('SHOW transaction_read_only')
    expect(client.sql[3]).toBe('SHOW transaction_isolation')
    expect(result.objects.map((row) => `${row.bucket_id}/${row.name}`)).toEqual([
      'motto_assets/a.pdf',
      'motto_assets/b.pdf',
      'receipts/c.pdf',
    ])
    expect(result.references.map((row) => `${row.source_table}/${row.source_id}`)).toEqual([
      'investment_transactions/1',
      'investments/2',
      'stock_movements/3',
    ])
    expect(client.calls.filter(({ text }) => text.includes('FROM storage.objects'))).toHaveLength(2)
    expect(client.calls.filter(({ text }) => text.includes('AS document_references'))).toHaveLength(2)
    expect(client.sql.some((sql) => /\bOFFSET\b/iu.test(sql))).toBe(false)
    expect(client.sql.at(-1)).toBe('COMMIT')
  })

  it('rolls back before inventory queries when the transaction is not read-only', async () => {
    const client = new ScriptedClient({ readOnly: 'off' })

    await expect(collectStorageInventoryRows(client, { pageSize: 2 })).rejects.toThrow('read_only_transaction_required')

    expect(client.sql).toEqual([
      'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
      "SET LOCAL statement_timeout = '30s'",
      'SHOW transaction_read_only',
      'ROLLBACK',
    ])
  })

  it('rolls back before inventory queries when the transaction is not repeatable read', async () => {
    const client = new ScriptedClient({ isolation: 'read committed' })

    await expect(collectStorageInventoryRows(client, { pageSize: 2 })).rejects.toThrow(
      'repeatable_read_transaction_required',
    )

    expect(client.sql.at(-1)).toBe('ROLLBACK')
    expect(client.sql.some((sql) => sql.includes('FROM storage.buckets'))).toBe(false)
  })

  it('rolls back when an inventory query fails', async () => {
    const client = new ScriptedClient({ failOnObjects: true })

    await expect(collectStorageInventoryRows(client, { pageSize: 2 })).rejects.toThrow('database_unavailable')

    expect(client.sql.at(-1)).toBe('ROLLBACK')
    expect(client.sql).not.toContain('COMMIT')
  })

  it.each([0, -1, 1.5, 5001, Number.NaN])(
    'rejects an unsafe page size before opening a transaction: %s',
    async (pageSize) => {
      const client = new ScriptedClient()

      await expect(collectStorageInventoryRows(client, { pageSize })).rejects.toThrow('inventory_page_size_invalid')
      expect(client.calls).toHaveLength(0)
    },
  )
})

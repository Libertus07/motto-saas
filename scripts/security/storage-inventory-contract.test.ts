import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { buildStorageInventory, createIdentityHasher, parseStorageReference } from './storage-inventory-contract.mjs'

const projectRef = 'zahdmrvhxsmqpeesrfkt'
const capturedAt = '2026-09-22T12:00:00.000Z'
const key = Buffer.alloc(32, 7)

function objectId(bucket: string, objectPath: string) {
  return createHmac('sha256', key).update(`${bucket}\u0000${objectPath}`).digest('hex')
}

function build(overrides: Record<string, unknown> = {}) {
  return buildStorageInventory({
    projectRef,
    capturedAt,
    hashIdentity: createIdentityHasher(key),
    buckets: [],
    objects: [],
    references: [],
    ...overrides,
  })
}

describe('OPS-02 storage inventory contract', () => {
  it.each([
    'storage://motto_assets/../secret.pdf',
    'storage://motto_assets/a//b.pdf',
    'storage://motto_assets/a%2F..%2Fsecret.pdf',
    'storage://motto_assets/a%252F..%252Fsecret.pdf',
    'storage://motto_assets/a\\b.pdf',
    'storage://motto_assets/',
    'https://example.com/file.pdf',
  ])('rejects an unsafe durable reference without echoing it: %s', (value) => {
    expect(parseStorageReference(value)).toEqual({ status: 'invalid' })
  })

  it('parses a canonical storage reference', () => {
    expect(parseStorageReference('storage://motto_assets/org-a/investment-document/a.pdf')).toEqual({
      status: 'storage',
      bucket: 'motto_assets',
      path: 'org-a/investment-document/a.pdf',
    })
  })

  it('builds stable deduplicated reconciliation counts and pseudonymous identities', () => {
    const expectedId = objectId('motto_assets', 'org-a/investment-document/a.pdf')
    const manifest = build({
      buckets: [
        { id: 'motto_assets', public: false, file_size_limit: 3145728, allowed_mime_types: ['application/pdf'] },
      ],
      objects: [
        {
          bucket_id: 'motto_assets',
          name: 'org-a/investment-document/a.pdf',
          size_bytes: 12,
          updated_at: '2026-09-22T11:00:00.000Z',
        },
        {
          bucket_id: 'motto_assets',
          name: 'org-a/investment-document/a.pdf',
          size_bytes: 12,
          updated_at: '2026-09-22T11:00:00.000Z',
        },
      ],
      references: [
        {
          source_table: 'investments',
          source_id: 'row-1',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/org-a/investment-document/a.pdf',
        },
        {
          source_table: 'investments',
          source_id: 'row-1',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/org-a/investment-document/a.pdf',
        },
      ],
    })

    expect(manifest).toMatchObject({
      schema_version: 'motto-saas-storage-inventory-v1',
      project_ref: projectRef,
      captured_at_utc: capturedAt,
      physical_bytes_verified: false,
      totals: {
        buckets: 1,
        objects: 1,
        references: 1,
        referenced_missing_objects: 0,
        unreferenced_objects: 0,
        invalid_references: 0,
        legacy_data_references: 0,
        legacy_public_references: 0,
        conflicting_object_rows: 0,
      },
      referenced_missing_object_ids: [],
      unreferenced_object_ids: [],
    })
    expect(manifest.object_ids).toEqual([expectedId])
    expect(JSON.stringify(manifest)).not.toContain('org-a')
    expect(JSON.stringify(manifest)).not.toContain('a.pdf')
    expect(JSON.stringify(manifest)).not.toContain('row-1')
  })

  it('reports conflicting duplicate object metadata without leaking its identity', () => {
    const manifest = build({
      objects: [
        { bucket_id: 'receipts', name: 'org-a/z-report/a.pdf', size_bytes: 12, updated_at: capturedAt },
        { bucket_id: 'receipts', name: 'org-a/z-report/a.pdf', size_bytes: 13, updated_at: capturedAt },
      ],
    })

    expect(manifest.totals).toMatchObject({ objects: 1, conflicting_object_rows: 1 })
    expect(manifest.conflicting_object_ids).toEqual([objectId('receipts', 'org-a/z-report/a.pdf')])
    expect(JSON.stringify(manifest)).not.toContain('org-a')
  })

  it('separates missing, unreferenced, data, public URL, and invalid references', () => {
    const manifest = build({
      objects: [
        { bucket_id: 'motto_assets', name: 'org-a/orphan.pdf', size_bytes: 9, updated_at: capturedAt },
        { bucket_id: 'receipts', name: 'org-a/public.pdf', size_bytes: 10, updated_at: capturedAt },
      ],
      references: [
        {
          source_table: 'investments',
          source_id: 'missing',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/org-a/missing.pdf',
        },
        {
          source_table: 'z_reports',
          source_id: 'public',
          organization_id: 'org-a',
          document_url:
            'https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/public/receipts/org-a/public.pdf?download=1',
        },
        {
          source_table: 'supplier_transactions',
          source_id: 'data',
          organization_id: 'org-a',
          document_url: 'data:application/pdf;base64,cGRm',
        },
        {
          source_table: 'investments',
          source_id: 'invalid',
          organization_id: 'org-a',
          document_url: 'https://example.com/file.pdf',
        },
      ],
    })

    expect(manifest.totals).toMatchObject({
      references: 4,
      referenced_missing_objects: 1,
      unreferenced_objects: 1,
      invalid_references: 1,
      legacy_data_references: 1,
      legacy_public_references: 1,
    })
    expect(manifest.referenced_missing_object_ids).toEqual([objectId('motto_assets', 'org-a/missing.pdf')])
    expect(manifest.unreferenced_object_ids).toEqual([objectId('motto_assets', 'org-a/orphan.pdf')])
  })

  it.each([
    'https://attacker.example/storage/v1/object/public/receipts/org-a/public.pdf',
    'https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/public/receipts/org-a/../secret.pdf',
    'https://zahdmrvhxsmqpeesrfkt.supabase.co/storage/v1/object/public/receipts/org-a/%2e%2e/secret.pdf',
  ])('does not reconcile an untrusted or traversal-bearing legacy URL: %s', (documentUrl) => {
    const manifest = build({
      references: [
        {
          source_table: 'investments',
          source_id: 'legacy-invalid',
          organization_id: 'org-a',
          document_url: documentUrl,
        },
      ],
    })

    expect(manifest.totals).toMatchObject({ invalid_references: 1, legacy_public_references: 0 })
    expect(manifest.referenced_missing_object_ids).toEqual([])
  })

  it('produces byte-stable output when input order changes', () => {
    const rows = {
      buckets: [
        { id: 'receipts', public: false, file_size_limit: null, allowed_mime_types: null },
        { id: 'motto_assets', public: false, file_size_limit: 3145728, allowed_mime_types: ['image/png'] },
      ],
      objects: [
        { bucket_id: 'receipts', name: 'b.pdf', size_bytes: 2, updated_at: capturedAt },
        { bucket_id: 'motto_assets', name: 'a.pdf', size_bytes: 1, updated_at: capturedAt },
      ],
      references: [
        {
          source_table: 'z_reports',
          source_id: 'b',
          organization_id: 'org-b',
          document_url: 'storage://receipts/b.pdf',
        },
        {
          source_table: 'investments',
          source_id: 'a',
          organization_id: 'org-a',
          document_url: 'storage://motto_assets/a.pdf',
        },
      ],
    }

    const forward = build(rows)
    const reversed = build({
      buckets: [...rows.buckets].reverse(),
      objects: [...rows.objects].reverse(),
      references: [...rows.references].reverse(),
    })

    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward))
  })

  it('fails closed for an unexpected project or non-canonical timestamp', () => {
    expect(() => build({ projectRef: 'anotherprojectref0000' })).toThrow('inventory_project_ref_invalid')
    expect(() => build({ capturedAt: '2026-09-22' })).toThrow('inventory_capture_time_invalid')
  })

  it('requires at least 32 bytes of HMAC key material', () => {
    expect(() => createIdentityHasher(Buffer.alloc(31))).toThrow('inventory_hmac_key_invalid')
  })
})

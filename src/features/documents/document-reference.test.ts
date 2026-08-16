import { describe, expect, it, vi } from 'vitest'

import {
  buildOrganizationDocumentPath,
  parseLegacyPublicStorageUrl,
  parseStorageDocumentReference,
  serializeStorageDocumentReference,
  validateOrganizationDocument,
} from './document-reference'

const organizationId = '11111111-1111-4111-8111-111111111111'
const threeMiB = 3 * 1024 * 1024
const tenMiB = 10 * 1024 * 1024

function createFile(type: string, size = 1) {
  return new File([new Uint8Array(size)], 'upload.bin', { type })
}

describe('private document references', () => {
  it.each([
    ['application/xml', 'xml'],
    ['text/xml', 'xml'],
    ['application/json', 'json'],
    ['application/vnd.ms-excel', 'xls'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
  ])('accepts structured supplier receipts with a MIME-derived %s path', (mimeType, extension) => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
    const input = {
      organizationId,
      bucket: 'motto_assets' as const,
      kind: 'supplier-receipt' as const,
      file: new File(['content'], `unsafe.exe`, { type: mimeType }),
    }

    expect(validateOrganizationDocument(input)).toBeNull()
    expect(buildOrganizationDocumentPath(input)).toBe(
      `${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.${extension}`,
    )
    vi.unstubAllGlobals()
  })
  it('round-trips a controlled storage reference', () => {
    const stored = serializeStorageDocumentReference({
      bucket: 'motto_assets',
      path: `${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`,
    })

    expect(parseStorageDocumentReference(stored)).toEqual({
      bucket: 'motto_assets',
      path: `${organizationId}/supplier-receipt/22222222-2222-4222-8222-222222222222.pdf`,
    })
  })

  it('does not classify legacy-compatible or unsafe values as storage references', () => {
    expect(parseStorageDocumentReference('https://example.com/receipt.pdf')).toBeNull()
    expect(parseStorageDocumentReference('data:application/pdf;base64,cGRm')).toBeNull()
    expect(parseStorageDocumentReference('http://example.com/receipt.pdf')).toBeNull()
    expect(parseStorageDocumentReference('javascript:alert(1)')).toBeNull()
    expect(parseStorageDocumentReference('blob:https://example.com/receipt')).toBeNull()
    expect(parseStorageDocumentReference('storage://unknown/file.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/../file.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/reports%2F..%2Fsecret.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/reports%5C..%5Csecret.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/reports%252F..%252Fsecret.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/report%3Fdownload%3D1.pdf')).toBeNull()
    expect(parseStorageDocumentReference('storage://motto_assets/')).toBeNull()
  })

  it('extracts a legacy public object without trusting its host', () => {
    expect(
      parseLegacyPublicStorageUrl(
        'https://project.supabase.co/storage/v1/object/public/receipts/z-report-old.pdf?download=1',
      ),
    ).toEqual({ bucket: 'receipts', path: 'z-report-old.pdf' })
  })

  it('rejects malformed, unsafe, and invalid legacy public URLs', () => {
    expect(parseLegacyPublicStorageUrl('http://project.supabase.co/storage/v1/object/public/receipts/a.pdf')).toBeNull()
    expect(parseLegacyPublicStorageUrl('https://project.supabase.co/storage/v1/object/public/unknown/a.pdf')).toBeNull()
    expect(
      parseLegacyPublicStorageUrl('https://project.supabase.co/storage/v1/object/public/receipts/reports/../a.pdf'),
    ).toBeNull()
    expect(
      parseLegacyPublicStorageUrl(
        'https://project.supabase.co/storage/v1/object/public/receipts/reports%2F..%2Fsecret.pdf',
      ),
    ).toBeNull()
    expect(
      parseLegacyPublicStorageUrl(
        'https://project.supabase.co/storage/v1/object/public/receipts/reports%252F..%252Fsecret.pdf',
      ),
    ).toBeNull()
    expect(
      parseLegacyPublicStorageUrl('https://example.com/unrelated/storage/v1/object/public/receipts/a.pdf'),
    ).toBeNull()
    expect(
      parseLegacyPublicStorageUrl('https://project.supabase.co/storage//v1/object/public/receipts/a.pdf'),
    ).toBeNull()
    expect(parseLegacyPublicStorageUrl('data:application/pdf;base64,cGRm')).toBeNull()
  })

  it.each([
    ['supplier-receipt', 'motto_assets', 'image/jpeg', 'jpg', threeMiB],
    ['investment-receipt', 'motto_assets', 'image/png', 'png', 1],
    ['investment-document', 'motto_assets', 'image/webp', 'webp', 1],
    ['supplier-receipt', 'motto_assets', 'application/pdf', 'pdf', 1],
    ['z-report', 'receipts', 'application/xml', 'xml', 1],
    ['z-report', 'receipts', 'text/xml', 'xml', 1],
    ['z-report', 'receipts', 'application/json', 'json', tenMiB],
    ['z-report', 'receipts', 'application/vnd.ms-excel', 'xls', 1],
    ['z-report', 'receipts', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', 1],
  ] as const)('accepts %s in %s with a MIME-derived extension', (kind, bucket, mimeType, extension, size) => {
    const file = createFile(mimeType, size)
    const input = { organizationId, bucket, kind, file }

    expect(validateOrganizationDocument(input)).toBeNull()

    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
    try {
      expect(buildOrganizationDocumentPath(input)).toBe(
        `${organizationId}/${kind}/22222222-2222-4222-8222-222222222222.${extension}`,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('requires a UUID organization and rejects unsupported active content', () => {
    expect(
      validateOrganizationDocument({
        organizationId: 'org-1',
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file: createFile('application/pdf'),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file: createFile('image/svg+xml'),
      }),
    ).toBeTruthy()
  })

  it('rejects an empty financial document before any upload starts', () => {
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file: createFile('application/pdf', 0),
      }),
    ).toBe('Boş dosyalar yüklenemez.')
  })

  it('enforces document kind bucket, MIME, and size rules', () => {
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'receipts',
        kind: 'supplier-receipt',
        file: createFile('application/pdf'),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'z-report',
        file: createFile('application/json'),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'investment-document',
        file: createFile('application/json'),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'investment-receipt',
        file: createFile('image/webp', threeMiB + 1),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'motto_assets',
        kind: 'supplier-receipt',
        file: createFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', threeMiB + 1),
      }),
    ).toBeTruthy()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'receipts',
        kind: 'z-report',
        file: createFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', tenMiB),
      }),
    ).toBeNull()
    expect(
      validateOrganizationDocument({
        organizationId,
        bucket: 'receipts',
        kind: 'z-report',
        file: createFile('application/json', tenMiB + 1),
      }),
    ).toBeTruthy()
  })
})

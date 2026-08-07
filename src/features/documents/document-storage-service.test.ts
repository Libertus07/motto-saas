import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  devError: vi.fn(),
}))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))

import {
  persistWithOrganizationDocument,
  removeOrganizationDocument,
  resolveDocumentPreviewUrl,
  uploadOrganizationDocument,
} from './document-storage-service'

const organizationId = '11111111-1111-4111-8111-111111111111'
const objectId = '22222222-2222-4222-8222-222222222222'
const scopedPath = `${organizationId}/supplier-receipt/${objectId}.pdf`

function createUploadInput() {
  return {
    organizationId,
    bucket: 'motto_assets' as const,
    kind: 'supplier-receipt' as const,
    file: new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' }),
  }
}

describe('private document storage service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => objectId })
  })

  it('uploads a validated document without overwriting and returns a stable reference', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: scopedPath }, error: null })
    const from = vi.fn(() => ({ upload }))
    const supabase = { storage: { from } } as unknown as SupabaseClient
    const input = createUploadInput()

    await expect(uploadOrganizationDocument(supabase, input)).resolves.toBe(`storage://motto_assets/${scopedPath}`)
    expect(from).toHaveBeenCalledWith('motto_assets')
    expect(upload).toHaveBeenCalledWith(scopedPath, input.file, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })
  })

  it('surfaces validation errors before calling Storage', async () => {
    const upload = vi.fn()
    const from = vi.fn(() => ({ upload }))
    const supabase = { storage: { from } } as unknown as SupabaseClient
    const input = { ...createUploadInput(), organizationId: 'not-a-uuid' }

    await expect(uploadOrganizationDocument(supabase, input)).rejects.toThrow('Geçerli bir kuruluş kimliği gerekli.')
    expect(from).not.toHaveBeenCalled()
  })

  it('hides Storage upload failures while reporting provider detail to the logger', async () => {
    const providerError = { message: 'bucket policy denied', statusCode: '403' }
    const upload = vi.fn().mockResolvedValue({ data: null, error: providerError })
    const from = vi.fn(() => ({ upload }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(uploadOrganizationDocument(supabase, createUploadInput())).rejects.toThrow(
      'Belge yüklenemedi. Lütfen tekrar deneyin.',
    )
    expect(mocks.devError).toHaveBeenCalledWith('Belge depolamaya yüklenemedi.', providerError)
  })

  it('hides rejected Storage upload errors while reporting provider detail to the logger', async () => {
    const providerError = new Error('network interrupted')
    const upload = vi.fn().mockRejectedValue(providerError)
    const from = vi.fn(() => ({ upload }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(uploadOrganizationDocument(supabase, createUploadInput())).rejects.toThrow(
      'Belge yüklenemedi. Lütfen tekrar deneyin.',
    )
    expect(mocks.devError).toHaveBeenCalledWith('Belge depolamaya yüklenemedi.', providerError)
  })

  it.each([
    [`storage://motto_assets/${scopedPath}`, 'motto_assets', scopedPath],
    [
      'https://project.supabase.co/storage/v1/object/public/receipts/legacy/z-report.pdf?download=1',
      'receipts',
      'legacy/z-report.pdf',
    ],
  ])('signs managed document references through the authenticated client', async (storedReference, bucket, path) => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://signed.example/document' }, error: null })
    const from = vi.fn(() => ({ createSignedUrl }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(resolveDocumentPreviewUrl(supabase, storedReference)).resolves.toBe('https://signed.example/document')
    expect(from).toHaveBeenCalledWith(bucket)
    expect(createSignedUrl).toHaveBeenCalledWith(path, 300)
  })

  it.each([
    'data:image/jpeg;base64,aGVsbG8=',
    'data:image/png;base64,aGVsbG8=',
    'data:image/webp;base64,aGVsbG8=',
    'data:application/pdf;base64,aGVsbG8=',
    'https://files.example/legacy-document.pdf',
  ])('passes safe legacy preview values through unchanged', async (storedReference) => {
    const from = vi.fn()
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(resolveDocumentPreviewUrl(supabase, storedReference)).resolves.toBe(storedReference)
    expect(from).not.toHaveBeenCalled()
  })

  it.each([
    '',
    'http://files.example/document.pdf',
    'javascript:alert(1)',
    'blob:https://files.example/document',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:application/pdf;base64,invalid payload',
    'storage://unknown/document.pdf',
    'storage://motto_assets/../document.pdf',
    'https://project.supabase.co/storage/v1/object/public/unknown/document.pdf',
    'https://project.supabase.co/storage/v1/object/public/receipts/reports/../document.pdf',
  ])('rejects unsafe preview references', async (storedReference) => {
    const supabase = { storage: { from: vi.fn() } } as unknown as SupabaseClient

    await expect(resolveDocumentPreviewUrl(supabase, storedReference)).rejects.toThrow(
      'Belge bağlantısı güvenli değil veya desteklenmiyor.',
    )
  })

  it('hides signing failures while reporting provider detail to the logger', async () => {
    const providerError = { message: 'object not found', statusCode: '404' }
    const createSignedUrl = vi.fn().mockResolvedValue({ data: null, error: providerError })
    const from = vi.fn(() => ({ createSignedUrl }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(resolveDocumentPreviewUrl(supabase, `storage://motto_assets/${scopedPath}`)).rejects.toThrow(
      'Belge görüntülenemedi. Lütfen tekrar deneyin.',
    )
    expect(mocks.devError).toHaveBeenCalledWith('Belge için imzalı bağlantı oluşturulamadı.', providerError)
  })

  it('hides rejected signing errors while reporting provider detail to the logger', async () => {
    const providerError = new Error('network interrupted')
    const createSignedUrl = vi.fn().mockRejectedValue(providerError)
    const from = vi.fn(() => ({ createSignedUrl }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await expect(resolveDocumentPreviewUrl(supabase, `storage://motto_assets/${scopedPath}`)).rejects.toThrow(
      'Belge görüntülenemedi. Lütfen tekrar deneyin.',
    )
    expect(mocks.devError).toHaveBeenCalledWith('Belge için imzalı bağlantı oluşturulamadı.', providerError)
  })

  it('removes only a managed Storage object', async () => {
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn(() => ({ remove }))
    const supabase = { storage: { from } } as unknown as SupabaseClient

    await removeOrganizationDocument(supabase, `storage://motto_assets/${scopedPath}`)
    await removeOrganizationDocument(supabase, 'https://files.example/unmanaged-document.pdf')

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('motto_assets')
    expect(remove).toHaveBeenCalledWith([scopedPath])
  })

  it('removes a newly uploaded object when the business write fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: scopedPath }, error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn(() => ({ upload, remove }))
    const supabase = { storage: { from } } as unknown as SupabaseClient
    const persist = vi.fn().mockRejectedValue(new Error('RPC failed'))

    await expect(persistWithOrganizationDocument(supabase, createUploadInput(), null, persist)).rejects.toThrow(
      'RPC failed',
    )

    expect(remove).toHaveBeenCalledWith([scopedPath])
  })

  it('does not remove a newly uploaded object after a successful business write', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: scopedPath }, error: null })
    const remove = vi.fn().mockResolvedValue({ data: [], error: null })
    const from = vi.fn(() => ({ upload, remove }))
    const supabase = { storage: { from } } as unknown as SupabaseClient
    const persist = vi.fn().mockResolvedValue({ id: 'document-1' })

    await expect(
      persistWithOrganizationDocument(supabase, createUploadInput(), `storage://motto_assets/old.pdf`, persist),
    ).resolves.toEqual({
      id: 'document-1',
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('preserves the business error when cleanup also fails', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: scopedPath }, error: null })
    const cleanupError = { message: 'delete policy denied', statusCode: '403' }
    const remove = vi.fn().mockResolvedValue({ data: [], error: cleanupError })
    const from = vi.fn(() => ({ upload, remove }))
    const supabase = { storage: { from } } as unknown as SupabaseClient
    const persist = vi.fn().mockRejectedValue(new Error('RPC failed'))

    await expect(persistWithOrganizationDocument(supabase, createUploadInput(), null, persist)).rejects.toThrow(
      'RPC failed',
    )
    expect(mocks.devError).toHaveBeenCalledWith('Yeni yüklenen belge temizlenemedi.', cleanupError)
  })
})

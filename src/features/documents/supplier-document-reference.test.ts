import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ devError: vi.fn() }))

vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))

import { loadSupplierDocumentReference, openSupplierDocument } from './supplier-document-reference'

function createQuery(result: { data: { document_url: string } | null; error: Error | null }) {
  const query = {
    eq: vi.fn(),
    limit: vi.fn(),
    not: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  query.eq.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.not.mockReturnValue(query)
  query.select.mockReturnValue(query)
  return query
}

describe('loadSupplierDocumentReference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the receipt reference only through the active organization and batch boundary', async () => {
    const query = createQuery({
      data: { document_url: 'storage://motto_assets/org-1/supplier-receipt/receipt.pdf' },
      error: null,
    })
    const supabase = { from: vi.fn().mockReturnValue(query) }

    await expect(loadSupplierDocumentReference(supabase as never, 'org-1', 'batch-1')).resolves.toBe(
      'storage://motto_assets/org-1/supplier-receipt/receipt.pdf',
    )

    expect(supabase.from).toHaveBeenCalledWith('stock_movements')
    expect(query.select).toHaveBeenCalledWith('document_url')
    expect(query.eq.mock.calls).toEqual([
      ['batch_id', 'batch-1'],
      ['organization_id', 'org-1'],
    ])
    expect(query.not).toHaveBeenCalledWith('document_url', 'is', null)
    expect(query.limit).toHaveBeenCalledWith(1)
    expect(query.maybeSingle).toHaveBeenCalledOnce()
  })

  it('logs a row lookup failure and rejects with a safe message', async () => {
    const technicalError = new Error('relation stock_movements leaked internal detail')
    const query = createQuery({ data: null, error: technicalError })
    const supabase = { from: vi.fn().mockReturnValue(query) }

    await expect(loadSupplierDocumentReference(supabase as never, 'org-1', 'batch-1')).rejects.toThrow(
      'Belge görüntülenemedi. Lütfen tekrar deneyin.',
    )

    expect(mocks.devError).toHaveBeenCalledWith('Tedarikçi belgesi sorgulanamadı.', technicalError)
  })

  it('returns null when the tenant-scoped row has no document', async () => {
    const query = createQuery({ data: null, error: null })
    const supabase = { from: vi.fn().mockReturnValue(query) }

    await expect(loadSupplierDocumentReference(supabase as never, 'org-1', 'batch-1')).resolves.toBeNull()
  })
})

describe('openSupplierDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the tenant-scoped row before handing its stable reference to the preview boundary', async () => {
    const query = createQuery({
      data: { document_url: 'storage://motto_assets/org-1/supplier-receipt/receipt.pdf' },
      error: null,
    })
    const openDocument = vi.fn().mockResolvedValue(undefined)
    const showAlert = vi.fn().mockResolvedValue(undefined)

    await openSupplierDocument({
      batchId: 'batch-1',
      openDocument,
      organizationId: 'org-1',
      showAlert,
      supabase: { from: vi.fn().mockReturnValue(query) } as never,
    })

    expect(openDocument).toHaveBeenCalledWith('storage://motto_assets/org-1/supplier-receipt/receipt.pdf')
    expect(showAlert).not.toHaveBeenCalled()
  })

  it('reports a missing tenant or batch without querying storage rows', async () => {
    const from = vi.fn()
    const openDocument = vi.fn()
    const showAlert = vi.fn().mockResolvedValue(undefined)

    await openSupplierDocument({
      batchId: null,
      openDocument,
      organizationId: null,
      showAlert,
      supabase: { from } as never,
    })

    expect(from).not.toHaveBeenCalled()
    expect(openDocument).not.toHaveBeenCalled()
    expect(showAlert).toHaveBeenCalledWith('Bu işlem için ekli belge bulunamadı.', 'error')
  })

  it('masks tenant row lookup failures at the user boundary', async () => {
    const technicalError = new Error('database role and schema details')
    const query = createQuery({ data: null, error: technicalError })
    const openDocument = vi.fn()
    const showAlert = vi.fn().mockResolvedValue(undefined)

    await openSupplierDocument({
      batchId: 'batch-1',
      openDocument,
      organizationId: 'org-1',
      showAlert,
      supabase: { from: vi.fn().mockReturnValue(query) } as never,
    })

    expect(openDocument).not.toHaveBeenCalled()
    expect(showAlert).toHaveBeenCalledWith('Belge görüntülenemedi. Lütfen tekrar deneyin.', 'error')
  })
})

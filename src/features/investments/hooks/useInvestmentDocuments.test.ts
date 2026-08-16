import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ devError: vi.fn() }))

const organizationId = '11111111-1111-4111-8111-111111111111'

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useRef: <T>(initialValue: T) => ({ current: initialValue }),
  useState: (initialValue: unknown) => [initialValue, vi.fn()],
}))
vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))

import { useInvestmentDocuments } from './useInvestmentDocuments'
import type { BuyFormState } from '../types'

function createForm(): BuyFormState {
  return {
    asset_type: 'gold',
    quantity: '1',
    price_per_unit: '5000',
    account_id: 'account-1',
    notes: '',
    purchase_date: '2026-08-08',
    document_url: 'storage://motto_assets/old/document.pdf',
    document_file: null,
    document_organization_id: null,
  }
}

describe('investment document selection', () => {
  const showAlert = vi.fn().mockResolvedValue(undefined)
  const setBuyForm = vi.fn()
  const getCurrentOrganizationId = () => organizationId
  const getCurrentOrganizationVersion = () => 0

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the analysis data URL request-only and leaves document state unchanged', async () => {
    const dataUrl = 'data:image/png;base64,aGVsbG8='
    vi.stubGlobal(
      'FileReader',
      class {
        result = dataUrl
        error = null
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          asset_type: 'usd',
          quantity: 10,
          price_per_unit: 42,
          purchase_date: '2026-08-07',
          notes: 'Döviz dekontu',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    let updatedForm = createForm()
    const updateBuyForm = vi.fn((update: React.SetStateAction<BuyFormState>) => {
      updatedForm = typeof update === 'function' ? update(updatedForm) : update
    })
    const file = new File(['image'], 'dekont.png', { type: 'image/png' })
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm: updateBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    await analyzeReceipt(event)

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { image: string }
    expect(requestBody.image).toBe(dataUrl)
    expect(updatedForm.document_url).toBe('storage://motto_assets/old/document.pdf')
    expect(updatedForm.document_file).toBeNull()
    expect(JSON.stringify(updatedForm)).not.toContain(dataUrl)
  })

  it('does not publish an analysis result after the active organization changes in flight', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,aGVsbG8='
        error = null
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    let resolveAnalysis: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveAnalysis = resolve
          }),
      ),
    )
    let currentOrganizationId = organizationId
    const event = {
      target: { files: [new File(['image'], 'dekont.png', { type: 'image/png' })], value: 'selected' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId: () => currentOrganizationId,
      getCurrentOrganizationVersion,
    })

    const analysis = analyzeReceipt(event)
    await vi.waitFor(() => expect(resolveAnalysis).toBeTypeOf('function'))
    currentOrganizationId = '33333333-3333-4333-8333-333333333333'
    resolveAnalysis!(
      new Response(JSON.stringify({ asset_type: 'usd', quantity: 10, price_per_unit: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await analysis

    expect(setBuyForm).not.toHaveBeenCalled()
    expect(showAlert).not.toHaveBeenCalledWith('Fiş başarıyla okundu ve form dolduruldu.', 'success')
  })

  it('does not publish an analysis result after the organization changes away and back', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,aGVsbG8='
        error = null
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    let resolveAnalysis: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveAnalysis = resolve
          }),
      ),
    )
    let organizationVersion = 0
    const event = {
      target: { files: [new File(['image'], 'dekont.png', { type: 'image/png' })], value: 'selected' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion: () => organizationVersion,
    })

    const analysis = analyzeReceipt(event)
    await vi.waitFor(() => expect(resolveAnalysis).toBeTypeOf('function'))
    organizationVersion = 2
    resolveAnalysis!(
      new Response(JSON.stringify({ asset_type: 'usd', quantity: 10, price_per_unit: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await analysis

    expect(setBuyForm).not.toHaveBeenCalled()
    expect(showAlert).not.toHaveBeenCalledWith('Fiş başarıyla okundu ve form dolduruldu.', 'success')
  })

  it('does not publish a pending analysis after the modal closes', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,aGVsbG8='
        error = null
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    let resolveAnalysis: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveAnalysis = resolve
          }),
      ),
    )
    const event = {
      target: { files: [new File(['image'], 'dekont.png', { type: 'image/png' })], value: 'selected' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt, cancelAnalysis } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    const analysis = analyzeReceipt(event)
    await vi.waitFor(() => expect(resolveAnalysis).toBeTypeOf('function'))
    cancelAnalysis()
    resolveAnalysis!(
      new Response(JSON.stringify({ asset_type: 'usd', quantity: 10, price_per_unit: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await analysis

    expect(setBuyForm).not.toHaveBeenCalled()
    expect(showAlert).not.toHaveBeenCalledWith('Fiş başarıyla okundu ve form dolduruldu.', 'success')
  })

  it('masks analysis provider errors while logging technical details', async () => {
    const dataUrl = 'data:image/png;base64,aGVsbG8='
    vi.stubGlobal(
      'FileReader',
      class {
        result = dataUrl
        error = null
        onerror: (() => void) | null = null
        onload: (() => void) | null = null
        readAsDataURL() {
          this.onload?.()
        }
      },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Gemini provider secret detail' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const event = {
      target: { files: [new File(['image'], 'dekont.png', { type: 'image/png' })], value: 'selected' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    await analyzeReceipt(event)

    expect(showAlert).toHaveBeenCalledWith('Yatırım belgesi analiz edilemedi. Lütfen tekrar deneyin.', 'error')
    expect(showAlert).not.toHaveBeenCalledWith(expect.stringContaining('provider secret'), 'error')
    expect(mocks.devError).toHaveBeenCalledWith('Yatırım belgesi analiz edilemedi.', expect.any(Error))
  })

  it('clears an oversized analysis input so the same file can be selected again', async () => {
    const event = {
      target: {
        files: [new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'buyuk-dekont.pdf', { type: 'application/pdf' })],
        value: 'selected',
      },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    await analyzeReceipt(event)

    expect(event.target.value).toBe('')
  })

  it('keeps a validated selected file pending without replacing its persisted reference', async () => {
    const file = new File(['document'], 'alım-belgesi.pdf', { type: 'application/pdf' })
    const form = createForm()
    const setForm = vi.fn()
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const { uploadDocument } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    await uploadDocument(event, setForm, form)

    expect(setForm).toHaveBeenCalledWith({
      ...form,
      document_file: file,
      document_organization_id: organizationId,
    })
    expect(event.target.value).toBe('')
  })

  it('rejects a file that the shared investment document contract does not permit', async () => {
    const file = new File(['sheet'], 'belge.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const setForm = vi.fn()
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const { uploadDocument } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId,
      getCurrentOrganizationId,
      getCurrentOrganizationVersion,
    })

    await uploadDocument(event, setForm, createForm())

    expect(setForm).not.toHaveBeenCalled()
    expect(showAlert).toHaveBeenCalledWith('Bu belge türü desteklenmiyor.', 'warning')
    expect(event.target.value).toBe('')
  })

  it('clears the input when no active organization can own the selected document', async () => {
    const file = new File(['document'], 'alım-belgesi.pdf', { type: 'application/pdf' })
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const setForm = vi.fn()
    const { uploadDocument } = useInvestmentDocuments({
      setBuyForm,
      showAlert,
      organizationId: undefined,
      getCurrentOrganizationId: () => undefined,
      getCurrentOrganizationVersion,
    })

    await uploadDocument(event, setForm, createForm())

    expect(setForm).not.toHaveBeenCalled()
    expect(event.target.value).toBe('')
  })
})

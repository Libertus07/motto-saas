import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { organizationId, objectId, mocks } = vi.hoisted(() => {
  const organizationId = '11111111-1111-4111-8111-111111111111'
  return {
    organizationId,
    objectId: '22222222-2222-4222-8222-222222222222',
    mocks: {
      accounts: [{ id: 'account-1', name: 'Kasa', type: 'cash', balance: 1000 }],
      activeOrg: { id: organizationId },
      showAlert: vi.fn().mockResolvedValue(undefined),
      showConfirm: vi.fn(),
      devError: vi.fn(),
      supabase: null as unknown,
    },
  }
})

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: vi.fn(),
  useMemo: <T>(factory: () => T) => factory(),
  useState: (initialValue: unknown) => [Array.isArray(initialValue) ? mocks.accounts : initialValue, vi.fn()],
}))

vi.mock('@/lib/supabase', () => ({ createClient: () => mocks.supabase }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: mocks.showAlert, showConfirm: mocks.showConfirm }),
}))
vi.mock('@/context/OrganizationContext', () => ({ useOrganization: () => ({ activeOrg: mocks.activeOrg }) }))
vi.mock('@/lib/debug', () => ({ devError: mocks.devError }))

import { useInvestmentsData } from './useInvestmentsData'
import { useInvestmentDocuments } from './useInvestmentDocuments'
import type { BuyFormState, EditFormState } from '../types'

function createSupabase(rpcError: unknown = null) {
  const upload = vi.fn().mockResolvedValue({ data: { path: 'unused' }, error: null })
  const remove = vi.fn().mockResolvedValue({ data: [], error: null })
  const order = vi.fn().mockResolvedValue({ data: [] })
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ upload, remove, select }))
  const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError })

  return { supabase: { storage: { from }, from, rpc }, upload, remove, rpc }
}

function createBuyForm(file: File | null): BuyFormState {
  return {
    asset_type: 'gold',
    quantity: '2',
    price_per_unit: '5000',
    account_id: 'account-1',
    notes: 'Alım belgesi',
    purchase_date: '2026-08-08',
    document_url: '',
    document_file: file,
  }
}

function createEditForm(file: File | null, documentUrl = 'storage://motto_assets/old/document.pdf'): EditFormState {
  return {
    name: 'Gram Altın',
    quantity: '2',
    average_cost: '5000',
    notes: 'Güncellenen belge',
    purchase_date: '2026-08-08',
    document_url: documentUrl,
    document_file: file,
  }
}

describe('investment document submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: () => objectId })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads a pending buy document during submit and sends its stable reference to the exact RPC argument', async () => {
    const { supabase, upload, rpc } = createSupabase()
    mocks.supabase = supabase
    const file = new File(['document'], 'alım-belgesi.pdf', { type: 'application/pdf' })

    await expect(useInvestmentsData().buyInvestment(createBuyForm(file))).resolves.toBe(true)

    const reference = `storage://motto_assets/${organizationId}/investment-document/${objectId}.pdf`
    expect(upload).toHaveBeenCalledWith(`${organizationId}/investment-document/${objectId}.pdf`, file, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false,
    })
    expect(rpc).toHaveBeenCalledWith(
      'buy_investment_transaction',
      expect.objectContaining({ p_document_url: reference }),
    )
  })

  it('preserves an existing edit document reference when no replacement file is selected', async () => {
    const { supabase, upload, rpc } = createSupabase()
    mocks.supabase = supabase

    await expect(useInvestmentsData().editInvestment('investment-1', createEditForm(null))).resolves.toBe(true)

    expect(upload).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith(
      'update_investment',
      expect.objectContaining({ p_document_url: 'storage://motto_assets/old/document.pdf' }),
    )
  })

  it('compensates only a newly uploaded replacement document when the edit RPC rejects', async () => {
    const providerError = { message: 'RPC reddedildi: internal table detail' }
    const { supabase, remove } = createSupabase(providerError)
    mocks.supabase = supabase
    const file = new File(['document'], 'yeni-belge.pdf', { type: 'application/pdf' })

    await expect(useInvestmentsData().editInvestment('investment-1', createEditForm(file))).resolves.toBe(false)

    expect(remove).toHaveBeenCalledWith([`${organizationId}/investment-document/${objectId}.pdf`])
    expect(remove).not.toHaveBeenCalledWith(['old/document.pdf'])
    expect(mocks.showAlert).toHaveBeenCalledWith('Yatırım güncellenemedi. Lütfen tekrar deneyin.', 'error')
    expect(mocks.showAlert).not.toHaveBeenCalledWith(expect.stringContaining('internal table detail'), 'error')
    expect(mocks.devError).toHaveBeenCalledWith('Yatırım güncellenemedi.', providerError)
  })

  it('compensates a newly uploaded buy document when the buy RPC rejects', async () => {
    const { supabase, remove } = createSupabase({ message: 'buy RPC rejected' })
    mocks.supabase = supabase
    const file = new File(['document'], 'alım-belgesi.pdf', { type: 'application/pdf' })

    await expect(useInvestmentsData().buyInvestment(createBuyForm(file))).resolves.toBe(false)

    expect(remove).toHaveBeenCalledWith([`${organizationId}/investment-document/${objectId}.pdf`])
  })

  it('never forwards the temporary analysis data URL to the buy RPC document argument', async () => {
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
        new Response(JSON.stringify({ asset_type: 'gold', quantity: 2, price_per_unit: 5000, notes: 'Fiş' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    let analyzedForm = createBuyForm(null)
    const updateBuyForm = vi.fn((update: React.SetStateAction<BuyFormState>) => {
      analyzedForm = typeof update === 'function' ? update(analyzedForm) : update
    })
    const event = {
      target: { files: [new File(['image'], 'dekont.png', { type: 'image/png' })], value: 'selected' },
    } as unknown as React.ChangeEvent<HTMLInputElement>
    const { analyzeReceipt } = useInvestmentDocuments({
      setBuyForm: updateBuyForm,
      showAlert: mocks.showAlert,
      organizationId,
    })

    await analyzeReceipt(event)
    const { supabase, rpc } = createSupabase()
    mocks.supabase = supabase
    await useInvestmentsData().buyInvestment(analyzedForm)

    expect(analyzedForm.document_url).toBe('')
    expect(rpc).toHaveBeenCalledWith('buy_investment_transaction', expect.objectContaining({ p_document_url: null }))
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(dataUrl)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/debug', () => ({ devError: vi.fn() }))

import { useInvestmentsData } from './useInvestmentsData'
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

function createBuyForm(file: File): BuyFormState {
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
    const { supabase, remove } = createSupabase({ message: 'RPC reddedildi' })
    mocks.supabase = supabase
    const file = new File(['document'], 'yeni-belge.pdf', { type: 'application/pdf' })

    await expect(useInvestmentsData().editInvestment('investment-1', createEditForm(file))).resolves.toBe(false)

    expect(remove).toHaveBeenCalledWith([`${organizationId}/investment-document/${objectId}.pdf`])
    expect(remove).not.toHaveBeenCalledWith(['old/document.pdf'])
  })
})

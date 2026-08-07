import { beforeEach, describe, expect, it, vi } from 'vitest'

const organizationId = '11111111-1111-4111-8111-111111111111'

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useState: (initialValue: unknown) => [initialValue, vi.fn()],
}))

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
  }
}

describe('investment document selection', () => {
  const showAlert = vi.fn().mockResolvedValue(undefined)
  const setBuyForm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a validated selected file pending without replacing its persisted reference', async () => {
    const file = new File(['document'], 'alım-belgesi.pdf', { type: 'application/pdf' })
    const form = createForm()
    const setForm = vi.fn()
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const { uploadDocument } = useInvestmentDocuments({ setBuyForm, showAlert, organizationId })

    await uploadDocument(event, setForm, form)

    expect(setForm).toHaveBeenCalledWith({ ...form, document_file: file })
    expect(event.target.value).toBe('')
  })

  it('rejects a file that the shared investment document contract does not permit', async () => {
    const file = new File(['sheet'], 'belge.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const setForm = vi.fn()
    const event = { target: { files: [file], value: 'selected' } } as unknown as React.ChangeEvent<HTMLInputElement>
    const { uploadDocument } = useInvestmentDocuments({ setBuyForm, showAlert, organizationId })

    await uploadDocument(event, setForm, createForm())

    expect(setForm).not.toHaveBeenCalled()
    expect(showAlert).toHaveBeenCalledWith('Bu belge türü desteklenmiyor.', 'warning')
  })
})

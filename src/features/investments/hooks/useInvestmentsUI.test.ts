import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setBuyForm: vi.fn(),
  setEditForm: vi.fn(),
}))

vi.mock('react', () => ({
  useState: (initialValue: unknown) => {
    if (typeof initialValue === 'object' && initialValue !== null && 'asset_type' in initialValue) {
      return [initialValue, mocks.setBuyForm]
    }
    if (typeof initialValue === 'object' && initialValue !== null && 'average_cost' in initialValue) {
      return [initialValue, mocks.setEditForm]
    }
    return [initialValue, vi.fn()]
  },
}))

import { useInvestmentsUI } from './useInvestmentsUI'
import type { BuyFormState, EditFormState } from '../types'

describe('investment document form lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('clears pending files on close without deleting persisted references', () => {
    const buyForm: BuyFormState = {
      asset_type: 'gold',
      quantity: '1',
      price_per_unit: '5000',
      account_id: 'account-1',
      notes: '',
      purchase_date: '2026-08-08',
      document_url: 'storage://motto_assets/buy-old.pdf',
      document_file: new File(['buy'], 'buy.pdf', { type: 'application/pdf' }),
    }
    const editForm: EditFormState = {
      name: 'Gram Altın',
      quantity: '1',
      average_cost: '5000',
      notes: '',
      purchase_date: '2026-08-08',
      document_url: 'storage://motto_assets/edit-old.pdf',
      document_file: new File(['edit'], 'edit.pdf', { type: 'application/pdf' }),
    }
    const ui = useInvestmentsUI()

    ui.closeBuyModal()
    ui.closeEditModal()

    const updateBuy = mocks.setBuyForm.mock.calls[0]?.[0] as (current: BuyFormState) => BuyFormState
    const updateEdit = mocks.setEditForm.mock.calls[0]?.[0] as (current: EditFormState) => EditFormState
    expect(updateBuy(buyForm)).toEqual({ ...buyForm, document_file: null })
    expect(updateEdit(editForm)).toEqual({ ...editForm, document_file: null })
  })

  it('resets the buy form with no pending file or stale document reference', () => {
    const ui = useInvestmentsUI()

    ui.resetForms()

    expect(mocks.setBuyForm).toHaveBeenCalledWith(expect.objectContaining({ document_file: null, document_url: '' }))
  })
})

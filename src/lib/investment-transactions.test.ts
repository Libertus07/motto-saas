import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { deleteInvestmentTransactionWithRefund } from './investment-transactions'

describe('investment transaction mutations', () => {
  it('deletes and refunds through the tenant-scoped atomic RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { refunded_amount: '125.50', deleted_investment: true },
      error: null,
    })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(deleteInvestmentTransactionWithRefund(supabase, 'org-1', 'transaction-1')).resolves.toEqual({
      refundedAmount: 125.5,
      deletedInvestment: true,
    })
    expect(rpc).toHaveBeenCalledWith('delete_investment_transaction', {
      p_transaction_id: 'transaction-1',
      p_organization_id: 'org-1',
    })
  })

  it('surfaces database errors without reporting a refund', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('İşlem bulunamadı') })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(deleteInvestmentTransactionWithRefund(supabase, 'org-1', 'missing')).rejects.toThrow(
      'İşlem bulunamadı',
    )
  })
})

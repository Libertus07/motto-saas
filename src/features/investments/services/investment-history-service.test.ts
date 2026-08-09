import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { fetchInvestmentHistory } from './investment-history-service'

describe('fetchInvestmentHistory', () => {
  it('uses the tenant-safe investment relationship and active organization', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    const from = vi.fn().mockReturnValue(query)
    const supabase = { from } as unknown as SupabaseClient

    await fetchInvestmentHistory(supabase, 'org-1')

    expect(from).toHaveBeenCalledWith('investment_transactions')
    expect(query.select).toHaveBeenCalledWith(
      '*, investments!investment_transactions_investment_tenant_fk(name, asset_type)',
    )
    expect(query.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(query.order).toHaveBeenCalledWith('transaction_date', { ascending: false })
  })

  it('returns rows from the unambiguous tenant relationship', async () => {
    const rows = [
      {
        id: 'transaction-1',
        investment_id: 'investment-1',
        transaction_type: 'buy',
        quantity: 1,
        price_per_unit: 30,
        total_amount: 30,
        transaction_date: '2026-08-09',
        notes: 'Test',
        document_url: 'storage://motto_assets/org-1/investment-receipt/test.png',
        investments: { name: 'Altın Alımı', asset_type: 'gold' },
      },
    ]
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient

    await expect(fetchInvestmentHistory(supabase, 'org-1')).resolves.toEqual(rows)
  })

  it('surfaces relation and permission errors instead of silently returning an empty history', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Ambiguous relationship' } }),
    }
    const supabase = { from: vi.fn().mockReturnValue(query) } as unknown as SupabaseClient

    await expect(fetchInvestmentHistory(supabase, 'org-1')).rejects.toThrow('Ambiguous relationship')
  })
})

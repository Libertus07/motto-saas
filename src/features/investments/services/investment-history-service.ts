import type { SupabaseClient } from '@supabase/supabase-js'

export type InvestmentHistoryTransaction = {
  id: string
  investment_id: string
  transaction_type: string
  quantity: number
  price_per_unit: number
  total_amount: number
  transaction_date: string
  notes: string | null
  document_url: string | null
  investments: {
    name: string
    asset_type: string
  } | null
}

export async function fetchInvestmentHistory(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<InvestmentHistoryTransaction[]> {
  const { data, error } = await supabase
    .from('investment_transactions')
    .select('*, investments!investment_transactions_investment_tenant_fk(name, asset_type)')
    .eq('organization_id', organizationId)
    .order('transaction_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as InvestmentHistoryTransaction[]
}

import { createClient } from '@/lib/supabase'

type AppSupabaseClient = ReturnType<typeof createClient>

type DeleteInvestmentTransactionResult = {
  refunded_amount?: number | string
  deleted_investment?: boolean
}

export async function deleteInvestmentTransactionWithRefund(
  supabase: AppSupabaseClient,
  organizationId: string,
  transactionId: string,
) {
  const { data, error } = await supabase.rpc('delete_investment_transaction', {
    p_transaction_id: transactionId,
    p_organization_id: organizationId,
  })

  if (error) throw error

  const result = (data ?? {}) as DeleteInvestmentTransactionResult
  return {
    refundedAmount: Number(result.refunded_amount ?? 0),
    deletedInvestment: result.deleted_investment === true,
  }
}

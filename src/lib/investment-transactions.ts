import { createClient } from '@/lib/supabase'

type AppSupabaseClient = ReturnType<typeof createClient>

type InvestmentTransactionRecord = {
  id: string
  investment_id: string
  transaction_type: string
  quantity: number
  total_amount: number
  account_id: string | null
  transaction_date?: string | null
  created_at?: string | null
}

type InvestmentRecord = {
  id: string
  name?: string | null
  quantity: number
  average_cost: number
}

type AccountMovementRecord = {
  id: string
  account_id: string
  amount: number
  movement_type: string
  created_at?: string | null
}

function toTime(value?: string | null) {
  if (!value) return Number.NaN
  return new Date(value).getTime()
}

function pickClosestMovement(
  movements: AccountMovementRecord[],
  tx: InvestmentTransactionRecord
) {
  if (movements.length <= 1) {
    return movements[0] ?? null
  }

  const txTime = toTime(tx.created_at || tx.transaction_date)
  if (Number.isNaN(txTime)) {
    return movements[0]
  }

  return [...movements].sort((a, b) => {
    const diffA = Math.abs(toTime(a.created_at) - txTime)
    const diffB = Math.abs(toTime(b.created_at) - txTime)
    return diffA - diffB
  })[0]
}

async function findLinkedAccountMovement(
  supabase: AppSupabaseClient,
  tx: InvestmentTransactionRecord,
  investmentName?: string | null
): Promise<AccountMovementRecord | null> {
  if (tx.transaction_type === 'buy') {
    const { data: exactMovement, error: exactError } = await supabase
      .from('account_movements')
      .select('id, account_id, amount, movement_type, created_at')
      .eq('source_type', 'investment')
      .eq('source_id', tx.id)
      .eq('movement_type', 'cikis')
      .limit(1)

    if (exactError) throw exactError
    if (exactMovement && exactMovement.length > 0) {
      return exactMovement[0]
    }

    const { data: legacyCandidates, error: legacyError } = await supabase
      .from('account_movements')
      .select('id, account_id, amount, movement_type, created_at')
      .eq('source_type', 'investment')
      .eq('source_id', tx.investment_id)
      .eq('movement_type', 'cikis')
      .eq('account_id', tx.account_id)
      .eq('amount', tx.total_amount)

    if (legacyError) throw legacyError

    const legacyMatch = pickClosestMovement(legacyCandidates || [], tx)
    if (legacyMatch) {
      return legacyMatch
    }

    // Son çare: source_id bozuk/eski kayıtlar için açıklama + hesap + tutar bazlı eşleştirme.
    let fuzzyQuery = supabase
      .from('account_movements')
      .select('id, account_id, amount, movement_type, created_at')
      .eq('source_type', 'investment')
      .eq('movement_type', 'cikis')
      .eq('account_id', tx.account_id)
      .eq('amount', tx.total_amount)

    if (investmentName) {
      fuzzyQuery = fuzzyQuery.ilike('description', `%${investmentName}%`)
    }

    const { data: fuzzyCandidates, error: fuzzyError } = await fuzzyQuery

    if (fuzzyError) throw fuzzyError
    return pickClosestMovement(fuzzyCandidates || [], tx)
  }

  if (tx.transaction_type === 'rent') {
    const { data: rentCandidates, error: rentError } = await supabase
      .from('account_movements')
      .select('id, account_id, amount, movement_type, created_at')
      .eq('source_type', 'investment_rent')
      .eq('movement_type', 'giris')
      .eq('account_id', tx.account_id)
      .eq('amount', tx.total_amount)

    if (rentError) throw rentError
    return pickClosestMovement(rentCandidates || [], tx)
  }

  return null
}

export async function deleteInvestmentTransactionWithRefund(
  supabase: AppSupabaseClient,
  transactionId: string
) {
  const { data: tx, error: txError } = await supabase
    .from('investment_transactions')
    .select('id, investment_id, transaction_type, quantity, total_amount, account_id, transaction_date, created_at')
    .eq('id', transactionId)
    .single()

  if (txError) throw txError
  if (!tx) {
    throw new Error('Yatırım işlemi bulunamadı.')
  }

  const { data: investment, error: investmentError } = await supabase
    .from('investments')
    .select('id, name, quantity, average_cost')
    .eq('id', tx.investment_id)
    .maybeSingle()

  if (investmentError) throw investmentError

  const linkedMovement = await findLinkedAccountMovement(supabase, tx, investment?.name)

  let refundedAmount = 0

  if (linkedMovement) {
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', linkedMovement.account_id)
      .single()

    if (accountError) throw accountError

    const movementAmount = Number(linkedMovement.amount)
    const balanceDelta = linkedMovement.movement_type === 'cikis'
      ? movementAmount
      : -movementAmount

    const { error: updateAccountError } = await supabase
      .from('accounts')
      .update({ balance: Number(account?.balance || 0) + balanceDelta })
      .eq('id', linkedMovement.account_id)

    if (updateAccountError) throw updateAccountError

    const { error: deleteMovementError } = await supabase
      .from('account_movements')
      .delete()
      .eq('id', linkedMovement.id)

    if (deleteMovementError) throw deleteMovementError

    refundedAmount = balanceDelta
  }

  const { error: deleteTransactionError } = await supabase
    .from('investment_transactions')
    .delete()
    .eq('id', transactionId)

  if (deleteTransactionError) throw deleteTransactionError

  let deletedInvestment = false

  if (investment && tx.transaction_type === 'buy') {
    const currentQty = Number(investment.quantity || 0)
    const currentAvgCost = Number(investment.average_cost || 0)
    const newQty = currentQty - Number(tx.quantity)

    if (newQty <= 0) {
      const { error: deleteInvestmentError } = await supabase
        .from('investments')
        .delete()
        .eq('id', investment.id)

      if (deleteInvestmentError) throw deleteInvestmentError
      deletedInvestment = true
    } else {
      const oldTotalCost = currentQty * currentAvgCost
      const newTotalCost = Math.max(0, oldTotalCost - Number(tx.total_amount))
      const newAvgCost = newQty > 0 ? newTotalCost / newQty : 0

      const { error: updateInvestmentError } = await supabase
        .from('investments')
        .update({
          quantity: newQty,
          average_cost: newAvgCost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', investment.id)

      if (updateInvestmentError) throw updateInvestmentError
    }
  }

  return {
    transaction: tx,
    refundedAmount,
    deletedInvestment,
  }
}

import type { EnhancedInvestment, Investment, InvestmentTransaction, Rates } from './types'

export type InvestmentGroupBy = 'type' | 'month'
export type InvestmentSortBy = 'date' | 'value'
export type InvestmentSortOrder = 'asc' | 'desc'

export type InvestmentPortfolio = {
  investments: EnhancedInvestment[]
  groups: Record<string, EnhancedInvestment[]>
  totalCostValue: number
  totalCurrentValue: number
  totalRentIncome: number
  totalProfit: number
  profitPercentage: number
}

export function getInvestmentGroupSummary(investments: EnhancedInvestment[]) {
  let totalValue = 0
  let totalCost = 0
  let totalRent = 0
  for (const investment of investments) {
    totalValue += investment.currentValue
    totalCost += investment.costValue
    totalRent += investment.invRentIncome
  }
  const profit = totalValue - totalCost + totalRent
  return { totalValue, profit, isProfit: profit >= 0 }
}

export function groupInvestmentsByPurchaseDate(investments: EnhancedInvestment[]) {
  const groups: Record<string, EnhancedInvestment[]> = {}
  for (const investment of investments) {
    const dateKey = investment.purchase_date ? formatGroupDate(investment.purchase_date) : 'Tarih Belirtilmeyenler'
    ;(groups[dateKey] ??= []).push(investment)
  }
  return groups
}

const groupNameByAssetType: Record<Investment['asset_type'], string> = {
  gold: 'Altın Yatırımları',
  usd: 'Dolar (USD)',
  eur: 'Euro (EUR)',
  real_estate: 'Gayrimenkul Mülkleri',
}

const formatGroupDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))

export function buildInvestmentPortfolio({
  investments,
  transactions,
  rates,
  groupBy,
  sortBy,
  sortOrder,
}: {
  investments: Investment[]
  transactions: InvestmentTransaction[]
  rates: Rates
  groupBy: InvestmentGroupBy
  sortBy: InvestmentSortBy
  sortOrder: InvestmentSortOrder
}): InvestmentPortfolio {
  const rentByInvestmentId = new Map<string, number>()
  let totalRentIncome = 0

  for (const transaction of transactions) {
    if (transaction.transaction_type !== 'rent') continue
    const rent = Number(transaction.total_amount)
    totalRentIncome += rent
    rentByInvestmentId.set(transaction.investment_id, (rentByInvestmentId.get(transaction.investment_id) ?? 0) + rent)
  }

  let totalCostValue = 0
  let totalCurrentValue = 0
  const enhancedInvestments = investments.map((investment) => {
    const isRE = investment.asset_type === 'real_estate'
    const currentRate = isRE
      ? 0
      : (rates?.[investment.asset_type as keyof NonNullable<Rates>] ?? Number(investment.average_cost))
    const currentValue = isRE ? Number(investment.current_manual_value || 0) : Number(investment.quantity) * currentRate
    const costValue = Number(investment.quantity) * Number(investment.average_cost)
    const invRentIncome = rentByInvestmentId.get(investment.id) ?? 0
    const profit = currentValue - costValue + invRentIncome

    totalCostValue += costValue
    totalCurrentValue += currentValue

    return {
      ...investment,
      isRE,
      currentRate,
      currentValue,
      costValue,
      invRentIncome,
      profit,
      isProfit: profit >= 0,
    }
  })

  enhancedInvestments.sort((left, right) => {
    const direction = sortOrder === 'desc' ? -1 : 1
    if (sortBy === 'value') return (left.currentValue - right.currentValue) * direction

    const leftDate = new Date(left.purchase_date || left.created_at || 0).getTime()
    const rightDate = new Date(right.purchase_date || right.created_at || 0).getTime()
    return (leftDate - rightDate) * direction
  })

  const groups: Record<string, EnhancedInvestment[]> = {}
  for (const investment of enhancedInvestments) {
    const groupKey =
      groupBy === 'type'
        ? groupNameByAssetType[investment.asset_type] || 'Diğer'
        : investment.purchase_date
          ? formatGroupDate(investment.purchase_date)
          : 'Tarih Belirtilmeyenler'
    ;(groups[groupKey] ??= []).push(investment)
  }

  const totalProfit = totalCurrentValue - totalCostValue + totalRentIncome
  return {
    investments: enhancedInvestments,
    groups,
    totalCostValue,
    totalCurrentValue,
    totalRentIncome,
    totalProfit,
    profitPercentage: totalCostValue > 0 ? (totalProfit / totalCostValue) * 100 : 0,
  }
}

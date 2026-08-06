import type { SupabaseClient } from '@supabase/supabase-js'

import type { CriticalStockItem, DashboardStats } from '../types'

type InvestmentRow = {
  asset_type: string
  average_cost: number
  quantity: number | string
}

type DashboardRpcResult = Record<string, unknown>

async function fetchExchangeRates() {
  try {
    const response = await fetch('/api/exchange-rates')
    if (!response.ok) return null

    const result = (await response.json()) as { rates?: Record<string, number>; success?: boolean }
    return result.success && result.rates ? result.rates : null
  } catch {
    return null
  }
}

const toNumber = (value: unknown) => Number(value) || 0

export function mapDashboardStats(raw: DashboardRpcResult, rates: Record<string, number> | null): DashboardStats {
  const investments = (raw.investmentsList as InvestmentRow[] | undefined) ?? []
  const totalInvestments = investments.reduce((total, investment) => {
    const currentRate = rates?.[investment.asset_type] ?? investment.average_cost
    return total + toNumber(investment.quantity) * toNumber(currentRate)
  }, 0)

  const grossRevenue = toNumber(raw.grossRevenue)
  const totalDiscounts = toNumber(raw.totalDiscounts)
  const totalCogs = toNumber(raw.totalCogs)
  const monthlyExpenses = toNumber(raw.monthlyExpenses)
  const netRevenue = grossRevenue - totalDiscounts

  return {
    criticalItems: (raw.criticalItems as CriticalStockItem[] | undefined) ?? [],
    criticalStockCount: toNumber(raw.criticalStockCount),
    grossRevenue,
    lowMarginProducts: toNumber(raw.lowMarginProducts),
    monthlyExpenses,
    netProfit: netRevenue - totalCogs - monthlyExpenses,
    netRevenue,
    targetMargin: toNumber(raw.targetMargin) || 35,
    totalBank: toNumber(raw.totalBank),
    totalCash: toNumber(raw.totalCash),
    totalCogs,
    totalDiscounts,
    totalIngredients: toNumber(raw.totalIngredients),
    totalInvestments,
    totalProducts: toNumber(raw.totalProducts),
    totalStockValue: toNumber(raw.totalStockValue),
  }
}

export async function fetchDashboardStats(supabase: SupabaseClient): Promise<DashboardStats> {
  const [statsResult, rates] = await Promise.all([
    supabase.rpc('get_dashboard_stats', { days_ago: 30 }),
    fetchExchangeRates(),
  ])

  if (statsResult.error) throw statsResult.error

  return mapDashboardStats((statsResult.data ?? {}) as DashboardRpcResult, rates)
}

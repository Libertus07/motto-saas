export type CriticalStockItem = {
  id: string
  name: string
  critical_stock_level: number
  stock_quantity: number
  unit: string
}

export type DashboardStats = {
  criticalItems: CriticalStockItem[]
  criticalStockCount: number
  grossRevenue: number
  lowMarginProducts: number
  monthlyExpenses: number
  netProfit: number
  netRevenue: number
  targetMargin: number
  totalBank: number
  totalCash: number
  totalCogs: number
  totalDiscounts: number
  totalIngredients: number
  totalInvestments: number
  totalProducts: number
  totalStockValue: number
}

export const initialDashboardStats: DashboardStats = {
  criticalItems: [],
  criticalStockCount: 0,
  grossRevenue: 0,
  lowMarginProducts: 0,
  monthlyExpenses: 0,
  netProfit: 0,
  netRevenue: 0,
  targetMargin: 35,
  totalBank: 0,
  totalCash: 0,
  totalCogs: 0,
  totalDiscounts: 0,
  totalIngredients: 0,
  totalInvestments: 0,
  totalProducts: 0,
  totalStockValue: 0,
}

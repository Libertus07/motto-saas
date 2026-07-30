export type Product = {
  id: string
  name: string
  category: string
  sale_price: number
  estimated_monthly_sales: number
  calculated_cost?: number
}

export type Expense = {
  amount: number
  period: string
  category: string
  expense_date?: string
}

export type ProductSales = {
  [key: string]: {
    dailySales: number
    isRealData?: boolean
  }
}

export type Calculation = {
  product: Product
  rawCost: number
  revenueShare: number
  expenseShare: number
  totalCost: number
  suggestedPrice: number
  currentMargin: number
  dailyRevenue: number
  dailyProfit: number
}

export type RealSalesMeta = {
  activeDays: number
  salesByProduct: Record<string, number>
}

export type PricingSettings = {
  targetMargin: number
  taxRate: number
}

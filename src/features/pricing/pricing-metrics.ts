import type { Calculation, Expense, Product, ProductSales, RealSalesMeta } from './types'

export function calculateDailyExpenses(
  expenses: Expense[],
  realSalesMeta: RealSalesMeta | null,
  now = new Date(),
) {
  const fixedMonthlyExpenses = expenses.reduce((total, expense) => {
    if (expense.period === 'daily' || expense.period === 'one_time') return total
    return total + (expense.period === 'yearly' ? Number(expense.amount) / 12 : Number(expense.amount))
  }, 0)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentVariableExpenses = expenses.reduce((total, expense) => {
    if (expense.period !== 'daily' && expense.period !== 'one_time') return total

    const expenseDate = expense.expense_date ? new Date(expense.expense_date) : null
    return !expenseDate || expenseDate >= thirtyDaysAgo ? total + Number(expense.amount) : total
  }, 0)

  const activeDays = realSalesMeta && realSalesMeta.activeDays > 0 ? realSalesMeta.activeDays : 30
  return fixedMonthlyExpenses / 30 + recentVariableExpenses / activeDays
}

export function getPricingMetrics({
  products,
  productSales,
  calculations,
  expenses,
  realSalesMeta,
  now,
}: {
  products: Product[]
  productSales: ProductSales
  calculations: Calculation[]
  expenses: Expense[]
  realSalesMeta: RealSalesMeta | null
  now?: Date
}) {
  return {
    totalDailyRevenue: products.reduce(
      (total, product) =>
        total + Number(product.sale_price || 0) * (productSales[product.id]?.dailySales || 0),
      0,
    ),
    dailyExpenses: calculateDailyExpenses(expenses, realSalesMeta, now),
    totalDailyProfit: calculations.reduce((total, calculation) => total + calculation.dailyProfit, 0),
  }
}

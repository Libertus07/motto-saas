import { useState, useEffect, useCallback } from 'react'
import { Product, Expense, Calculation, ProductSales, PricingSettings, RealSalesMeta } from '../types'
import { calculateDailyExpenses } from '../pricing-metrics'

export function usePricingCalculator(
  products: Product[],
  expenses: Expense[],
  realSalesMeta: RealSalesMeta | null,
  settings: PricingSettings,
) {
  const [productSales, setProductSales] = useState<ProductSales>({})
  const [calculations, setCalculations] = useState<Calculation[]>([])

  // Initialize productSales when products or realSalesMeta change
  useEffect(() => {
    if (products.length === 0) return

    const id = window.setTimeout(() => {
      setProductSales((prev) => {
        const initial: ProductSales = {}
        products.forEach((p) => {
          if (!prev[p.id]) {
            if (realSalesMeta && realSalesMeta.salesByProduct[p.id] !== undefined) {
              const realDaily = Math.round(realSalesMeta.salesByProduct[p.id] / realSalesMeta.activeDays)
              initial[p.id] = { dailySales: realDaily, isRealData: true }
            } else {
              const daily = p.estimated_monthly_sales ? Math.round(p.estimated_monthly_sales / 30) : 0
              initial[p.id] = { dailySales: daily, isRealData: false }
            }
          }
        })
        if (Object.keys(initial).length > 0) {
          return { ...initial, ...prev }
        }
        return prev
      })
    }, 0)

    return () => clearTimeout(id)
  }, [products, realSalesMeta])

  const calculate = useCallback(() => {
    if (products.length === 0) return

    const dailyExpenses = calculateDailyExpenses(expenses, realSalesMeta)

    const totalDailyRevenue = products.reduce((t, p) => {
      const sales = productSales[p.id]?.dailySales || 0
      return t + (p.sale_price || 0) * sales
    }, 0)

    const calcs = products.map((product) => {
      const sales = productSales[product.id]?.dailySales || 0
      const sale_price = product.sale_price || 0
      const dailyRevenue = sale_price * sales
      const rawCost = product.calculated_cost || 0

      const revenueShare = totalDailyRevenue > 0 ? dailyRevenue / totalDailyRevenue : 1 / products.length

      const totalExpenseForProduct = dailyExpenses * revenueShare
      const expenseShare = sales > 0 ? totalExpenseForProduct / sales : totalExpenseForProduct

      const totalCost = rawCost + expenseShare
      const taxRate = settings.taxRate / 100
      const marginRate = settings.targetMargin / 100

      const preTax = totalCost / (1 - marginRate)
      const suggestedPrice = preTax * (1 + taxRate)

      const priceExTax = sale_price / (1 + taxRate)
      const currentMargin = priceExTax > 0 ? ((priceExTax - totalCost) / priceExTax) * 100 : 0

      const dailyProfit = sales > 0 ? (priceExTax - totalCost) * sales : 0

      return {
        product,
        rawCost,
        revenueShare: revenueShare * 100,
        expenseShare,
        totalCost,
        suggestedPrice,
        currentMargin,
        dailyRevenue,
        dailyProfit,
      }
    })

    setCalculations(calcs)
  }, [products, expenses, productSales, settings, realSalesMeta])

  // Recalculate whenever inputs change
  useEffect(() => {
    const id = window.setTimeout(() => {
      calculate()
    }, 0)
    return () => clearTimeout(id)
  }, [calculate])

  const updateSales = (productId: string, field: 'dailySales', value: number) => {
    setProductSales((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: Math.max(0, value), isRealData: false },
    }))
  }

  const adjustSalesByDelta = (productId: string, delta: number) => {
    const current = productSales[productId]?.dailySales || 0
    updateSales(productId, 'dailySales', current + delta)
  }

  return {
    productSales,
    calculations,
    updateSales,
    adjustSalesByDelta,
    calculate,
  }
}

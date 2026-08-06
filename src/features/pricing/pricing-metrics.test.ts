import { describe, expect, it } from 'vitest'
import { calculateDailyExpenses, getPricingMetrics } from './pricing-metrics'

describe('pricing metrics', () => {
  it('normalizes fixed and recent variable expenses to active days', () => {
    const result = calculateDailyExpenses(
      [
        { amount: 3000, period: 'monthly', category: 'Kira' },
        { amount: 1200, period: 'yearly', category: 'Lisans' },
        { amount: 200, period: 'daily', category: 'Pazarlama', expense_date: '2026-07-20' },
        { amount: 900, period: 'one_time', category: 'Eski', expense_date: '2026-01-01' },
      ],
      { activeDays: 10, salesByProduct: {} },
      new Date('2026-08-01T12:00:00Z'),
    )

    expect(result).toBeCloseTo(123.333, 3)
  })

  it('summarizes revenue and profit without mutating source data', () => {
    const metrics = getPricingMetrics({
      products: [{ id: 'p1', name: 'Latte', category: 'Kahve', sale_price: 100, estimated_monthly_sales: 0 }],
      productSales: { p1: { dailySales: 4 } },
      calculations: [
        {
          product: { id: 'p1', name: 'Latte', category: 'Kahve', sale_price: 100, estimated_monthly_sales: 0 },
          rawCost: 0,
          revenueShare: 100,
          expenseShare: 0,
          totalCost: 0,
          suggestedPrice: 0,
          currentMargin: 0,
          dailyRevenue: 400,
          dailyProfit: 140,
        },
      ],
      expenses: [],
      realSalesMeta: null,
    })

    expect(metrics).toEqual({ totalDailyRevenue: 400, dailyExpenses: 0, totalDailyProfit: 140 })
  })
})

import { describe, expect, it } from 'vitest'

import { mapDashboardStats } from './dashboard-service'

describe('mapDashboardStats', () => {
  it('finansal toplamları ve canlı yatırım değerini doğru hesaplar', () => {
    const result = mapDashboardStats(
      {
        criticalItems: [{ id: 'material-1', name: 'Süt', critical_stock_level: 10, stock_quantity: 4, unit: 'lt' }],
        criticalStockCount: 1,
        grossRevenue: 100_000,
        investmentsList: [
          { asset_type: 'USD', average_cost: 30, quantity: 10 },
          { asset_type: 'ALTIN', average_cost: 2_000, quantity: 2 },
        ],
        monthlyExpenses: 20_000,
        targetMargin: 40,
        totalBank: 15_000,
        totalCash: 5_000,
        totalCogs: 30_000,
        totalDiscounts: 5_000,
        totalIngredients: 18,
        totalProducts: 24,
        totalStockValue: 12_500,
      },
      { USD: 40 },
    )

    expect(result.netRevenue).toBe(95_000)
    expect(result.netProfit).toBe(45_000)
    expect(result.totalInvestments).toBe(4_400)
    expect(result.criticalItems).toHaveLength(1)
    expect(result.targetMargin).toBe(40)
  })

  it('eksik veya geçersiz RPC değerlerini güvenli varsayılanlara dönüştürür', () => {
    const result = mapDashboardStats({ grossRevenue: 'geçersiz', targetMargin: null }, null)

    expect(result.grossRevenue).toBe(0)
    expect(result.netProfit).toBe(0)
    expect(result.targetMargin).toBe(35)
    expect(result.criticalItems).toEqual([])
  })
})

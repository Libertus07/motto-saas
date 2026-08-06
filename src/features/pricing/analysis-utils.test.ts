import { describe, expect, it } from 'vitest'

import { filterPricingCalculations, getPriceDifference, getPricingAnalysisStats } from './analysis-utils'
import type { Calculation } from './types'

const calculation = (id: string, current: number, suggested: number, margin: number): Calculation => ({
  product: { id, name: id, category: 'Tatlı', sale_price: current, estimated_monthly_sales: 1 },
  rawCost: 1,
  revenueShare: 0,
  expenseShare: 0,
  totalCost: 1,
  suggestedPrice: suggested,
  currentMargin: margin,
  dailyRevenue: 0,
  dailyProfit: 0,
})

describe('pricing analysis utilities', () => {
  const calculations = [
    calculation('ideal', 100, 101, 50),
    calculation('artir', 80, 100, 20),
    calculation('indir', 130, 100, 70),
  ]

  it('iki liradan küçük farkı ideal kabul eder', () => expect(getPriceDifference(100, 101)).toBeNull())

  it('durum sayılarını ve filtreleri tutarlı üretir', () => {
    expect(getPricingAnalysisStats(calculations)).toEqual({ ideal: 1, artirilmali: 1, indirim: 1 })
    expect(filterPricingCalculations(calculations, '', 'artirilmali').map((item) => item.product.id)).toEqual(['artir'])
  })
})

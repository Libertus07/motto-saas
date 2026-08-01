import { describe, expect, it } from 'vitest'
import { calculateMargin, calculateProductMetrics, calculateRecipeCost } from './utils'

describe('product calculation rules', () => {
  it('calculates recipe cost from materials and sub-recipes', () => {
    expect(
      calculateRecipeCost(
        [
          { type: 'material', item_id: 'coffee', quantity: 2 },
          { type: 'sub_recipe', item_id: 'syrup', quantity: 3 },
        ],
        [{ id: 'coffee', name: 'Coffee', unit: 'g', price_per_unit: 4 }],
        [{ id: 'syrup', name: 'Syrup', yield_quantity: 1, yield_unit: 'ml', wastage_percent: 0, cost_per_yield: 2 }],
      ),
    ).toBe(14)
  })

  it('returns safe margins and aggregate metrics', () => {
    expect(calculateMargin(0, 20)).toBe(0)
    expect(calculateMargin(100, 30)).toBe(70)
    expect(
      calculateProductMetrics([
        {
          id: '1',
          name: 'A',
          category: 'Menu',
          sale_price: 100,
          estimated_monthly_sales: 10,
          calculated_cost: 30,
          actual_sales_30d: 4,
        },
      ]),
    ).toEqual({ totalRevenue: 400, totalEstimatedContribution: 700, averageMargin: 70 })
  })
})

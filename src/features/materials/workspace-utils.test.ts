import { describe, expect, it } from 'vitest'

import type { Material } from './types'
import {
  calculateMaterialMetrics,
  createAutoCategorySuggestions,
  createMaterialBulkPlan,
  createMaterialEditRows,
  groupVisibleMaterials,
  parseMaterialCategories,
} from './workspace-utils'

const materials: Material[] = [
  {
    id: 'coffee',
    name: 'Kahve',
    unit: 'Kg',
    price_per_unit: 500,
    stock_quantity: 2,
    critical_stock_level: 3,
    category: 'İçecek',
  },
  {
    id: 'milk',
    name: 'Süt',
    unit: 'Litre',
    price_per_unit: 40,
    stock_quantity: 10,
    critical_stock_level: 2,
    category: 'Süt Ürünleri',
  },
]

describe('material workspace utilities', () => {
  it('parses settings and falls back safely for malformed values', () => {
    expect(parseMaterialCategories(['İçecek', 12, 'Gıda'])).toEqual(['İçecek', 'Gıda'])
    expect(parseMaterialCategories('["İçecek","Gıda"]')).toEqual(['İçecek', 'Gıda'])
    expect(parseMaterialCategories([])).toEqual(['Diğer'])
    expect(parseMaterialCategories('not-json')).toEqual(['Diğer'])
  })

  it('builds a validated bulk update plan with audit details', () => {
    const rows = createMaterialEditRows(materials)
    rows.coffee.price_per_unit = '550'
    rows.coffee.stock_quantity = '4'
    const plan = createMaterialBulkPlan(materials, rows, new Set(['coffee']))

    expect(plan?.updates).toEqual([expect.objectContaining({ id: 'coffee', price_per_unit: 550, stock_quantity: 4 })])
    expect(plan?.details[0]).toContain('Fiyat: 500 → 550')
  })

  it('rejects negative values and derives groups, suggestions and metrics', () => {
    const rows = createMaterialEditRows(materials)
    rows.milk.stock_quantity = '-1'
    expect(createMaterialBulkPlan(materials, rows, new Set(['milk']))).toBeNull()

    expect(groupVisibleMaterials(materials, ['İçecek', 'Süt Ürünleri'], 'kah', 'Tümü', 'name')).toEqual([
      { category: 'İçecek', items: [materials[0]] },
    ])
    expect(
      createAutoCategorySuggestions(materials, [
        { id: 'coffee', suggested_category: 'Kuru Gıda' },
        { id: 'milk', suggested_category: 'Süt Ürünleri' },
      ]),
    ).toEqual([{ id: 'coffee', name: 'Kahve', current: 'İçecek', suggested: 'Kuru Gıda' }])
    expect(calculateMaterialMetrics(materials)).toEqual({
      totalValue: 1400,
      criticalCount: 1,
      activeCategoryCount: 2,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { filterAndSortMaterials, isCriticalMaterial } from './utils'

const materials = [
  { id: 'milk', name: 'Milk', unit: 'l', price_per_unit: 30, stock_quantity: 1, critical_stock_level: 2 },
  { id: 'coffee', name: 'Coffee', unit: 'g', price_per_unit: 50, stock_quantity: 8, category: 'Coffee' },
]

describe('material filtering rules', () => {
  it('identifies critical stock and prioritizes it when requested', () => {
    expect(isCriticalMaterial(materials[0])).toBe(true)
    expect(filterAndSortMaterials(materials, '', 'Tümü', 'critical_first').map((material) => material.id)).toEqual([
      'milk',
      'coffee',
    ])
  })

  it('filters by search and category', () => {
    expect(filterAndSortMaterials(materials, 'cof', 'Coffee', 'name').map((material) => material.id)).toEqual([
      'coffee',
    ])
  })
})

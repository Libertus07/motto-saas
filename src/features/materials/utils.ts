import type { Material } from './types'

export const DEFAULT_MATERIAL_CATEGORY = 'Diğer'

export type MaterialSort = 'name' | 'price_desc' | 'stock_desc' | 'critical_first'

export function getMaterialCategory(material: Material) {
  return material.category || DEFAULT_MATERIAL_CATEGORY
}

export function isCriticalMaterial(material: Material) {
  return (
    material.critical_stock_level != null &&
    material.critical_stock_level > 0 &&
    (material.stock_quantity || 0) <= material.critical_stock_level
  )
}

export function filterAndSortMaterials(
  materials: Material[],
  search: string,
  categoryFilter: string,
  sortBy: MaterialSort,
) {
  const normalizedSearch = search.trim().toLowerCase()
  const result = materials.filter(
    (material) =>
      (!normalizedSearch || material.name.toLowerCase().includes(normalizedSearch)) &&
      (categoryFilter === 'Tümü' || getMaterialCategory(material) === categoryFilter),
  )

  return result.sort((left, right) => {
    if (sortBy === 'critical_first') {
      const leftIsCritical = isCriticalMaterial(left)
      const rightIsCritical = isCriticalMaterial(right)
      if (leftIsCritical !== rightIsCritical) return leftIsCritical ? -1 : 1
    }
    if (sortBy === 'price_desc') return right.price_per_unit - left.price_per_unit
    if (sortBy === 'stock_desc') return (right.stock_quantity || 0) - (left.stock_quantity || 0)
    return left.name.localeCompare(right.name)
  })
}

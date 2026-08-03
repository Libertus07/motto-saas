import type {
  AutoCatSuggestion,
  EditRow,
  Material,
  MaterialBulkUpdate,
  MaterialCategoryGroup,
  MaterialFormValues,
} from './types'
import {
  DEFAULT_MATERIAL_CATEGORY,
  filterAndSortMaterials,
  getMaterialCategory,
  isCriticalMaterial,
  type MaterialSort,
} from './utils'

export const MATERIAL_CATEGORY_ALL = 'Tümü'
export const MATERIAL_UNITS = ['Kg', 'Gram', 'Litre', 'Ml', 'Adet', 'Paket', 'Koli', 'Kutu'] as const

export const EMPTY_MATERIAL_FORM: MaterialFormValues = {
  name: '',
  category: DEFAULT_MATERIAL_CATEGORY,
  unit: 'Kg',
  price_per_unit: '',
  stock_quantity: '0',
  critical_stock_level: '0',
}

export function parseMaterialCategories(value: unknown): string[] {
  if (Array.isArray(value)) {
    const categories = value.filter((category): category is string => typeof category === 'string')
    return categories.length > 0 ? categories : [DEFAULT_MATERIAL_CATEGORY]
  }
  if (typeof value !== 'string' || value.trim() === '') return [DEFAULT_MATERIAL_CATEGORY]

  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return [DEFAULT_MATERIAL_CATEGORY]
    const categories = parsed.filter((category): category is string => typeof category === 'string')
    return categories.length > 0 ? categories : [DEFAULT_MATERIAL_CATEGORY]
  } catch {
    return [DEFAULT_MATERIAL_CATEGORY]
  }
}

export function createMaterialEditRows(materials: Material[]): Record<string, EditRow> {
  return Object.fromEntries(
    materials.map((material) => [
      material.id,
      {
        id: material.id,
        name: material.name,
        unit: material.unit,
        price_per_unit: String(material.price_per_unit),
        stock_quantity: String(material.stock_quantity || 0),
        critical_stock_level: String(material.critical_stock_level || 0),
        category: getMaterialCategory(material),
      },
    ]),
  )
}

export function createMaterialBulkPlan(
  materials: Material[],
  rows: Record<string, EditRow>,
  changedIds: ReadonlySet<string>,
): { updates: MaterialBulkUpdate[]; details: string[] } | null {
  const materialById = new Map(materials.map((material) => [material.id, material]))
  const updates: MaterialBulkUpdate[] = []
  const details: string[] = []

  for (const id of changedIds) {
    const row = rows[id]
    const previous = materialById.get(id)
    if (!row || !previous) continue

    const price = Number(row.price_per_unit)
    const stock = Number(row.stock_quantity || 0)
    const critical = Number(row.critical_stock_level || 0)
    if (
      !row.name.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(stock) ||
      stock < 0 ||
      !Number.isFinite(critical) ||
      critical < 0
    )
      return null

    updates.push({
      id,
      name: row.name.trim(),
      unit: row.unit,
      category: row.category,
      price_per_unit: price,
      stock_quantity: stock,
      critical_stock_level: critical,
    })

    const changes: string[] = []
    if (previous.price_per_unit !== price) changes.push(`Fiyat: ${previous.price_per_unit} → ${price}`)
    if ((previous.stock_quantity || 0) !== stock) changes.push(`Stok: ${previous.stock_quantity || 0} → ${stock}`)
    if ((previous.critical_stock_level || 0) !== critical)
      changes.push(`Kritik stok: ${previous.critical_stock_level || 0} → ${critical}`)
    if (getMaterialCategory(previous) !== row.category)
      changes.push(`Kategori: ${getMaterialCategory(previous)} → ${row.category}`)
    if (changes.length > 0) details.push(`${row.name} (${changes.join(', ')})`)
  }

  return { updates, details }
}

export function groupVisibleMaterials(
  materials: Material[],
  categories: string[],
  search: string,
  categoryFilter: string,
  sortBy: MaterialSort,
): MaterialCategoryGroup[] {
  const visible = filterAndSortMaterials(materials, search, categoryFilter, sortBy)
  const categoryNames = [...new Set([...categories, DEFAULT_MATERIAL_CATEGORY, ...visible.map(getMaterialCategory)])]
  const filteredCategories = categoryFilter === MATERIAL_CATEGORY_ALL ? categoryNames : [categoryFilter]

  return filteredCategories
    .map((category) => ({ category, items: visible.filter((material) => getMaterialCategory(material) === category) }))
    .filter((group) => group.items.length > 0)
}

export function createAutoCategorySuggestions(
  materials: Material[],
  suggestions: Array<{ id: string; suggested_category: string }>,
): AutoCatSuggestion[] {
  const materialById = new Map(materials.map((material) => [material.id, material]))
  return suggestions.flatMap((suggestion) => {
    const material = materialById.get(suggestion.id)
    if (!material || suggestion.suggested_category === getMaterialCategory(material)) return []
    return [
      {
        id: suggestion.id,
        name: material.name,
        current: getMaterialCategory(material),
        suggested: suggestion.suggested_category,
      },
    ]
  })
}

export function calculateMaterialMetrics(materials: Material[]) {
  let totalValue = 0
  let criticalCount = 0
  const activeCategories = new Set<string>()

  for (const material of materials) {
    totalValue += (material.stock_quantity || 0) * material.price_per_unit
    if (isCriticalMaterial(material)) criticalCount += 1
    activeCategories.add(getMaterialCategory(material))
  }

  return { totalValue, criticalCount, activeCategoryCount: activeCategories.size }
}

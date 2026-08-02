import type {
  Product,
  ProductBulkRow,
  ProductBulkUpdate,
  ProductCategorySuggestion,
  ProductFormValues,
  ProductSort,
} from './types'
import { calculateMargin } from './utils'

export const PRODUCT_CATEGORY_ALL = 'Tümü'

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Sıcak Kahveler',
  'Soğuk Kahveler',
  'Tatlılar',
  'Çaylar',
  'Kutu İçecekler',
  'Diğer',
]

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  category: 'Sıcak Kahveler',
  sale_price: '',
  estimated_monthly_sales: '0',
}

export type ProductFormPayload = {
  name: string
  category: string
  salePrice: number
  estimatedMonthlySales: number
}

export function getProductCategories(products: Product[]) {
  const productCategories = products.map((product) => product.category).filter(Boolean)
  return Array.from(new Set([...DEFAULT_PRODUCT_CATEGORIES, ...productCategories]))
}

export function createProductBulkRows(products: Product[]) {
  return products.reduce<Record<string, ProductBulkRow>>((rows, product) => {
    rows[product.id] = {
      id: product.id,
      sale_price: product.sale_price.toString(),
      estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString(),
      category: product.category,
    }
    return rows
  }, {})
}

export function createProductFormPayload(form: ProductFormValues): ProductFormPayload | null {
  const name = form.name.trim()
  const category = form.category.trim()
  const salePrice = Number.parseFloat(form.sale_price || '0')
  const estimatedMonthlySales = Number(form.estimated_monthly_sales || '0')

  if (
    !name ||
    !Number.isFinite(salePrice) ||
    salePrice < 0 ||
    !Number.isInteger(estimatedMonthlySales) ||
    estimatedMonthlySales < 0
  ) {
    return null
  }

  return { name, category, salePrice, estimatedMonthlySales }
}

export function describeProductChanges(product: Product | undefined, payload: ProductFormPayload) {
  if (!product) return `Fiyat: ${payload.salePrice} ₺, Kategori: ${payload.category}`

  const changes: string[] = []
  if (product.sale_price !== payload.salePrice) changes.push(`Fiyat: ${product.sale_price} -> ${payload.salePrice} ₺`)
  if ((product.estimated_monthly_sales || 0) !== payload.estimatedMonthlySales) {
    changes.push(`Tahmin: ${product.estimated_monthly_sales} -> ${payload.estimatedMonthlySales}`)
  }
  if (product.category !== payload.category)
    changes.push(`Kategori: ${product.category || 'Diğer'} -> ${payload.category}`)
  return changes.length > 0 ? changes.join(', ') : 'İsim veya reçete güncellendi'
}

export function createBulkUpdatePlan(
  products: Product[],
  rows: Record<string, ProductBulkRow>,
  changedIds: ReadonlySet<string>,
) {
  const updates: ProductBulkUpdate[] = []
  const details: string[] = []

  for (const id of changedIds) {
    const row = rows[id]
    if (!row) return null

    const salePrice = Number.parseFloat(row.sale_price)
    const estimatedMonthlySales = Number(row.estimated_monthly_sales)
    if (
      !Number.isFinite(salePrice) ||
      salePrice < 0 ||
      !Number.isInteger(estimatedMonthlySales) ||
      estimatedMonthlySales < 0
    ) {
      return null
    }

    const product = products.find((candidate) => candidate.id === id)
    const changes: string[] = []
    if ((product?.sale_price || 0) !== salePrice) changes.push(`Fiyat: ${product?.sale_price || 0}->${salePrice}`)
    if ((product?.estimated_monthly_sales || 0) !== estimatedMonthlySales) {
      changes.push(`Tahmin: ${product?.estimated_monthly_sales || 0}->${estimatedMonthlySales}`)
    }
    if (product?.category !== row.category) changes.push(`Kategori: ${product?.category}->${row.category}`)
    if (changes.length > 0) details.push(`${product?.name || 'Ürün'} (${changes.join(', ')})`)

    updates.push({
      id,
      sale_price: salePrice,
      estimated_monthly_sales: estimatedMonthlySales,
      category: row.category,
    })
  }

  return { updates, details }
}

export function createAutoCategorySuggestions(
  products: Product[],
  suggestions: { id: string; suggested_category: string }[],
): ProductCategorySuggestion[] {
  return suggestions
    .map((suggestion) => {
      const product = products.find((candidate) => candidate.id === suggestion.id)
      return {
        id: suggestion.id,
        name: product?.name || suggestion.id,
        current: product?.category || 'Diğer',
        suggested: suggestion.suggested_category,
      }
    })
    .filter((suggestion) => suggestion.suggested !== suggestion.current)
}

export function createAutoCategoryUpdates(products: Product[], approved: { id: string; suggested: string }[]) {
  const suggestions = new Map(approved.map((item) => [item.id, item.suggested]))
  return products
    .filter((product) => suggestions.has(product.id))
    .map<ProductBulkUpdate>((product) => ({
      id: product.id,
      sale_price: product.sale_price,
      estimated_monthly_sales: product.estimated_monthly_sales || 0,
      category: suggestions.get(product.id) ?? product.category,
    }))
}

export function groupVisibleProducts(
  products: Product[],
  categories: string[],
  search: string,
  categoryFilter: string,
  sortBy: ProductSort,
) {
  const query = search.trim().toLocaleLowerCase('tr-TR')
  const visibleProducts = products
    .filter((product) => !query || product.name.toLocaleLowerCase('tr-TR').includes(query))
    .filter((product) => categoryFilter === PRODUCT_CATEGORY_ALL || product.category === categoryFilter)
    .sort((first, second) => {
      const firstMargin = calculateMargin(first.sale_price, first.calculated_cost || 0)
      const secondMargin = calculateMargin(second.sale_price, second.calculated_cost || 0)

      if (sortBy === 'price_desc') return second.sale_price - first.sale_price
      if (sortBy === 'price_asc') return first.sale_price - second.sale_price
      if (sortBy === 'margin_desc') return secondMargin - firstMargin
      if (sortBy === 'sales_desc') return (second.actual_sales_30d || 0) - (first.actual_sales_30d || 0)
      return first.name.localeCompare(second.name, 'tr-TR')
    })

  const activeCategories = categoryFilter === PRODUCT_CATEGORY_ALL ? categories : [categoryFilter]
  return activeCategories
    .map((category) => ({
      cat: category,
      items: visibleProducts.filter((product) => product.category === category),
    }))
    .filter((group) => group.items.length > 0)
}

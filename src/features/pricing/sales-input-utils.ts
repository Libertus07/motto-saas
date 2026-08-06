import type { Product } from './types'

export function getProductCategories(products: Product[]) {
  return ['Tümü', ...new Set(products.map((product) => product.category || 'Diğer'))]
}

export function filterSalesProducts(products: Product[], search: string, category: string) {
  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
  return products.filter((product) => {
    const searchable = `${product.name} ${product.category || ''}`.toLocaleLowerCase('tr-TR')
    const matchesCategory = category === 'Tümü' || (product.category || 'Diğer') === category
    return searchable.includes(normalizedSearch) && matchesCategory
  })
}

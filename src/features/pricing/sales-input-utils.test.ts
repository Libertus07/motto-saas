import { describe, expect, it } from 'vitest'

import { filterSalesProducts, getProductCategories } from './sales-input-utils'
import type { Product } from './types'

const products: Product[] = [
  { id: '1', name: 'Magnolia', category: 'Tatlı', sale_price: 200, estimated_monthly_sales: 5 },
  { id: '2', name: 'Latte', category: 'İçecek', sale_price: 100, estimated_monthly_sales: 10 },
]

describe('sales input utilities', () => {
  it('benzersiz kategorileri Tümü seçeneğiyle döndürür', () =>
    expect(getProductCategories(products)).toEqual(['Tümü', 'Tatlı', 'İçecek']))
  it('Türkçe arama ve kategoriyi birlikte uygular', () =>
    expect(filterSalesProducts(products, 'lat', 'İçecek').map((product) => product.id)).toEqual(['2']))
})

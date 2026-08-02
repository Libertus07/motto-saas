import { describe, expect, it } from 'vitest'

import type { Product } from './types'
import {
  createAutoCategorySuggestions,
  createBulkUpdatePlan,
  createProductBulkRows,
  createProductFormPayload,
  getProductCategories,
  groupVisibleProducts,
  PRODUCT_CATEGORY_ALL,
} from './workspace-utils'

const products: Product[] = [
  {
    id: 'latte',
    name: 'Caffè Latte',
    category: 'Sıcak Kahveler',
    sale_price: 120,
    estimated_monthly_sales: 50,
    calculated_cost: 30,
    actual_sales_30d: 20,
  },
  {
    id: 'tea',
    name: 'Çay',
    category: 'Çaylar',
    sale_price: 30,
    estimated_monthly_sales: 100,
    calculated_cost: 5,
    actual_sales_30d: 80,
  },
]

describe('product workspace rules', () => {
  it('builds categories and Turkish-aware filtered groups', () => {
    const categories = getProductCategories(products)
    expect(categories).toContain('Sıcak Kahveler')
    expect(groupVisibleProducts(products, categories, 'çay', PRODUCT_CATEGORY_ALL, 'name')).toEqual([
      { cat: 'Çaylar', items: [products[1]] },
    ])
  })

  it('parses valid forms and rejects invalid numeric values', () => {
    expect(
      createProductFormPayload({
        name: '  Latte  ',
        category: 'Kahve',
        sale_price: '125.5',
        estimated_monthly_sales: '20',
      }),
    ).toEqual({ name: 'Latte', category: 'Kahve', salePrice: 125.5, estimatedMonthlySales: 20 })
    expect(
      createProductFormPayload({
        name: 'Latte',
        category: 'Kahve',
        sale_price: '-1',
        estimated_monthly_sales: '20',
      }),
    ).toBeNull()
    expect(
      createProductFormPayload({
        name: 'Latte',
        category: 'Kahve',
        sale_price: '100',
        estimated_monthly_sales: '2.5',
      }),
    ).toBeNull()
  })

  it('creates validated bulk updates and audit details', () => {
    const rows = createProductBulkRows(products)
    rows.latte.sale_price = '130'
    const plan = createBulkUpdatePlan(products, rows, new Set(['latte']))

    expect(plan?.updates).toEqual([
      { id: 'latte', sale_price: 130, estimated_monthly_sales: 50, category: 'Sıcak Kahveler' },
    ])
    expect(plan?.details[0]).toContain('Fiyat: 120->130')
  })

  it('keeps only category suggestions that change a product', () => {
    expect(
      createAutoCategorySuggestions(products, [
        { id: 'latte', suggested_category: 'Sıcak Kahveler' },
        { id: 'tea', suggested_category: 'Sıcak İçecekler' },
      ]),
    ).toEqual([{ id: 'tea', name: 'Çay', current: 'Çaylar', suggested: 'Sıcak İçecekler' }])
  })
})

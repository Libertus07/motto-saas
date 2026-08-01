import { describe, expect, it } from 'vitest'

import { buildProductWorkspace } from './product-service'

describe('buildProductWorkspace', () => {
  it('calculates material, sub-recipe, product costs and recent sales', () => {
    const workspace = buildProductWorkspace({
      materials: [{ id: 'coffee', name: 'Kahve', unit: 'g', price_per_unit: 0.5 }],
      subRecipes: [
        {
          id: 'sauce',
          name: 'Sos',
          yield_quantity: 10,
          yield_unit: 'ml',
          wastage_percent: 20,
        },
      ],
      subRecipeIngredients: [{ sub_recipe_id: 'sauce', material_id: 'coffee', quantity: 10 }],
      products: [
        {
          id: 'latte',
          name: 'Latte',
          category: 'Sıcak Kahveler',
          sale_price: 100,
          estimated_monthly_sales: 20,
        },
      ],
      productIngredients: [
        { product_id: 'latte', material_id: 'coffee', sub_recipe_id: null, quantity: 4 },
        { product_id: 'latte', material_id: null, sub_recipe_id: 'sauce', quantity: 5 },
      ],
      recentSales: [
        { product_id: 'latte', quantity: 3 },
        { product_id: 'latte', quantity: 2 },
      ],
    })

    expect(workspace.subRecipes[0].cost_per_yield).toBeCloseTo(0.6)
    expect(workspace.products[0].calculated_cost).toBeCloseTo(5)
    expect(workspace.products[0].actual_sales_30d).toBe(5)
  })

  it('uses zero for missing references and zero-yield recipes', () => {
    const workspace = buildProductWorkspace({
      materials: [],
      subRecipes: [{ id: 'empty', name: 'Boş', yield_quantity: 0, yield_unit: 'g', wastage_percent: 10 }],
      subRecipeIngredients: [{ sub_recipe_id: 'empty', material_id: 'missing', quantity: 4 }],
      products: [{ id: 'product', name: 'Ürün', category: 'Diğer', sale_price: 10, estimated_monthly_sales: 0 }],
      productIngredients: [{ product_id: 'product', material_id: 'missing', sub_recipe_id: null, quantity: 3 }],
      recentSales: [],
    })

    expect(workspace.subRecipes[0].cost_per_yield).toBe(0)
    expect(workspace.products[0].calculated_cost).toBe(0)
    expect(workspace.products[0].actual_sales_30d).toBe(0)
  })
})

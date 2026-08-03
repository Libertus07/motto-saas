import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { buildPricingProducts, savePricingCalculations } from './pricing-service'

const product = {
  id: 'latte',
  name: 'Latte',
  category: 'Kahve',
  sale_price: 100,
  estimated_monthly_sales: 20,
}

describe('pricing workspace', () => {
  it('calculates direct material and wastage-adjusted sub-recipe costs', () => {
    const [pricedProduct] = buildPricingProducts({
      products: [product],
      materials: [{ id: 'coffee', price_per_unit: 0.5 }],
      recipes: [{ id: 'sauce', yield_quantity: 10, wastage_percent: 20 }],
      recipeIngredients: [{ sub_recipe_id: 'sauce', material_id: 'coffee', quantity: 10 }],
      productIngredients: [
        { product_id: 'latte', material_id: 'coffee', sub_recipe_id: null, quantity: 4 },
        { product_id: 'latte', material_id: null, sub_recipe_id: 'sauce', quantity: 5 },
      ],
    })

    expect(pricedProduct.calculated_cost).toBeCloseTo(5)
  })

  it('uses zero for missing references and zero-yield recipes', () => {
    const [pricedProduct] = buildPricingProducts({
      products: [product],
      materials: [],
      recipes: [{ id: 'empty', yield_quantity: 0, wastage_percent: 10 }],
      recipeIngredients: [{ sub_recipe_id: 'empty', material_id: 'missing', quantity: 3 }],
      productIngredients: [
        { product_id: 'latte', material_id: 'missing', sub_recipe_id: null, quantity: 2 },
        { product_id: 'latte', material_id: null, sub_recipe_id: 'empty', quantity: 4 },
      ],
    })

    expect(pricedProduct.calculated_cost).toBe(0)
  })
})

describe('pricing mutation service', () => {
  it('saves every cost and the margin with one tenant-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })
    const supabase = { rpc } as unknown as SupabaseClient
    const updates = [
      { id: 'p1', total_cost: 12.5 },
      { id: 'p2', total_cost: 8 },
    ]

    await expect(savePricingCalculations(supabase, 'org-1', updates, 35)).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('save_pricing_calculations', {
      p_organization_id: 'org-1',
      p_updates: updates,
      p_target_margin: 35,
      p_audit_details: { source: 'pricing_engine' },
    })
  })

  it('surfaces an RPC error instead of reporting a false success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Yetkisiz işlem' } })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(savePricingCalculations(supabase, 'org-2', [{ id: 'p1', total_cost: 1 }], 30)).rejects.toThrow(
      'Yetkisiz işlem',
    )
  })
})

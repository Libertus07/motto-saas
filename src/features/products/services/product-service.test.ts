import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'

import { buildProductWorkspace, bulkUpdateProducts, deleteProduct, saveProductWithRecipe } from './product-service'

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

describe('product mutation service', () => {
  it('sends product and recipe data through one atomic RPC call', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'product-1', error: null })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(
      saveProductWithRecipe(supabase, 'org-1', {
        name: 'Latte',
        category: 'Sıcak Kahveler',
        salePrice: 120,
        estimatedMonthlySales: 40,
        ingredients: [{ type: 'material', item_id: 'material-1', quantity: 18 }],
        auditDetails: { detay: 'Yeni ürün' },
      }),
    ).resolves.toBe('product-1')

    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('save_product_with_recipe', {
      p_organization_id: 'org-1',
      p_product_id: null,
      p_name: 'Latte',
      p_category: 'Sıcak Kahveler',
      p_sale_price: 120,
      p_estimated_monthly_sales: 40,
      p_ingredients: [{ type: 'material', item_id: 'material-1', quantity: 18 }],
      p_audit_details: { detay: 'Yeni ürün' },
    })
  })

  it('uses one RPC call for a batch of product updates', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })
    const supabase = { rpc } as unknown as SupabaseClient
    const updates = [
      { id: 'p1', sale_price: 10, estimated_monthly_sales: 5, category: 'Kahve' },
      { id: 'p2', sale_price: 20, estimated_monthly_sales: 6, category: 'Çay' },
    ]

    await expect(
      bulkUpdateProducts(supabase, 'org-1', updates, 'İki ürün güncellendi.', { kaynak: 'test' }),
    ).resolves.toBe(2)

    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('bulk_update_products', {
      p_organization_id: 'org-1',
      p_updates: updates,
      p_description: 'İki ürün güncellendi.',
      p_audit_details: { kaynak: 'test' },
    })
  })

  it('deletes a product through the tenant-scoped RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(deleteProduct(supabase, 'org-1', 'product-1')).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('delete_product', {
      p_organization_id: 'org-1',
      p_product_id: 'product-1',
    })
  })

  it('surfaces database errors instead of reporting a false success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Yetkisiz işlem' } })
    const supabase = { rpc } as unknown as SupabaseClient

    await expect(deleteProduct(supabase, 'org-2', 'product-1')).rejects.toThrow('Yetkisiz işlem')
  })
})

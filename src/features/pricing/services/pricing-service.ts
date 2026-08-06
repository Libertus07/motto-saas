import type { SupabaseClient } from '@supabase/supabase-js'

import type { Expense, PricingSettings, Product, RealSalesMeta } from '../types'

type MaterialRow = { id: string; price_per_unit: number | string | null }
type RecipeRow = { id: string; yield_quantity: number | string | null; wastage_percent: number | string | null }
type RecipeIngredientRow = { sub_recipe_id: string; material_id: string; quantity: number | string }
type ProductIngredientRow = {
  product_id: string
  material_id: string | null
  sub_recipe_id: string | null
  quantity: number | string
}
type SaleRow = { product_id: string; quantity: number | string; sale_date: string }
type PricingSettingRow = { key: string; value: unknown }

export type PricingWorkspaceInput = {
  products: Omit<Product, 'calculated_cost'>[]
  materials: MaterialRow[]
  recipes: RecipeRow[]
  recipeIngredients: RecipeIngredientRow[]
  productIngredients: ProductIngredientRow[]
}

export type PricingCostUpdate = {
  id: string
  total_cost: number
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = { targetMargin: 60, taxRate: 10 }

export type PricingWorkspaceData = {
  products: Product[]
  expenses: Expense[]
  realSalesMeta: RealSalesMeta
  settings: PricingSettings
}

export async function fetchPricingWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PricingWorkspaceData> {
  const results = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category, sale_price, estimated_monthly_sales')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase.from('expenses').select('amount, period, category, expense_date').eq('organization_id', organizationId),
    supabase.from('sales').select('product_id, quantity, sale_date').eq('organization_id', organizationId),
    supabase.from('settings').select('key, value').eq('organization_id', organizationId),
    supabase.from('materials').select('id, price_per_unit').eq('organization_id', organizationId),
    supabase.from('sub_recipes').select('id, yield_quantity, wastage_percent').eq('organization_id', organizationId),
    supabase
      .from('sub_recipe_ingredients')
      .select('sub_recipe_id, material_id, quantity')
      .eq('organization_id', organizationId),
    supabase
      .from('product_ingredients')
      .select('product_id, material_id, sub_recipe_id, quantity')
      .eq('organization_id', organizationId),
  ])

  const queryError = results.find((result) => result.error)?.error
  if (queryError) throw new Error(queryError.message)

  const products = (results[0].data ?? []) as Omit<Product, 'calculated_cost'>[]
  const expenses = (results[1].data ?? []) as Expense[]
  const sales = (results[2].data ?? []) as SaleRow[]
  const settings = (results[3].data ?? []) as PricingSettingRow[]
  const materials = (results[4].data ?? []) as MaterialRow[]
  const recipes = (results[5].data ?? []) as RecipeRow[]
  const recipeIngredients = (results[6].data ?? []) as RecipeIngredientRow[]
  const productIngredients = (results[7].data ?? []) as ProductIngredientRow[]
  const targetMargin = Number(settings.find((row) => row.key === 'target_margin')?.value)
  const taxRate = Number(settings.find((row) => row.key === 'default_vat')?.value)
  const salesByProduct: Record<string, number> = {}
  for (const sale of sales) {
    salesByProduct[sale.product_id] = (salesByProduct[sale.product_id] ?? 0) + Number(sale.quantity)
  }

  return {
    products: buildPricingProducts({ products, materials, recipes, recipeIngredients, productIngredients }),
    expenses: expenses as Expense[],
    realSalesMeta: {
      activeDays: Math.max(1, new Set(sales.map((sale) => sale.sale_date)).size),
      salesByProduct,
    },
    settings: {
      targetMargin: Number.isFinite(targetMargin) ? targetMargin : DEFAULT_PRICING_SETTINGS.targetMargin,
      taxRate: Number.isFinite(taxRate) ? taxRate : DEFAULT_PRICING_SETTINGS.taxRate,
    },
  }
}

export function buildPricingProducts(input: PricingWorkspaceInput): Product[] {
  const materialPriceById = new Map(
    input.materials.map((material) => [material.id, Number(material.price_per_unit ?? 0)]),
  )
  const recipeIngredientsByRecipeId = new Map<string, RecipeIngredientRow[]>()
  for (const ingredient of input.recipeIngredients) {
    const current = recipeIngredientsByRecipeId.get(ingredient.sub_recipe_id) ?? []
    current.push(ingredient)
    recipeIngredientsByRecipeId.set(ingredient.sub_recipe_id, current)
  }

  const recipeCostById = new Map<string, number>()
  for (const recipe of input.recipes) {
    const rawCost = (recipeIngredientsByRecipeId.get(recipe.id) ?? []).reduce(
      (total, ingredient) => total + (materialPriceById.get(ingredient.material_id) ?? 0) * Number(ingredient.quantity),
      0,
    )
    const costWithWastage = rawCost * (1 + Number(recipe.wastage_percent ?? 0) / 100)
    const yieldQuantity = Number(recipe.yield_quantity ?? 0)
    recipeCostById.set(recipe.id, yieldQuantity > 0 ? costWithWastage / yieldQuantity : 0)
  }

  const ingredientsByProductId = new Map<string, ProductIngredientRow[]>()
  for (const ingredient of input.productIngredients) {
    const current = ingredientsByProductId.get(ingredient.product_id) ?? []
    current.push(ingredient)
    ingredientsByProductId.set(ingredient.product_id, current)
  }

  return input.products.map((product) => {
    const calculatedCost = (ingredientsByProductId.get(product.id) ?? []).reduce((total, ingredient) => {
      if (ingredient.material_id) {
        return total + (materialPriceById.get(ingredient.material_id) ?? 0) * Number(ingredient.quantity)
      }
      if (ingredient.sub_recipe_id) {
        return total + (recipeCostById.get(ingredient.sub_recipe_id) ?? 0) * Number(ingredient.quantity)
      }
      return total
    }, 0)

    return { ...product, calculated_cost: calculatedCost }
  })
}

export async function savePricingCalculations(
  supabase: SupabaseClient,
  organizationId: string,
  updates: PricingCostUpdate[],
  targetMargin: number,
): Promise<number> {
  const { data, error } = await supabase.rpc('save_pricing_calculations', {
    p_organization_id: organizationId,
    p_updates: updates,
    p_target_margin: targetMargin,
    p_audit_details: { source: 'pricing_engine' },
  })

  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Product } from '../types'

type MaterialRow = { id: string; price_per_unit: number | string | null }
type RecipeRow = { id: string; yield_quantity: number | string | null; wastage_percent: number | string | null }
type RecipeIngredientRow = { sub_recipe_id: string; material_id: string; quantity: number | string }
type ProductIngredientRow = {
  product_id: string
  material_id: string | null
  sub_recipe_id: string | null
  quantity: number | string
}

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

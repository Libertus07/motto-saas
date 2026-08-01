import type { SupabaseClient } from '@supabase/supabase-js'

import type { Product, ProductMaterial, SubRecipe } from '@/features/products/types'

type SubRecipeIngredientRow = {
  sub_recipe_id: string
  material_id: string
  quantity: number
}

type ProductIngredientRow = {
  product_id: string
  material_id: string | null
  sub_recipe_id: string | null
  quantity: number
}

type SaleRow = {
  product_id: string
  quantity: number
}

type ProductWorkspaceInput = {
  materials: ProductMaterial[]
  subRecipes: Omit<SubRecipe, 'cost_per_yield'>[]
  subRecipeIngredients: SubRecipeIngredientRow[]
  products: Omit<Product, 'calculated_cost' | 'actual_sales_30d'>[]
  productIngredients: ProductIngredientRow[]
  recentSales: SaleRow[]
}

export type ProductWorkspace = {
  materials: ProductMaterial[]
  subRecipes: SubRecipe[]
  products: Product[]
}

export function buildProductWorkspace({
  materials,
  subRecipes,
  subRecipeIngredients,
  products,
  productIngredients,
  recentSales,
}: ProductWorkspaceInput): ProductWorkspace {
  const materialPriceById = new Map(materials.map((material) => [material.id, material.price_per_unit]))
  const subRecipeIngredientsById = new Map<string, SubRecipeIngredientRow[]>()
  const productIngredientsById = new Map<string, ProductIngredientRow[]>()
  const salesByProductId = new Map<string, number>()

  for (const ingredient of subRecipeIngredients) {
    const recipeIngredients = subRecipeIngredientsById.get(ingredient.sub_recipe_id) ?? []
    recipeIngredients.push(ingredient)
    subRecipeIngredientsById.set(ingredient.sub_recipe_id, recipeIngredients)
  }

  const processedSubRecipes = subRecipes.map((recipe) => {
    const totalCost = (subRecipeIngredientsById.get(recipe.id) ?? []).reduce((sum, ingredient) => {
      return sum + (materialPriceById.get(ingredient.material_id) ?? 0) * ingredient.quantity
    }, 0)
    const costWithWastage = totalCost * (1 + recipe.wastage_percent / 100)

    return {
      ...recipe,
      cost_per_yield: recipe.yield_quantity > 0 ? costWithWastage / recipe.yield_quantity : 0,
    }
  })

  const subRecipeCostById = new Map(processedSubRecipes.map((recipe) => [recipe.id, recipe.cost_per_yield ?? 0]))

  for (const ingredient of productIngredients) {
    const ingredients = productIngredientsById.get(ingredient.product_id) ?? []
    ingredients.push(ingredient)
    productIngredientsById.set(ingredient.product_id, ingredients)
  }

  for (const sale of recentSales) {
    salesByProductId.set(sale.product_id, (salesByProductId.get(sale.product_id) ?? 0) + sale.quantity)
  }

  const processedProducts = products.map((product) => {
    const calculatedCost = (productIngredientsById.get(product.id) ?? []).reduce((sum, ingredient) => {
      if (ingredient.material_id) {
        return sum + (materialPriceById.get(ingredient.material_id) ?? 0) * ingredient.quantity
      }

      if (ingredient.sub_recipe_id) {
        return sum + (subRecipeCostById.get(ingredient.sub_recipe_id) ?? 0) * ingredient.quantity
      }

      return sum
    }, 0)

    return {
      ...product,
      calculated_cost: calculatedCost,
      actual_sales_30d: salesByProductId.get(product.id) ?? 0,
    }
  })

  return { materials, subRecipes: processedSubRecipes, products: processedProducts }
}

export async function fetchProductWorkspace(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<ProductWorkspace> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const salesStartDate = thirtyDaysAgo.toISOString().split('T')[0]

  const [
    materialsResult,
    subRecipesResult,
    subRecipeIngredientsResult,
    productsResult,
    productIngredientsResult,
    recentSalesResult,
  ] = await Promise.all([
    supabase
      .from('materials')
      .select('id, name, unit, price_per_unit')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('sub_recipes')
      .select('id, name, yield_quantity, yield_unit, wastage_percent')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('sub_recipe_ingredients')
      .select('sub_recipe_id, material_id, quantity')
      .eq('organization_id', organizationId),
    supabase
      .from('products')
      .select('id, name, category, sale_price, estimated_monthly_sales')
      .eq('organization_id', organizationId)
      .order('name'),
    supabase
      .from('product_ingredients')
      .select('product_id, material_id, sub_recipe_id, quantity')
      .eq('organization_id', organizationId),
    supabase
      .from('sales')
      .select('product_id, quantity')
      .eq('organization_id', organizationId)
      .gte('sale_date', salesStartDate),
  ])

  const firstError = [
    materialsResult,
    subRecipesResult,
    subRecipeIngredientsResult,
    productsResult,
    productIngredientsResult,
    recentSalesResult,
  ].find((result) => result.error)?.error

  if (firstError) throw firstError

  return buildProductWorkspace({
    materials: materialsResult.data ?? [],
    subRecipes: subRecipesResult.data ?? [],
    subRecipeIngredients: subRecipeIngredientsResult.data ?? [],
    products: productsResult.data ?? [],
    productIngredients: productIngredientsResult.data ?? [],
    recentSales: recentSalesResult.data ?? [],
  })
}

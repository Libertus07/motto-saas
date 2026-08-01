import type { Product, ProductIngredient, ProductMaterial, SubRecipe } from './types'

export function calculateRecipeCost(
  ingredients: ProductIngredient[],
  materials: ProductMaterial[],
  subRecipes: SubRecipe[],
) {
  return ingredients.reduce((total, ingredient) => {
    if (!ingredient.item_id || !ingredient.quantity) return total

    if (ingredient.type === 'material') {
      const material = materials.find((item) => item.id === ingredient.item_id)
      return material ? total + material.price_per_unit * ingredient.quantity : total
    }

    const subRecipe = subRecipes.find((item) => item.id === ingredient.item_id)
    return subRecipe?.cost_per_yield ? total + subRecipe.cost_per_yield * ingredient.quantity : total
  }, 0)
}

export function calculateMargin(salePrice: number, cost: number) {
  return salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : 0
}

export function calculateProductMetrics(products: Product[]) {
  const totalRevenue = products.reduce(
    (total, product) => total + product.sale_price * (product.actual_sales_30d || 0),
    0,
  )
  const totalEstimatedContribution = products.reduce(
    (total, product) =>
      total + (product.sale_price - (product.calculated_cost || 0)) * (product.estimated_monthly_sales || 0),
    0,
  )
  const averageMargin =
    products.length === 0
      ? 0
      : products.reduce(
          (total, product) => total + calculateMargin(product.sale_price, product.calculated_cost || 0),
          0,
        ) / products.length

  return { totalRevenue, totalEstimatedContribution, averageMargin }
}

export function getMarginColorClass(margin: number) {
  if (margin >= 50) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (margin >= 30) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  return 'text-rose-400 bg-rose-500/10 border-rose-500/20'
}

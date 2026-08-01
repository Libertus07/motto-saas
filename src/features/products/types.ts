export type ProductMaterial = {
  id: string
  name: string
  unit: string
  price_per_unit: number
}

export type SubRecipe = {
  id: string
  name: string
  yield_quantity: number
  yield_unit: string
  wastage_percent: number
  cost_per_yield?: number
}

export type ProductIngredient = {
  type: 'material' | 'sub_recipe'
  item_id: string
  quantity: number
}

export type Product = {
  id: string
  name: string
  category: string
  sale_price: number
  estimated_monthly_sales: number
  calculated_cost?: number
  actual_sales_30d?: number
}

export type ProductSort = 'name' | 'price_desc' | 'price_asc' | 'margin_desc' | 'sales_desc'

export type ProductBulkRow = {
  id: string
  sale_price: string
  estimated_monthly_sales: string
  category: string
}

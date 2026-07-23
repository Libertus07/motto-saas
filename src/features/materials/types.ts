export type Material = {
  id: string
  name: string
  unit: string
  price_per_unit: number
  stock_quantity: number
  category?: string
  critical_stock_level?: number
}

export type PriceHistory = {
  id: string
  old_price: number
  new_price: number
  source: string
  created_at: string
}

export type EditRow = {
  id: string
  name: string
  unit: string
  price_per_unit: string
  stock_quantity: string
  critical_stock_level: string
  category: string
}

export type AutoCatSuggestion = {
  id: string
  name: string
  current: string
  suggested: string
}

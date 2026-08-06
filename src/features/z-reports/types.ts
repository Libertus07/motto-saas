export type ZReportProduct = { id: string; name: string; category: string }
export type ZReportAccount = { id: string; name: string; type: string }

export type ParsedSaleItem = {
  product_name: string
  quantity: number
  total_price: number
  matchedProductId?: string
}

export type ParsedExpenseItem = {
  expense_name: string
  amount: number
  category?: string
}

export type PaymentMethods = { cash: number; credit_card: number; other: number }

export type ParsedZReport = {
  date: string
  total_revenue: number
  payment_methods?: PaymentMethods
  items: ParsedSaleItem[]
  expenses: ParsedExpenseItem[]
  discounts?: { total_amount: number; details?: string[] }
}

export type NewZReportProduct = {
  isOpen: boolean
  itemIndex: number
  name: string
  price: number
  category: string
}

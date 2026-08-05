import type { Product, ProductSales } from '../../types'

export type SalesProductViewProps = {
  products: Product[]
  productSales: ProductSales
  totalDailyRevenue: number
  updateSales: (productId: string, field: 'dailySales', value: number) => void
  adjustSalesByDelta: (productId: string, delta: number) => void
}

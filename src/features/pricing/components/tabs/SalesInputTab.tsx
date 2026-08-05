import { useMemo, useState } from 'react'

import { filterSalesProducts, getProductCategories } from '../../sales-input-utils'
import type { Product, ProductSales, RealSalesMeta } from '../../types'
import { SalesDesktopTable } from '../sales/SalesDesktopTable'
import { SalesInputBanner } from '../sales/SalesInputBanner'
import { SalesInputFilters } from '../sales/SalesInputFilters'
import { SalesMobileCards } from '../sales/SalesMobileCards'

type SalesInputTabProps = {
  products: Product[]
  productSales: ProductSales
  realSalesMeta: RealSalesMeta | null
  totalDailyRevenue: number
  updateSales: (productId: string, field: 'dailySales', value: number) => void
  adjustSalesByDelta: (productId: string, delta: number) => void
}

export function SalesInputTab(props: SalesInputTabProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('Tümü')
  const categories = useMemo(() => getProductCategories(props.products), [props.products])
  const products = useMemo(
    () => filterSalesProducts(props.products, search, category),
    [category, props.products, search],
  )
  const viewProps = { ...props, products }

  return (
    <div className="space-y-4">
      <SalesInputBanner realSalesMeta={props.realSalesMeta} />
      <SalesInputFilters
        search={search}
        category={category}
        categories={categories}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
      />
      <div className="overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 shadow-xl backdrop-blur-md">
        <SalesDesktopTable {...viewProps} />
        <SalesMobileCards {...viewProps} />
      </div>
    </div>
  )
}

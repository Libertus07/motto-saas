import { useMemo } from 'react'

import { Input } from '@/components/ui/input'
import type { Product, ProductSort } from '@/features/products/types'

type ProductFiltersProps = {
  search: string
  onSearchChange: (value: string) => void
  categoryFilter: string
  onCategoryFilterChange: (value: string) => void
  products: Product[]
  categories: string[]
  sortBy: ProductSort
  onSortChange: (value: ProductSort) => void
  allCategoriesOpen: boolean
  onToggleAll: () => void
}

export function ProductFilters({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  products,
  categories,
  sortBy,
  onSortChange,
  allCategoriesOpen,
  onToggleAll,
}: ProductFiltersProps) {
  const categoryCounts = useMemo(() => {
    return products.reduce<Map<string, number>>((counts, product) => {
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1)
      return counts
    }, new Map())
  }, [products])

  return (
    <div
      id="tour-products-filters"
      className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
    >
      <div className="flex-1 relative">
        <span aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
          🔍
        </span>
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Ürün adı ile hızlı ara..."
          aria-label="Ürün ara"
          className="pl-9 pr-8"
        />
        {search.length > 0 ? (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Aramayı temizle"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs"
          >
            ✕
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={categoryFilter}
          onChange={(event) => onCategoryFilterChange(event.target.value)}
          aria-label="Ürün kategorisi"
          className="w-full sm:w-auto bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-amber-500/50 cursor-pointer"
        >
          <option value="Tümü">Tüm Kategoriler ({products.length})</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category} ({categoryCounts.get(category) ?? 0})
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={(event) => onSortChange(event.target.value as ProductSort)}
          aria-label="Ürün sıralaması"
          className="w-full sm:w-auto bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-amber-500/50 cursor-pointer"
        >
          <option value="name">İsme Göre (A-Z)</option>
          <option value="price_desc">Fiyat (En Yüksek)</option>
          <option value="price_asc">Fiyat (En Düşük)</option>
          <option value="margin_desc">Kar Marjı (En Yüksek)</option>
          <option value="sales_desc">Son 30G Satış (En Çok)</option>
        </select>

        <button
          type="button"
          onClick={onToggleAll}
          className="w-full sm:w-auto bg-stone-950 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-semibold px-3 py-2 border border-stone-800 rounded-xl whitespace-nowrap transition-colors"
        >
          {allCategoriesOpen ? '▲ Tümünü Kapat' : '▼ Tümünü Aç'}
        </button>
      </div>
    </div>
  )
}

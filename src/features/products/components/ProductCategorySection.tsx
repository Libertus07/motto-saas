import type { Product, ProductBulkRow } from '@/features/products/types'
import { calculateMargin, getMarginColorClass } from '@/features/products/utils'

import { ProductDesktopTable } from './ProductDesktopTable'
import { ProductMobileCards } from './ProductMobileCards'

type ProductCategorySectionProps = {
  category: string
  products: Product[]
  isOpen: boolean
  bulkEditMode: boolean
  bulkRows: Record<string, ProductBulkRow>
  changedIds: ReadonlySet<string>
  editingId: string | null
  onToggle: () => void
  onBulkRowChange: (id: string, field: keyof ProductBulkRow, value: string) => void
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductCategorySection({
  category,
  products,
  isOpen,
  bulkEditMode,
  bulkRows,
  changedIds,
  editingId,
  onToggle,
  onBulkRowChange,
  onEdit,
  onDelete,
}: ProductCategorySectionProps) {
  const averageMargin =
    products.reduce((total, product) => total + calculateMargin(product.sale_price, product.calculated_cost ?? 0), 0) /
    products.length

  return (
    <section className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl transition-all">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-stone-800/40 transition-colors group select-none"
      >
        <span className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 text-stone-400 text-xs transition-transform duration-200"
            style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            ▶
          </span>
          <span className="truncate font-extrabold text-stone-100 text-sm sm:text-base">{category}</span>
          <span className="shrink-0 bg-stone-800 text-stone-400 border border-stone-700 text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-semibold">
            {products.length} ürün
          </span>
        </span>

        <span
          className={`shrink-0 ml-2 font-bold text-xs sm:text-sm px-2 py-0.5 rounded-lg border ${getMarginColorClass(averageMargin)}`}
        >
          Ort. %{averageMargin.toFixed(1)}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t border-stone-800/80">
          <ProductDesktopTable
            products={products}
            bulkEditMode={bulkEditMode}
            bulkRows={bulkRows}
            changedIds={changedIds}
            editingId={editingId}
            onBulkRowChange={onBulkRowChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <ProductMobileCards
            products={products}
            bulkEditMode={bulkEditMode}
            bulkRows={bulkRows}
            changedIds={changedIds}
            onBulkRowChange={onBulkRowChange}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      ) : null}
    </section>
  )
}

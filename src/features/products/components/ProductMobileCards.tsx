import type { Product, ProductBulkRow } from '@/features/products/types'
import { calculateMargin, getMarginColorClass } from '@/features/products/utils'

type ProductMobileCardsProps = {
  products: Product[]
  bulkEditMode: boolean
  bulkRows: Record<string, ProductBulkRow>
  changedIds: ReadonlySet<string>
  onBulkRowChange: (id: string, field: keyof ProductBulkRow, value: string) => void
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductMobileCards({
  products,
  bulkEditMode,
  bulkRows,
  changedIds,
  onBulkRowChange,
  onEdit,
  onDelete,
}: ProductMobileCardsProps) {
  return (
    <div className="md:hidden divide-y divide-stone-800/60">
      {products.map((product) => {
        const cost = product.calculated_cost ?? 0
        const margin = calculateMargin(product.sale_price, cost)
        const bulkRow = bulkRows[product.id]

        if (bulkEditMode && bulkRow) {
          const isChanged = changedIds.has(product.id)
          return (
            <div key={product.id} className={`p-4 space-y-3 ${isChanged ? 'bg-amber-500/10' : ''}`}>
              <div className="flex justify-between items-center gap-3">
                <span className="min-w-0 truncate font-bold text-white text-sm">{product.name}</span>
                {isChanged ? <span className="shrink-0 text-amber-400 text-xs font-bold">● Değişti</span> : null}
              </div>
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 text-xs">
                <label className="block">
                  <span className="text-stone-400 block mb-1">Satış Fiyatı (₺)</span>
                  <input
                    type="number"
                    value={bulkRow.sale_price}
                    onChange={(event) => onBulkRowChange(product.id, 'sale_price', event.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-stone-400 block mb-1">Tahmini Satış</span>
                  <input
                    type="number"
                    value={bulkRow.estimated_monthly_sales}
                    onChange={(event) => onBulkRowChange(product.id, 'estimated_monthly_sales', event.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                  />
                </label>
              </div>
            </div>
          )
        }

        return (
          <article key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
            <div className="flex items-center justify-between gap-3">
              <h4 className="min-w-0 truncate font-bold text-white text-sm sm:text-base">{product.name}</h4>
              <span
                className={`shrink-0 font-bold text-xs px-2 py-0.5 rounded-lg border ${getMarginColorClass(margin)}`}
              >
                %{margin.toFixed(1)} Kar
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
              <div>
                <span className="text-stone-400 block text-[10px]">Food Cost</span>
                <span className="font-semibold text-stone-200">₺{cost.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px]">Satış Fiyatı</span>
                <span className="font-extrabold text-amber-400">₺{product.sale_price.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px]">Tahmini Satış</span>
                <span className="text-stone-300">{product.estimated_monthly_sales} adet</span>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px]">Son 30G Satış</span>
                <span className="font-bold text-amber-400">{product.actual_sales_30d ?? 0} adet</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onEdit(product)}
                className="min-h-9 px-3 py-1.5 bg-stone-800 text-stone-200 hover:text-white rounded-lg text-xs font-semibold border border-stone-700"
              >
                ✏️ Düzenle
              </button>
              <button
                type="button"
                onClick={() => onDelete(product.id)}
                className="min-h-9 px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-semibold border border-red-500/20"
              >
                🗑️ Sil
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

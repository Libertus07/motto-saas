import type { Product, ProductBulkRow } from '@/features/products/types'
import { calculateMargin, getMarginColorClass } from '@/features/products/utils'

const bulkInputClassName =
  'w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-amber-500'

type ProductDesktopTableProps = {
  products: Product[]
  bulkEditMode: boolean
  bulkRows: Record<string, ProductBulkRow>
  changedIds: ReadonlySet<string>
  editingId: string | null
  onBulkRowChange: (id: string, field: keyof ProductBulkRow, value: string) => void
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductDesktopTable({
  products,
  bulkEditMode,
  bulkRows,
  changedIds,
  editingId,
  onBulkRowChange,
  onEdit,
  onDelete,
}: ProductDesktopTableProps) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
            <th className="px-5 py-3">Ürün Adı</th>
            <th className="px-4 py-3 text-right">Food Cost</th>
            <th className="px-4 py-3 text-right">Satış Fiyatı</th>
            <th className="px-4 py-3 text-right">Tahmini Aylık</th>
            <th className="px-4 py-3 text-right text-amber-400">Son 30G Satış</th>
            <th className="px-4 py-3 text-right">Kâr Marjı</th>
            <th className="px-5 py-3 text-right">{bulkEditMode ? 'Durum' : 'İşlem'}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
          {products.map((product) => {
            const cost = product.calculated_cost ?? 0
            const margin = calculateMargin(product.sale_price, cost)
            const bulkRow = bulkRows[product.id]

            if (bulkEditMode && bulkRow) {
              const isChanged = changedIds.has(product.id)
              return (
                <tr key={product.id} className={`transition-colors ${isChanged ? 'bg-amber-500/10' : ''}`}>
                  <td className="px-5 py-3 font-semibold text-white">{product.name}</td>
                  <td className="px-4 py-3 text-right text-stone-400">₺{cost.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-stone-500 text-xs">₺</span>
                      <input
                        type="number"
                        value={bulkRow.sale_price}
                        onChange={(event) => onBulkRowChange(product.id, 'sale_price', event.target.value)}
                        aria-label={`${product.name} satış fiyatı`}
                        className={`${bulkInputClassName} text-right w-24 font-bold text-amber-400`}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={bulkRow.estimated_monthly_sales}
                      onChange={(event) => onBulkRowChange(product.id, 'estimated_monthly_sales', event.target.value)}
                      aria-label={`${product.name} tahmini aylık satış`}
                      className={`${bulkInputClassName} text-right w-20`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right text-amber-400 font-bold">{product.actual_sales_30d ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold px-2 py-0.5 rounded-lg border ${getMarginColorClass(margin)}`}>
                      %{margin.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-amber-400">
                    {isChanged ? <span>● Değişti</span> : null}
                  </td>
                </tr>
              )
            }

            const isEditing = editingId === product.id

            return (
              <tr
                key={product.id}
                className={`hover:bg-stone-800/30 transition-colors ${isEditing ? 'bg-amber-500/10' : ''}`}
              >
                <td className="px-5 py-3.5 font-bold text-stone-100">{product.name}</td>
                <td className="px-4 py-3.5 text-right text-stone-400 font-medium">₺{cost.toFixed(2)}</td>
                <td className="px-4 py-3.5 text-right text-white font-extrabold text-base">
                  ₺{product.sale_price.toFixed(2)}
                </td>
                <td className="px-4 py-3.5 text-right text-stone-400">{product.estimated_monthly_sales} adet</td>
                <td className="px-4 py-3.5 text-right text-amber-400 font-bold">
                  {product.actual_sales_30d ?? 0} adet
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className={`font-bold px-2.5 py-0.5 rounded-lg border ${getMarginColorClass(margin)}`}>
                    %{margin.toFixed(1)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(product)}
                      aria-label={`${product.name} ürününü düzenle`}
                      title="Düzenle"
                      className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition-colors active:scale-95"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(product.id)}
                      aria-label={`${product.name} ürününü sil`}
                      title="Sil"
                      className="p-1.5 bg-stone-800 hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg border border-stone-700 hover:border-red-500/30 transition-colors active:scale-95"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

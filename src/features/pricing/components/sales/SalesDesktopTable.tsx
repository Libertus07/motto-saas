import { formatCurrency } from '@/lib/format'

import { SalesQuantityControl } from './SalesQuantityControl'
import type { SalesProductViewProps } from './sales-view-types'

export function SalesDesktopTable(props: SalesProductViewProps) {
  const totalQuantity = Object.values(props.productSales).reduce((total, sale) => total + (sale.dailySales || 0), 0)

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-stone-800 bg-stone-950/60 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            <th className="px-5 py-3.5">Ürün Adı</th>
            <th className="px-4 py-3.5">Kategori</th>
            <th className="px-4 py-3.5 text-right">Satış Fiyatı (₺)</th>
            <th className="w-56 px-4 py-3.5 text-center">Günlük Satış Adedi</th>
            <th className="px-4 py-3.5 text-right">Ciro Payı (%)</th>
            <th className="px-5 py-3.5 text-right">Günlük Ciro (₺)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
          {props.products.map((product) => {
            const salesData = props.productSales[product.id]
            const sales = salesData?.dailySales || 0
            const productRevenue = (product.sale_price || 0) * sales
            const revenuePercent = props.totalDailyRevenue > 0 ? (productRevenue / props.totalDailyRevenue) * 100 : 0
            return (
              <tr key={product.id} className="transition-colors hover:bg-stone-800/30">
                <td className="px-5 py-3.5">
                  <span className="flex items-center gap-2 font-bold text-stone-100">
                    {product.name}
                    <small
                      className={`rounded-full border px-2 py-0.5 text-[10px] ${salesData?.isRealData ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border-stone-700 bg-stone-800 text-stone-400'}`}
                    >
                      {salesData?.isRealData ? '✓ Z-Raporu' : '~ Tahmin'}
                    </small>
                  </span>
                </td>
                <td className="px-4 py-3.5 font-medium text-stone-400">{product.category}</td>
                <td className="px-4 py-3.5 text-right font-extrabold text-amber-400">₺{product.sale_price || 0}</td>
                <td className="px-4 py-3.5">
                  <SalesQuantityControl
                    productId={product.id}
                    value={sales}
                    onChange={props.updateSales}
                    onAdjust={props.adjustSalesByDelta}
                  />
                </td>
                <td className="px-4 py-3.5 text-right font-semibold text-stone-400">
                  <span className="flex items-center justify-end gap-2">
                    %{revenuePercent.toFixed(1)}
                    <span className="h-1.5 w-12 overflow-hidden rounded-full border border-stone-800 bg-stone-950">
                      <span
                        className="block h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, revenuePercent)}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right font-extrabold text-stone-100">
                  {formatCurrency(productRevenue)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-stone-800 bg-stone-950/80 text-xs font-bold">
            <td colSpan={3} className="px-5 py-3.5 text-stone-300">
              Toplam
            </td>
            <td className="px-4 py-3.5 text-center font-black text-white">{totalQuantity} adet</td>
            <td className="px-4 py-3.5 text-right text-stone-400">%100</td>
            <td className="px-5 py-3.5 text-right text-sm font-black text-amber-400">
              {formatCurrency(props.totalDailyRevenue)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

import { SalesQuantityControl } from './SalesQuantityControl'
import type { SalesProductViewProps } from './sales-view-types'

export function SalesMobileCards(props: SalesProductViewProps) {
  return (
    <div className="divide-y divide-stone-800/60 md:hidden">
      {props.products.map((product) => {
        const salesData = props.productSales[product.id]
        return (
          <article key={product.id} className="space-y-2.5 p-4 transition-colors hover:bg-stone-800/20">
            <div className="flex items-center justify-between gap-3">
              <h4 className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
                <span className="truncate">{product.name}</span>
                <small
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${salesData?.isRealData ? 'bg-emerald-500/20 text-emerald-400' : 'bg-stone-800 text-stone-400'}`}
                >
                  {salesData?.isRealData ? '✓ Gerçek' : '~ Tahmin'}
                </small>
              </h4>
              <strong className="shrink-0 text-sm text-amber-400">₺{product.sale_price || 0}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-800/60 bg-stone-950/60 p-2.5 text-xs">
              <span className="font-medium text-stone-400">Günlük Adet:</span>
              <SalesQuantityControl
                compact
                productId={product.id}
                value={salesData?.dailySales || 0}
                onChange={props.updateSales}
                onAdjust={props.adjustSalesByDelta}
              />
            </div>
          </article>
        )
      })}
    </div>
  )
}

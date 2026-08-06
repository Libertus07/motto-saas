import { formatCurrency } from '@/lib/format'

import { QuickMovementForm } from './QuickMovementForm'
import { calculateStockValue, isCriticalStock, type StockListViewProps } from './stock-list-types'

export function StockMobileCards(props: StockListViewProps) {
  if (props.materials.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-stone-500 md:hidden">Filtrelerinize uygun stok bulunamadı.</p>
    )
  }

  return (
    <div className="divide-y divide-stone-800/60 md:hidden">
      {props.materials.map((material) => {
        const isCritical = isCriticalStock(material)
        const isSelected = props.inlineMovementMatId === material.id

        return (
          <article
            key={material.id}
            className={`space-y-3 p-4 transition-colors ${isCritical ? 'bg-rose-950/20' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h4 className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
                <span className="truncate">{material.name}</span>
                {isCritical ? (
                  <span className="shrink-0 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-400">
                    🚨 Kritik
                  </span>
                ) : null}
              </h4>
              <span className="shrink-0 text-xs font-semibold text-stone-400">{material.unit}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-800/60 bg-stone-950/60 p-2.5 text-xs">
              <div>
                <span className="block text-[10px] text-stone-400">Mevcut Stok</span>
                <span className={`font-extrabold ${isCritical ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {material.stock_quantity || 0} {material.unit}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-stone-400">Stok Değeri</span>
                <span className="font-extrabold text-amber-400">{formatCurrency(calculateStockValue(material))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => props.onInlineMatIdChange(material.id, 'giris')}
                className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400"
              >
                📥 Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => props.onInlineMatIdChange(material.id, 'cikis')}
                className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400"
              >
                📤 Çıkış Yap
              </button>
            </div>

            {isSelected ? (
              <QuickMovementForm
                material={material}
                movementType={props.inlineMovementType}
                form={props.inlineForm}
                onFormChange={props.onInlineFormChange}
                onSubmit={props.onInlineSubmit}
                onCancel={props.onInlineCancel}
              />
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

import { Fragment } from 'react'

import { formatCurrency } from '@/lib/format'

import { QuickMovementForm } from './QuickMovementForm'
import { calculateStockValue, isCriticalStock, type StockListViewProps } from './stock-list-types'

export function StockDesktopTable(props: StockListViewProps) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-stone-800 bg-stone-950/60 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            <th className="px-5 py-3.5">Hammadde Adı</th>
            <th className="px-4 py-3.5 text-right">Mevcut Stok</th>
            <th className="px-4 py-3.5 text-right">Kritik Seviye</th>
            <th className="px-4 py-3.5 text-right">Stok Değeri (₺)</th>
            <th className="px-4 py-3.5 text-center">Durum</th>
            <th className="px-5 py-3.5 text-right">Hızlı İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
          {props.materials.map((material) => {
            const isCritical = isCriticalStock(material)
            const isSelected = props.inlineMovementMatId === material.id

            return (
              <Fragment key={material.id}>
                <tr
                  className={`${isSelected ? 'bg-amber-500/10' : ''} ${isCritical ? 'bg-rose-950/20' : ''} transition-colors hover:bg-stone-800/30`}
                >
                  <td className="px-5 py-3.5 font-bold text-stone-100">{material.name}</td>
                  <td
                    className={`px-4 py-3.5 text-right font-extrabold ${isCritical ? 'text-rose-400' : 'text-emerald-400'}`}
                  >
                    {material.stock_quantity || 0} {material.unit}
                  </td>
                  <td className="px-4 py-3.5 text-right text-stone-400">
                    {material.critical_stock_level ? `${material.critical_stock_level} ${material.unit}` : '-'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-extrabold text-amber-400">
                    {formatCurrency(calculateStockValue(material))}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                        isCritical
                          ? 'border-rose-500/30 bg-rose-500/20 text-rose-400'
                          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {isCritical ? '🚨 Kritik' : '✓ Normal'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {(['giris', 'cikis'] as const).map((type) => (
                        <button
                          type="button"
                          key={type}
                          onClick={() => props.onInlineMatIdChange(material.id, type)}
                          className={`rounded-xl border px-3 py-1 text-xs font-extrabold transition-all active:scale-95 ${
                            isSelected && props.inlineMovementType === type
                              ? type === 'giris'
                                ? 'border-emerald-500 bg-emerald-500 text-stone-950'
                                : 'border-rose-500 bg-rose-500 text-white'
                              : type === 'giris'
                                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {type === 'giris' ? '📥 Giriş' : '📤 Çıkış'}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
                {isSelected ? (
                  <tr>
                    <td colSpan={6} className="border-b-2 border-amber-500/40 bg-stone-950/90 p-4">
                      <QuickMovementForm
                        material={material}
                        movementType={props.inlineMovementType}
                        form={props.inlineForm}
                        onFormChange={props.onInlineFormChange}
                        onSubmit={props.onInlineSubmit}
                        onCancel={props.onInlineCancel}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
          {props.materials.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-stone-500">
                Filtrelerinize uygun hammadde stok verisi bulunamadı.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

import { getMarginColorClass, getPriceDifference } from '../../analysis-utils'
import type { Calculation } from '../../types'

function Recommendation({ difference, compact = false }: { difference: number | null; compact?: boolean }) {
  if (difference === null)
    return <span className="font-bold text-emerald-400">✓ {compact ? 'Uygun' : 'Uygun Fiyat'}</span>
  return difference > 0 ? (
    <span className="font-bold text-amber-400">▼ ₺{Math.abs(difference).toFixed(0)} düşür</span>
  ) : (
    <span className="font-bold text-rose-400">▲ ₺{Math.abs(difference).toFixed(0)} artır</span>
  )
}

export function AnalysisResults({ calculations }: { calculations: Calculation[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 shadow-xl backdrop-blur-md">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-stone-800 bg-stone-950/60 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              <th className="px-5 py-3.5">Ürün Adı</th>
              <th className="px-4 py-3.5 text-right">Ham Maliyet</th>
              <th className="px-4 py-3.5 text-right">Gider Payı</th>
              <th className="px-4 py-3.5 text-right">Toplam Maliyet</th>
              <th className="px-4 py-3.5 text-right">Mevcut Fiyat</th>
              <th className="px-4 py-3.5 text-right">Önerilen Fiyat</th>
              <th className="px-4 py-3.5 text-right">Mevcut Marj</th>
              <th className="px-5 py-3.5 text-right">Öneri Durumu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
            {calculations.map((calculation) => {
              const difference = getPriceDifference(calculation.product.sale_price || 0, calculation.suggestedPrice)
              return (
                <tr key={calculation.product.id} className="transition-colors hover:bg-stone-800/30">
                  <td className="px-5 py-3.5 font-bold text-stone-100">{calculation.product.name}</td>
                  <td className="px-4 py-3.5 text-right text-stone-400">₺{calculation.rawCost.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right text-stone-400">₺{calculation.expenseShare.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-stone-200">
                    ₺{calculation.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold text-white">
                    ₺{(calculation.product.sale_price || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm font-black text-amber-400">
                    ₺{calculation.suggestedPrice.toFixed(2)}
                  </td>
                  <td className={`px-4 py-3.5 text-right ${getMarginColorClass(calculation.currentMargin)}`}>
                    %{calculation.currentMargin.toFixed(1)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Recommendation difference={difference} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-stone-800/60 md:hidden">
        {calculations.map((calculation) => {
          const difference = getPriceDifference(calculation.product.sale_price || 0, calculation.suggestedPrice)
          return (
            <article key={calculation.product.id} className="space-y-2.5 p-4 transition-colors hover:bg-stone-800/20">
              <div className="flex items-center justify-between gap-3">
                <h4 className="truncate text-sm font-bold text-white">{calculation.product.name}</h4>
                <span className={getMarginColorClass(calculation.currentMargin)}>
                  %{calculation.currentMargin.toFixed(1)} Marj
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-stone-800/60 bg-stone-950/60 p-2.5 text-xs">
                <div>
                  <span className="block text-[10px] text-stone-400">Mevcut Fiyat</span>
                  <strong className="text-white">₺{(calculation.product.sale_price || 0).toFixed(2)}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-stone-400">Önerilen Fiyat</span>
                  <strong className="text-amber-400">₺{calculation.suggestedPrice.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-stone-400">Toplam Maliyet</span>
                  <strong className="text-stone-300">₺{calculation.totalCost.toFixed(2)}</strong>
                </div>
                <div>
                  <span className="block text-[10px] text-stone-400">Öneri Durumu</span>
                  <Recommendation difference={difference} compact />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

import { formatCurrency } from '@/lib/format'

import type { LossProduct } from '../../loss-analysis'

type LossSummaryProps = { total: number; topProducts: LossProduct[] }

export function LossSummary({ total, topProducts }: LossSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="flex flex-col justify-center rounded-xl border border-red-500/30 bg-stone-900 p-5 md:col-span-1">
        <h3 className="mb-2 text-sm text-stone-400">Toplam Fire/Zayi Maliyeti</h3>
        <p className="text-3xl font-bold text-red-400">{formatCurrency(total)}</p>
        <p className="mt-2 text-xs text-stone-500">Bu dönemdeki toplam zarar</p>
      </div>

      <div className="rounded-xl border border-stone-800 bg-stone-900 p-5 md:col-span-2">
        <h3 className="mb-3 text-sm text-stone-400">En Çok Fire Verilen Ürünler (Maliyet Bazlı)</h3>
        <div className="space-y-3">
          {topProducts.length ? (
            topProducts.map((product) => {
              const percentage = total > 0 ? (product.total / total) * 100 : 0
              return (
                <div key={product.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-stone-200">{product.name}</span>
                    <span className="font-bold text-red-400">{formatCurrency(product.total)}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full border border-stone-800 bg-stone-950">
                    <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm italic text-stone-500">Henüz fire verisi bulunmuyor.</p>
          )}
        </div>
      </div>
    </div>
  )
}

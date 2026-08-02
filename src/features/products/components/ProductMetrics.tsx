import { formatCurrency } from '@/lib/format'

type ProductMetricsProps = {
  productCount: number
  categoryCount: number
  totalRevenue: number
  averageMargin: number
  totalEstimatedContribution: number
}

const cardClassName =
  'bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group'

export function ProductMetrics({
  productCount,
  categoryCount,
  totalRevenue,
  averageMargin,
  totalEstimatedContribution,
}: ProductMetricsProps) {
  return (
    <div id="tour-products-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      <div className={cardClassName}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Toplam Menü Ürünü</span>
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">📦</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-white">{productCount}</div>
        <div className="text-stone-400 text-[11px] mt-1 flex items-center gap-1">
          <span className="text-stone-400 font-bold">{categoryCount}</span> Kategori Altında
        </div>
      </div>
      <div className={cardClassName}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Son 30 Günlük Ciro</span>
          <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">💰</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-amber-400">{formatCurrency(totalRevenue)}</div>
        <div className="text-stone-400 text-[11px] mt-1">Gerçekleşen Satışlar</div>
      </div>
      <div className={cardClassName}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Ortalama Kar Marjı</span>
          <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
            📈
          </span>
        </div>
        <div
          className={`text-xl sm:text-2xl font-black ${averageMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          %{averageMargin.toFixed(1)}
        </div>
        <div className="text-stone-400 text-[11px] mt-1">Menü Genel Ortalama</div>
      </div>
      <div className={cardClassName}>
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Aylık Tahmini Nakit Katkı</span>
          <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-base">
            💵
          </span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-violet-400">
          {formatCurrency(totalEstimatedContribution)}
        </div>
        <div className="text-stone-400 text-[11px] mt-1">Hedeflenen Net Brüt Katkı</div>
      </div>
    </div>
  )
}

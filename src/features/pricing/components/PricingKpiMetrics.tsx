import { formatCurrency } from '@/lib/format'

type PricingKpiMetricsProps = {
  productCount: number
  totalDailyRevenue: number
  dailyExpenses: number
  totalDailyProfit: number
}

export function PricingKpiMetrics({
  productCount,
  totalDailyRevenue,
  dailyExpenses,
  totalDailyProfit,
}: PricingKpiMetricsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Hesaplanan Ürün</span>
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">🧠</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-white">{productCount} Ürün</div>
        <div className="text-stone-400 text-[11px] mt-1">Sistemdeki Aktif Menü</div>
      </div>

      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Günlük Ciro</span>
          <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">💰</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-amber-400">{formatCurrency(totalDailyRevenue)}</div>
        <div className="text-stone-400 text-[11px] mt-1">Tahmini / Z-Raporu Cirosu</div>
      </div>

      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Günlük Toplam Gider</span>
          <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-base">🔴</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-rose-400">{formatCurrency(dailyExpenses)}</div>
        <div className="text-stone-400 text-[11px] mt-1">Sabit & Değişken Gider Yükü</div>
      </div>

      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
        <div className="flex justify-between items-start mb-2">
          <span className="text-stone-400 text-xs font-semibold">Günlük Net Kâr</span>
          <span
            className={`p-2 rounded-xl text-base ${
              totalDailyProfit > 0
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            🟢
          </span>
        </div>
        <div
          className={`text-xl sm:text-2xl font-black ${totalDailyProfit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {formatCurrency(totalDailyProfit)}
        </div>
        <div className="text-stone-400 text-[11px] mt-1">
          Aylık Tahmini: <strong className="text-white">{formatCurrency(totalDailyProfit * 30)}</strong>
        </div>
      </div>
    </div>
  )
}

import { formatCurrency } from '@/lib/format'

type InvestmentMetricsProps = {
  totalCostValue: number
  totalCurrentValue: number
  totalRentIncome: number
  totalProfit: number
  profitPercentage: number
}

export function InvestmentMetrics({
  totalCostValue,
  totalCurrentValue,
  totalRentIncome,
  totalProfit,
  profitPercentage,
}: InvestmentMetricsProps) {
  const isProfitable = totalProfit >= 0

  return (
    <section id="tour-inv-kpis" className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-label="Yatırım özeti">
      <article className="relative overflow-hidden rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <div className="absolute -right-4 -top-4 text-7xl opacity-5" aria-hidden="true">
          💰
        </div>
        <p className="mb-1 text-sm font-bold text-stone-400">Toplam Yatırım Maliyeti</p>
        <p className="mb-2 text-3xl font-bold text-white">{formatCurrency(totalCostValue)}</p>
        <p className="text-xs text-stone-500">Ödediğiniz toplam anapara</p>
      </article>

      <article className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-stone-900 p-6 shadow-[0_0_30px_rgba(245,158,11,0.05)]">
        <div className="absolute -right-4 -top-4 text-7xl opacity-5" aria-hidden="true">
          💎
        </div>
        <p className="mb-1 text-sm font-bold text-amber-500/80">Güncel Varlık Değeri</p>
        <p className="mb-2 text-3xl font-bold text-amber-500">{formatCurrency(totalCurrentValue)}</p>
        <p className="text-xs text-amber-500/50">Canlı kurlar ve ekspertiz değerleri</p>
      </article>

      <article
        className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border p-6 ${
          isProfitable ? 'border-green-500/30 bg-green-950/20' : 'border-red-500/30 bg-red-950/20'
        }`}
      >
        <div className="absolute -right-4 -top-4 text-7xl opacity-5" aria-hidden="true">
          📈
        </div>
        <div>
          <p className={`mb-1 text-sm font-bold ${isProfitable ? 'text-green-500/80' : 'text-red-500/80'}`}>
            Toplam Kâr / Zarar
          </p>
          <p
            className={`mb-2 flex flex-wrap items-center gap-2 text-3xl font-bold ${
              isProfitable ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {isProfitable ? '+' : ''}
            {formatCurrency(totalProfit)}
            <span className="rounded-lg bg-black/20 px-2 py-1 text-lg">
              {isProfitable ? '+' : ''}
              {profitPercentage.toFixed(2)}%
            </span>
          </p>
        </div>
        {totalRentIncome > 0 ? (
          <p className={`mt-2 text-xs ${isProfitable ? 'text-green-500/70' : 'text-red-500/70'}`}>
            Bu sonuca {formatCurrency(totalRentIncome)} toplam kira geliri dahildir.
          </p>
        ) : null}
      </article>
    </section>
  )
}

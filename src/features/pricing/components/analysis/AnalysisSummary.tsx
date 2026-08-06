import type { PricingAnalysisFilter } from '../../analysis-utils'

type AnalysisStats = { ideal: number; artirilmali: number; indirim: number }
type AnalysisSummaryProps = {
  stats: AnalysisStats
  activeFilter: PricingAnalysisFilter
  onFilterChange: (filter: PricingAnalysisFilter) => void
}

const cards = [
  {
    id: 'ideal',
    label: '✓ İdeal Fiyatlananlar',
    description: 'Hedef marjı yakalayan uygun fiyatlar',
    icon: '🟢',
    color: 'emerald',
  },
  {
    id: 'artirilmali',
    label: '🚨 Fiyat Artırılmalı',
    description: 'Düşük marjlı veya maliyet altı kalanlar',
    icon: '▲',
    color: 'rose',
  },
  {
    id: 'indirim',
    label: '🟡 İndirim Yapılabilir',
    description: 'Piyasa marjının üstünde yüksek fiyatlılar',
    icon: '▼',
    color: 'amber',
  },
] as const

const activeClasses = {
  ideal: 'border-emerald-500/40 bg-emerald-500/20 shadow-emerald-500/10',
  artirilmali: 'border-rose-500/40 bg-rose-500/20 shadow-rose-500/10',
  indirim: 'border-amber-500/40 bg-amber-500/20 shadow-amber-500/10',
}

const textClasses = { ideal: 'text-emerald-400', artirilmali: 'text-rose-400', indirim: 'text-amber-400' }

export function AnalysisSummary({ stats, activeFilter, onFilterChange }: AnalysisSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {cards.map((card) => (
        <button
          type="button"
          key={card.id}
          onClick={() => onFilterChange(card.id)}
          aria-pressed={activeFilter === card.id}
          className={`rounded-2xl border p-4 text-left backdrop-blur-md transition-all ${
            activeFilter === card.id
              ? `${activeClasses[card.id]} shadow-lg`
              : 'border-stone-800/80 bg-stone-900/80 hover:bg-stone-800/40'
          }`}
        >
          <div className="mb-1 flex items-center justify-between">
            <span className={`text-xs font-bold uppercase ${textClasses[card.id]}`}>{card.label}</span>
            <span className={`rounded-lg bg-stone-950/40 p-1.5 text-xs ${textClasses[card.id]}`}>{card.icon}</span>
          </div>
          <div className={`text-2xl font-black ${textClasses[card.id]}`}>{stats[card.id]} Ürün</div>
          <p className="mt-0.5 text-[11px] text-stone-400">{card.description}</p>
        </button>
      ))}
    </div>
  )
}

import { Input } from '@/components/ui/input'

import type { PricingAnalysisFilter } from '../../analysis-utils'

type AnalysisFiltersProps = {
  search: string
  filter: PricingAnalysisFilter
  counts: { total: number; ideal: number; artirilmali: number }
  onSearchChange: (value: string) => void
  onFilterChange: (filter: PricingAnalysisFilter) => void
}

export function AnalysisFilters(props: AnalysisFiltersProps) {
  const options = [
    { id: 'tumu', label: `Tümü (${props.counts.total})` },
    { id: 'artirilmali', label: `🚨 Artırılmalı (${props.counts.artirilmali})` },
    { id: 'ideal', label: `✓ İdeal (${props.counts.ideal})` },
  ] as const

  return (
    <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-stone-800/80 bg-stone-900/80 p-3.5 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:p-4">
      <div className="relative flex-1">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">🔍</span>
        <Input
          type="search"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Fiyat analizinde ürün ara..."
          className="pl-9"
        />
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            onClick={() => props.onFilterChange(option.id)}
            aria-pressed={props.filter === option.id}
            className={`whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${props.filter === option.id ? 'border-amber-500 bg-amber-500 text-stone-950' : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

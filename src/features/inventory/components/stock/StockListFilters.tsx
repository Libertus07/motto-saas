type StockStatusFilter = 'tumu' | 'normal' | 'kritik'

type StockListFiltersProps = {
  search: string
  status: StockStatusFilter
  totalCount: number
  onSearchChange: (value: string) => void
  onStatusChange: (value: StockStatusFilter) => void
}

export function StockListFilters({
  search,
  status,
  totalCount,
  onSearchChange,
  onStatusChange,
}: StockListFiltersProps) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-stone-800/80 bg-stone-900/80 p-3.5 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:p-4">
      <div className="relative flex-1">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">🔍</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Hammadde stoklarında ara..."
          aria-label="Hammadde stoklarında ara"
          className="w-full rounded-xl border border-stone-800 bg-stone-950 py-2 pl-9 pr-4 text-xs text-white transition-colors placeholder:text-stone-600 focus:border-amber-500/50 focus:outline-none sm:text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
        <button
          type="button"
          onClick={() => onStatusChange('tumu')}
          aria-pressed={status === 'tumu'}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            status === 'tumu'
              ? 'border border-stone-700 bg-stone-800 text-white'
              : 'bg-stone-950 text-stone-400 hover:text-stone-200'
          }`}
        >
          Tümü ({totalCount})
        </button>
        <button
          type="button"
          onClick={() => onStatusChange('normal')}
          aria-pressed={status === 'normal'}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            status === 'normal'
              ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
              : 'bg-stone-950 text-emerald-400/70 hover:text-emerald-400'
          }`}
        >
          Normal
        </button>
        <button
          type="button"
          onClick={() => onStatusChange('kritik')}
          aria-pressed={status === 'kritik'}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
            status === 'kritik'
              ? 'border border-rose-500/30 bg-rose-500/20 text-rose-400'
              : 'bg-stone-950 text-rose-400/70 hover:text-rose-400'
          }`}
        >
          🚨 Kritik
        </button>
      </div>
    </div>
  )
}

export type { StockStatusFilter }

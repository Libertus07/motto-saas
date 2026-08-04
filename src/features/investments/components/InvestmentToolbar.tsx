import type { InvestmentGroupBy, InvestmentSortBy, InvestmentSortOrder } from '../utils'

type InvestmentToolbarProps = {
  groupBy: InvestmentGroupBy
  sortBy: InvestmentSortBy
  sortOrder: InvestmentSortOrder
  onGroupByChange: (value: InvestmentGroupBy) => void
  onSortByChange: (value: InvestmentSortBy) => void
  onToggleSortOrder: () => void
}

export function InvestmentToolbar({
  groupBy,
  sortBy,
  sortOrder,
  onGroupByChange,
  onSortByChange,
  onToggleSortOrder,
}: InvestmentToolbarProps) {
  return (
    <section
      id="tour-inv-tools"
      className="mb-4 mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"
      aria-label="Portföy görünüm ayarları"
    >
      <h2 className="text-xl font-bold">Varlık Portföyünüz</h2>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-800 bg-stone-900 p-2">
        <select
          value={groupBy}
          onChange={(event) => onGroupByChange(event.target.value as InvestmentGroupBy)}
          aria-label="Yatırımları gruplama yöntemi"
          className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-sm font-medium text-stone-300 focus:border-amber-500 focus:outline-none"
        >
          <option value="type">Türüne Göre Grupla</option>
          <option value="month">Ay/Yıla Göre Grupla</option>
        </select>
        <select
          value={sortBy}
          onChange={(event) => onSortByChange(event.target.value as InvestmentSortBy)}
          aria-label="Yatırımları sıralama alanı"
          className="rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-sm font-medium text-stone-300 focus:border-amber-500 focus:outline-none"
        >
          <option value="date">Tarihe Göre Sırala</option>
          <option value="value">Değere Göre Sırala</option>
        </select>
        <button
          type="button"
          onClick={onToggleSortOrder}
          className="flex items-center gap-1 rounded-lg border border-stone-800 bg-stone-950 px-3 py-1.5 text-sm font-bold text-stone-400 transition-colors hover:bg-stone-800"
          aria-label={sortOrder === 'desc' ? 'Sıralamayı artan yap' : 'Sıralamayı azalan yap'}
        >
          {sortOrder === 'desc' ? '⬇️ Azalan' : '⬆️ Artan'}
        </button>
      </div>
    </section>
  )
}

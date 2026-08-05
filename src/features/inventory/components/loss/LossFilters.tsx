import type { ZayiDateFilter, ZayiSortBy } from '../../types'

type LossFiltersProps = {
  searchTerm: string
  dateFilter: ZayiDateFilter
  sortBy: ZayiSortBy
  onSearchChange: (value: string) => void
  onDateFilterChange: (value: ZayiDateFilter) => void
  onSortByChange: (value: ZayiSortBy) => void
}

export function LossFilters(props: LossFiltersProps) {
  return (
    <div className="flex flex-col items-end gap-4 rounded-xl border border-stone-800 bg-stone-900 p-4 md:flex-row">
      <label className="w-full flex-1 text-xs text-stone-400">
        Ara
        <input
          type="search"
          placeholder="Ürün veya not ara..."
          value={props.searchTerm}
          onChange={(event) => props.onSearchChange(event.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
        />
      </label>
      <label className="w-full text-xs text-stone-400 md:w-48">
        Zaman Aralığı
        <select
          value={props.dateFilter}
          onChange={(event) => props.onDateFilterChange(event.target.value as ZayiDateFilter)}
          className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
        >
          <option value="bugun">Bugün</option>
          <option value="bu_hafta">Bu Hafta</option>
          <option value="bu_ay">Bu Ay</option>
          <option value="tumu">Tüm Zamanlar</option>
        </select>
      </label>
      <label className="w-full text-xs text-stone-400 md:w-48">
        Sıralama
        <select
          value={props.sortBy}
          onChange={(event) => props.onSortByChange(event.target.value as ZayiSortBy)}
          className="mt-1 w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
        >
          <option value="tarih_yeni">En Yeni</option>
          <option value="tarih_eski">En Eski</option>
          <option value="tutar_yuksek">Tutar (Yüksekten Düşüğe)</option>
          <option value="tutar_dusuk">Tutar (Düşükten Yükseğe)</option>
        </select>
      </label>
    </div>
  )
}

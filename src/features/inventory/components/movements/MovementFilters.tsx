import type { MovementDateFilter, MovementTypeFilter } from '../../types'

type MovementFiltersProps = {
  searchTerm: string
  typeFilter: MovementTypeFilter
  dateFilter: MovementDateFilter
  startDate: string
  endDate: string
  activeFilters: string[]
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: MovementTypeFilter) => void
  onDateFilterChange: (value: MovementDateFilter) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onClear: () => void
}

const fieldClass =
  'w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none'

export function MovementFilters(props: MovementFiltersProps) {
  return (
    <>
      <div className="flex flex-col items-end gap-4 rounded-xl border border-stone-800 bg-stone-900 p-4 md:flex-row">
        <label className="w-full flex-1 text-xs text-stone-400">
          Arama
          <input
            type="search"
            placeholder="Hammadde veya not ara..."
            value={props.searchTerm}
            onChange={(event) => props.onSearchChange(event.target.value)}
            className={`${fieldClass} mt-1`}
          />
        </label>
        <label className="w-full text-xs text-stone-400 md:w-48">
          Hareket Türü
          <select
            value={props.typeFilter}
            onChange={(event) => props.onTypeFilterChange(event.target.value as MovementTypeFilter)}
            className={`${fieldClass} mt-1`}
          >
            <option value="tumu">Tümü</option>
            <option value="giris">Giriş</option>
            <option value="cikis">Çıkış</option>
            <option value="fire">Fire</option>
            <option value="sayim">Sayım Düzeltmesi</option>
          </select>
        </label>
        <label className="w-full text-xs text-stone-400 md:w-48">
          Tarih
          <select
            value={props.dateFilter}
            onChange={(event) => props.onDateFilterChange(event.target.value as MovementDateFilter)}
            className={`${fieldClass} mt-1`}
          >
            <option value="bugun">Bugün</option>
            <option value="bu_hafta">Son 7 Gün</option>
            <option value="bu_ay">Bu Ay</option>
            <option value="tumu">Tüm Zamanlar</option>
            <option value="custom">Özel Aralık</option>
          </select>
        </label>
        {props.dateFilter === 'custom' ? (
          <div className="flex w-full gap-2 md:w-auto">
            <label className="text-xs text-stone-400">
              Başlangıç
              <input
                type="date"
                value={props.startDate}
                onChange={(event) => props.onStartDateChange(event.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
            <label className="text-xs text-stone-400">
              Bitiş
              <input
                type="date"
                value={props.endDate}
                onChange={(event) => props.onEndDateChange(event.target.value)}
                className={`${fieldClass} mt-1`}
              />
            </label>
          </div>
        ) : null}
      </div>

      {props.activeFilters.length > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-400">Aktif Filtreler:</span>
            {props.activeFilters.map((filter) => (
              <span
                key={filter}
                className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-xs text-stone-300"
              >
                {filter}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={props.onClear}
            className="whitespace-nowrap px-2 text-sm text-stone-400 underline hover:text-white"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : null}
    </>
  )
}

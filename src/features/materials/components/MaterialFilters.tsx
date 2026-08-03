import type { Material } from '../types'
import { getMaterialCategory, type MaterialSort } from '../utils'
import { MATERIAL_CATEGORY_ALL } from '../workspace-utils'

type MaterialFiltersProps = {
  search: string
  onSearchChange: (value: string) => void
  categoryFilter: string
  onCategoryFilterChange: (value: string) => void
  sortBy: MaterialSort
  onSortChange: (value: MaterialSort) => void
  materials: Material[]
  categories: string[]
  allCategoriesOpen: boolean
  onToggleAll: () => void
}

export function MaterialFilters(props: MaterialFiltersProps) {
  return (
    <section className="bg-stone-900/80 border border-stone-800/80 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row gap-3">
      <div className="flex-1 relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden>
          🔍
        </span>
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Hammadde adı ile arayın…"
          aria-label="Hammadde ara"
          className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-10 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
        />
        {props.search ? (
          <button
            onClick={() => props.onSearchChange('')}
            aria-label="Aramayı temizle"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white"
          >
            ✕
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={props.categoryFilter}
          onChange={(event) => props.onCategoryFilterChange(event.target.value)}
          aria-label="Kategori filtresi"
          className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-stone-300 text-xs"
        >
          <option value={MATERIAL_CATEGORY_ALL}>Tüm Kategoriler ({props.materials.length})</option>
          {props.categories.map((category) => (
            <option key={category} value={category}>
              {category} ({props.materials.filter((material) => getMaterialCategory(material) === category).length})
            </option>
          ))}
        </select>
        <select
          value={props.sortBy}
          onChange={(event) => props.onSortChange(event.target.value as MaterialSort)}
          aria-label="Sıralama"
          className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-stone-300 text-xs"
        >
          <option value="name">İsme göre (A-Z)</option>
          <option value="critical_first">Kritik stok önce</option>
          <option value="price_desc">Fiyatı yüksek önce</option>
          <option value="stock_desc">Stoku çok önce</option>
        </select>
        <button
          onClick={props.onToggleAll}
          className="bg-stone-950 hover:bg-stone-800 text-stone-300 text-xs font-semibold px-3 py-2.5 border border-stone-800 rounded-xl"
        >
          {props.allCategoriesOpen ? '▲ Tümünü Kapat' : '▼ Tümünü Aç'}
        </button>
      </div>
    </section>
  )
}

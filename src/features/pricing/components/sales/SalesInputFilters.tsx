import { Input } from '@/components/ui/input'

type SalesInputFiltersProps = {
  search: string
  category: string
  categories: string[]
  onSearchChange: (value: string) => void
  onCategoryChange: (value: string) => void
}

export function SalesInputFilters(props: SalesInputFiltersProps) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-3 rounded-2xl border border-stone-800/80 bg-stone-900/80 p-3.5 shadow-xl backdrop-blur-md sm:flex-row sm:items-center sm:p-4">
      <div className="relative flex-1">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-stone-400">🔍</span>
        <Input
          type="search"
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Ürün adı ile arayın..."
          className="pl-9"
        />
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        {props.categories.map((category) => (
          <button
            type="button"
            key={category}
            onClick={() => props.onCategoryChange(category)}
            aria-pressed={props.category === category}
            className={`whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${props.category === category ? 'border-amber-500 bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20' : 'border-stone-800 bg-stone-950 text-stone-400 hover:text-stone-200'}`}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  )
}

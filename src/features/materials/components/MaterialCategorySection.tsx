import { formatCurrency } from '@/lib/format'

import type { MaterialCatalogProps } from './material-catalog-types'
import { MaterialDesktopTable } from './MaterialDesktopTable'
import { MaterialMobileCards } from './MaterialMobileCards'
import { isCriticalMaterial } from '../utils'

type MaterialCategorySectionProps = Omit<
  MaterialCatalogProps,
  'loading' | 'groups' | 'openCategories' | 'onToggleCategory'
> & {
  category: string
  materials: MaterialCatalogProps['groups'][number]['items']
  open: boolean
  onToggle: () => void
}

export function MaterialCategorySection({
  category,
  materials,
  open,
  onToggle,
  ...contentProps
}: MaterialCategorySectionProps) {
  let criticalCount = 0
  let totalValue = 0
  for (const material of materials) {
    if (isCriticalMaterial(material)) criticalCount += 1
    totalValue += (material.stock_quantity || 0) * material.price_per_unit
  }

  const sharedProps = { ...contentProps, materials }
  return (
    <article className="overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 shadow-xl">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-stone-800/40 sm:px-5"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="truncate font-extrabold">{category}</span>
          <span className="rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-400">{materials.length}</span>
          {criticalCount > 0 ? (
            <span className="hidden rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400 sm:inline">
              ⚠ {criticalCount} kritik
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-right">
          <strong className="text-sm text-amber-400">{formatCurrency(totalValue)}</strong>
          <span className="ml-1 hidden text-xs text-stone-500 sm:inline">stok değeri</span>
        </span>
      </button>

      {open ? (
        <div className="border-t border-stone-800/80">
          <MaterialDesktopTable {...sharedProps} />
          <MaterialMobileCards {...sharedProps} />
        </div>
      ) : null}
    </article>
  )
}

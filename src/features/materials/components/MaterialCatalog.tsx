import { MaterialCategorySection } from './MaterialCategorySection'
import type { MaterialCatalogProps } from './material-catalog-types'

export function MaterialCatalog(props: MaterialCatalogProps) {
  if (props.loading) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-16 text-center text-stone-400">
        <div className="mb-3 animate-spin text-3xl">🧪</div>
        <p className="text-sm">Hammaddeler yükleniyor…</p>
      </div>
    )
  }

  if (props.groups.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-12 text-center text-stone-500">
        <div className="mb-3 text-5xl">🧪</div>
        <h3 className="text-lg font-bold text-stone-300">Hammadde bulunamadı</h3>
        <p className="mt-1 text-xs">Arama veya kategori filtrenizi değiştirebilirsiniz.</p>
      </div>
    )
  }

  const { loading: _loading, groups, openCategories, onToggleCategory, ...contentProps } = props
  return (
    <section className="space-y-4" aria-label="Hammadde listesi">
      {groups.map(({ category, items }) => (
        <MaterialCategorySection
          key={category}
          category={category}
          materials={items}
          open={openCategories.has(category)}
          onToggle={() => onToggleCategory(category)}
          {...contentProps}
        />
      ))}
    </section>
  )
}

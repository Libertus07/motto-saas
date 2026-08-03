import { formatCurrency } from '@/lib/format'

import type { EditRow, Material, MaterialCategoryGroup } from '../types'
import { isCriticalMaterial } from '../utils'

type MaterialCatalogProps = {
  loading: boolean
  groups: MaterialCategoryGroup[]
  openCategories: ReadonlySet<string>
  bulkEditMode: boolean
  editRows: Record<string, EditRow>
  changedIds: ReadonlySet<string>
  selectedForDeletion: ReadonlySet<string>
  onToggleCategory: (category: string) => void
  onRowChange: (id: string, field: keyof EditRow, value: string) => void
  onToggleDeletion: (id: string) => void
  onEdit: (material: Material) => void
  onDelete: (id: string) => void
  onViewHistory: (material: Material) => void
}

const inputClass = 'w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1.5 text-sm disabled:opacity-40'

function MaterialActions({
  material,
  onHistory,
  onEdit,
  onDelete,
}: {
  material: Material
  onHistory: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onHistory}
        className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 rounded-lg border border-stone-700 text-xs"
        aria-label={`${material.name} fiyat geçmişi`}
      >
        📈 <span className="md:hidden">Geçmiş</span>
      </button>
      <button
        onClick={onEdit}
        className="px-2.5 py-1.5 bg-stone-800 hover:bg-stone-700 rounded-lg border border-stone-700 text-xs"
        aria-label={`${material.name} düzenle`}
      >
        ✏️ <span className="md:hidden">Düzenle</span>
      </button>
      <button
        onClick={onDelete}
        className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 text-xs"
        aria-label={`${material.name} sil`}
      >
        🗑️ <span className="md:hidden">Sil</span>
      </button>
    </div>
  )
}

function BulkFields({
  material,
  row,
  selected,
  onChange,
}: {
  material: Material
  row: EditRow
  selected: boolean
  onChange: MaterialCatalogProps['onRowChange']
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2 text-xs text-stone-400">
        Ad
        <input
          value={row.name}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'name', event.target.value)}
          className={`${inputClass} mt-1 text-white`}
        />
      </label>
      <label className="text-xs text-stone-400">
        Birim
        <input
          value={row.unit}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'unit', event.target.value)}
          className={`${inputClass} mt-1 text-white`}
        />
      </label>
      <label className="text-xs text-stone-400">
        Kategori
        <input
          value={row.category}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'category', event.target.value)}
          className={`${inputClass} mt-1 text-white`}
        />
      </label>
      <label className="text-xs text-stone-400">
        Birim fiyat
        <input
          type="number"
          min="0"
          value={row.price_per_unit}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'price_per_unit', event.target.value)}
          className={`${inputClass} mt-1 text-amber-400 font-bold`}
        />
      </label>
      <label className="text-xs text-stone-400">
        Stok
        <input
          type="number"
          min="0"
          value={row.stock_quantity}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'stock_quantity', event.target.value)}
          className={`${inputClass} mt-1 text-white`}
        />
      </label>
      <label className="text-xs text-stone-400 col-span-2">
        Kritik seviye
        <input
          type="number"
          min="0"
          value={row.critical_stock_level}
          disabled={selected}
          onChange={(event) => onChange(material.id, 'critical_stock_level', event.target.value)}
          className={`${inputClass} mt-1 text-rose-400`}
        />
      </label>
    </div>
  )
}

export function MaterialCatalog(props: MaterialCatalogProps) {
  if (props.loading)
    return (
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400">
        <div className="animate-spin text-3xl mb-3">🧪</div>
        <p className="text-sm">Hammaddeler yükleniyor…</p>
      </div>
    )
  if (props.groups.length === 0)
    return (
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-12 text-center text-stone-500">
        <div className="text-5xl mb-3">🧪</div>
        <h3 className="text-lg font-bold text-stone-300">Hammadde bulunamadı</h3>
        <p className="text-xs mt-1">Arama veya kategori filtrenizi değiştirebilirsiniz.</p>
      </div>
    )

  return (
    <section className="space-y-4" aria-label="Hammadde listesi">
      {props.groups.map(({ category, items }) => {
        const open = props.openCategories.has(category)
        const criticalCount = items.filter(isCriticalMaterial).length
        const total = items.reduce((sum, material) => sum + (material.stock_quantity || 0) * material.price_per_unit, 0)
        return (
          <article
            key={category}
            className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden shadow-xl"
          >
            <button
              onClick={() => props.onToggleCategory(category)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-stone-800/40 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
                <span className="font-extrabold truncate">{category}</span>
                <span className="bg-stone-800 text-stone-400 text-xs px-2 py-0.5 rounded-full">{items.length}</span>
                {criticalCount > 0 ? (
                  <span className="hidden sm:inline bg-rose-500/20 text-rose-400 text-xs px-2 py-0.5 rounded-full">
                    ⚠ {criticalCount} kritik
                  </span>
                ) : null}
              </div>
              <span className="text-right shrink-0">
                <strong className="text-amber-400 text-sm">{formatCurrency(total)}</strong>
                <span className="hidden sm:inline text-stone-500 text-xs ml-1">stok değeri</span>
              </span>
            </button>

            {open ? (
              <div className="border-t border-stone-800/80">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-stone-950/60 text-stone-400 text-[11px] uppercase">
                        {props.bulkEditMode ? <th className="px-4 py-3 text-center">Sil</th> : null}
                        <th className="px-5 py-3">Hammadde</th>
                        <th className="px-4 py-3">Birim</th>
                        {props.bulkEditMode ? <th className="px-4 py-3">Kategori</th> : null}
                        <th className="px-4 py-3 text-right">Birim fiyat</th>
                        <th className="px-4 py-3 text-right">Stok</th>
                        <th className="px-4 py-3 text-right">Kritik</th>
                        <th className="px-4 py-3 text-right">Toplam</th>
                        <th className="px-5 py-3 text-right">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/50 text-sm">
                      {items.map((material) => {
                        const row = props.editRows[material.id]
                        const selected = props.selectedForDeletion.has(material.id)
                        const changed = props.changedIds.has(material.id)
                        const critical = isCriticalMaterial(material)
                        if (props.bulkEditMode && row)
                          return (
                            <tr
                              key={material.id}
                              className={selected ? 'bg-rose-950/30' : changed ? 'bg-amber-500/10' : ''}
                            >
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => props.onToggleDeletion(material.id)}
                                  aria-label={`${material.name} silmek için seç`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  value={row.name}
                                  disabled={selected}
                                  onChange={(event) => props.onRowChange(material.id, 'name', event.target.value)}
                                  className={`${inputClass} min-w-40 text-white`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  value={row.unit}
                                  disabled={selected}
                                  onChange={(event) => props.onRowChange(material.id, 'unit', event.target.value)}
                                  className={`${inputClass} min-w-20 text-white`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  value={row.category}
                                  disabled={selected}
                                  onChange={(event) => props.onRowChange(material.id, 'category', event.target.value)}
                                  className={`${inputClass} min-w-28 text-white`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.price_per_unit}
                                  disabled={selected}
                                  onChange={(event) =>
                                    props.onRowChange(material.id, 'price_per_unit', event.target.value)
                                  }
                                  className={`${inputClass} min-w-24 text-right text-amber-400`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.stock_quantity}
                                  disabled={selected}
                                  onChange={(event) =>
                                    props.onRowChange(material.id, 'stock_quantity', event.target.value)
                                  }
                                  className={`${inputClass} min-w-20 text-right text-white`}
                                />
                              </td>
                              <td className="px-4 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={row.critical_stock_level}
                                  disabled={selected}
                                  onChange={(event) =>
                                    props.onRowChange(material.id, 'critical_stock_level', event.target.value)
                                  }
                                  className={`${inputClass} min-w-20 text-right text-rose-400`}
                                />
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-amber-400">
                                ₺{((Number(row.stock_quantity) || 0) * (Number(row.price_per_unit) || 0)).toFixed(2)}
                              </td>
                              <td className="px-5 py-3 text-right text-xs">
                                {selected ? (
                                  <span className="text-rose-400">Silinecek</span>
                                ) : changed ? (
                                  <span className="text-amber-400">● Değişti</span>
                                ) : null}
                              </td>
                            </tr>
                          )
                        return (
                          <tr key={material.id} className={critical ? 'bg-rose-950/20' : 'hover:bg-stone-800/30'}>
                            <td className="px-5 py-3.5 font-bold">
                              {material.name}{' '}
                              {critical ? (
                                <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full">
                                  ⚠ Kritik
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5 text-stone-400">{material.unit}</td>
                            <td className="px-4 py-3.5 text-right text-amber-400 font-semibold">
                              ₺{material.price_per_unit.toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold">{material.stock_quantity || 0}</td>
                            <td
                              className={`px-4 py-3.5 text-right ${critical ? 'text-rose-400 font-bold' : 'text-stone-400'}`}
                            >
                              {material.critical_stock_level || '-'}
                            </td>
                            <td className="px-4 py-3.5 text-right text-amber-400 font-bold">
                              ₺{((material.stock_quantity || 0) * material.price_per_unit).toFixed(2)}
                            </td>
                            <td className="px-5 py-3.5">
                              <MaterialActions
                                material={material}
                                onHistory={() => props.onViewHistory(material)}
                                onEdit={() => props.onEdit(material)}
                                onDelete={() => props.onDelete(material.id)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden divide-y divide-stone-800/60">
                  {items.map((material) => {
                    const row = props.editRows[material.id]
                    const selected = props.selectedForDeletion.has(material.id)
                    const changed = props.changedIds.has(material.id)
                    const critical = isCriticalMaterial(material)
                    return (
                      <div
                        key={material.id}
                        className={`p-4 space-y-3 ${selected ? 'bg-rose-950/30' : changed ? 'bg-amber-500/10' : critical ? 'bg-rose-950/20' : ''}`}
                      >
                        {props.bulkEditMode && row ? (
                          <>
                            <label className="flex items-center gap-2 font-bold text-sm">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => props.onToggleDeletion(material.id)}
                              />
                              {material.name}
                              <span className="ml-auto text-xs text-amber-400">
                                {selected ? 'Silinecek' : changed ? 'Değişti' : ''}
                              </span>
                            </label>
                            <BulkFields
                              material={material}
                              row={row}
                              selected={selected}
                              onChange={props.onRowChange}
                            />
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between gap-3">
                              <h3 className="font-bold">
                                {material.name}{' '}
                                {critical ? <span className="text-[10px] text-rose-400">⚠ Kritik</span> : null}
                              </h3>
                              <span className="text-stone-400 text-xs">{material.unit}</span>
                            </div>
                            <dl className="grid grid-cols-2 gap-2 bg-stone-950/60 p-3 rounded-xl text-xs">
                              <div>
                                <dt className="text-stone-500">Birim fiyat</dt>
                                <dd className="text-amber-400 font-bold">₺{material.price_per_unit.toFixed(2)}</dd>
                              </div>
                              <div>
                                <dt className="text-stone-500">Stok</dt>
                                <dd className="font-bold">{material.stock_quantity || 0}</dd>
                              </div>
                              <div>
                                <dt className="text-stone-500">Kritik seviye</dt>
                                <dd className={critical ? 'text-rose-400 font-bold' : ''}>
                                  {material.critical_stock_level || '-'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-stone-500">Toplam değer</dt>
                                <dd className="text-amber-400 font-bold">
                                  ₺{((material.stock_quantity || 0) * material.price_per_unit).toFixed(2)}
                                </dd>
                              </div>
                            </dl>
                            <MaterialActions
                              material={material}
                              onHistory={() => props.onViewHistory(material)}
                              onEdit={() => props.onEdit(material)}
                              onDelete={() => props.onDelete(material.id)}
                            />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </article>
        )
      })}
    </section>
  )
}

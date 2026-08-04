import { isCriticalMaterial } from '../utils'
import { MaterialActions } from './MaterialActions'
import { MaterialBulkFields } from './MaterialBulkFields'
import type { MaterialCategoryContentProps } from './material-catalog-types'

export function MaterialMobileCards(props: MaterialCategoryContentProps) {
  return (
    <div className="divide-y divide-stone-800/60 md:hidden">
      {props.materials.map((material) => {
        const row = props.editRows[material.id]
        const selected = props.selectedForDeletion.has(material.id)
        const changed = props.changedIds.has(material.id)
        const critical = isCriticalMaterial(material)
        return (
          <article
            key={material.id}
            className={`space-y-3 p-4 ${
              selected ? 'bg-rose-950/30' : changed ? 'bg-amber-500/10' : critical ? 'bg-rose-950/20' : ''
            }`}
          >
            {props.bulkEditMode && row ? (
              <>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input type="checkbox" checked={selected} onChange={() => props.onToggleDeletion(material.id)} />
                  {material.name}
                  <span className="ml-auto text-xs text-amber-400">
                    {selected ? 'Silinecek' : changed ? 'Değişti' : ''}
                  </span>
                </label>
                <MaterialBulkFields material={material} row={row} selected={selected} onChange={props.onRowChange} />
              </>
            ) : (
              <>
                <div className="flex justify-between gap-3">
                  <h3 className="font-bold">
                    {material.name} {critical ? <span className="text-[10px] text-rose-400">⚠ Kritik</span> : null}
                  </h3>
                  <span className="text-xs text-stone-400">{material.unit}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 rounded-xl bg-stone-950/60 p-3 text-xs">
                  <div>
                    <dt className="text-stone-500">Birim fiyat</dt>
                    <dd className="font-bold text-amber-400">₺{material.price_per_unit.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Stok</dt>
                    <dd className="font-bold">{material.stock_quantity || 0}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Kritik seviye</dt>
                    <dd className={critical ? 'font-bold text-rose-400' : ''}>
                      {material.critical_stock_level || '-'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500">Toplam değer</dt>
                    <dd className="font-bold text-amber-400">
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
          </article>
        )
      })}
    </div>
  )
}

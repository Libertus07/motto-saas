import type { EditRow, Material } from '../types'
import { isCriticalMaterial } from '../utils'
import { MaterialActions } from './MaterialActions'
import { materialInputClass } from './MaterialBulkFields'
import type { MaterialCategoryContentProps } from './material-catalog-types'

const editableColumns: Array<{
  key: keyof EditRow
  className: string
  inputClassName: string
  type?: 'number'
}> = [
  { key: 'name', className: 'px-4 py-2', inputClassName: 'min-w-40 text-white' },
  { key: 'unit', className: 'px-4 py-2', inputClassName: 'min-w-20 text-white' },
  { key: 'category', className: 'px-4 py-2', inputClassName: 'min-w-28 text-white' },
  {
    key: 'price_per_unit',
    className: 'px-4 py-2',
    inputClassName: 'min-w-24 text-right text-amber-400',
    type: 'number',
  },
  {
    key: 'stock_quantity',
    className: 'px-4 py-2',
    inputClassName: 'min-w-20 text-right text-white',
    type: 'number',
  },
  {
    key: 'critical_stock_level',
    className: 'px-4 py-2',
    inputClassName: 'min-w-20 text-right text-rose-400',
    type: 'number',
  },
]

function MaterialEditRow({
  material,
  row,
  selected,
  changed,
  onRowChange,
  onToggleDeletion,
}: {
  material: Material
  row: EditRow
  selected: boolean
  changed: boolean
  onRowChange: MaterialCategoryContentProps['onRowChange']
  onToggleDeletion: MaterialCategoryContentProps['onToggleDeletion']
}) {
  return (
    <tr className={selected ? 'bg-rose-950/30' : changed ? 'bg-amber-500/10' : ''}>
      <td className="px-4 py-3 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleDeletion(material.id)}
          aria-label={`${material.name} silmek için seç`}
        />
      </td>
      {editableColumns.map((column) => (
        <td key={column.key} className={column.className}>
          <input
            type={column.type || 'text'}
            min={column.type === 'number' ? 0 : undefined}
            value={row[column.key]}
            disabled={selected}
            onChange={(event) => onRowChange(material.id, column.key, event.target.value)}
            className={`${materialInputClass} ${column.inputClassName}`}
          />
        </td>
      ))}
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
}

export function MaterialDesktopTable(props: MaterialCategoryContentProps) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-stone-950/60 text-[11px] uppercase text-stone-400">
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
          {props.materials.map((material) => {
            const row = props.editRows[material.id]
            const selected = props.selectedForDeletion.has(material.id)
            const changed = props.changedIds.has(material.id)
            const critical = isCriticalMaterial(material)
            if (props.bulkEditMode && row) {
              return (
                <MaterialEditRow
                  key={material.id}
                  material={material}
                  row={row}
                  selected={selected}
                  changed={changed}
                  onRowChange={props.onRowChange}
                  onToggleDeletion={props.onToggleDeletion}
                />
              )
            }
            return (
              <tr key={material.id} className={critical ? 'bg-rose-950/20' : 'hover:bg-stone-800/30'}>
                <td className="px-5 py-3.5 font-bold">
                  {material.name}{' '}
                  {critical ? (
                    <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-400">⚠ Kritik</span>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-stone-400">{material.unit}</td>
                <td className="px-4 py-3.5 text-right font-semibold text-amber-400">
                  ₺{material.price_per_unit.toFixed(2)}
                </td>
                <td className="px-4 py-3.5 text-right font-bold">{material.stock_quantity || 0}</td>
                <td className={`px-4 py-3.5 text-right ${critical ? 'font-bold text-rose-400' : 'text-stone-400'}`}>
                  {material.critical_stock_level || '-'}
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-amber-400">
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
  )
}

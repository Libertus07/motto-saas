import type { EditRow, Material } from '../types'
import type { MaterialCatalogProps } from './material-catalog-types'

export const materialInputClass =
  'w-full bg-stone-950 border border-stone-700 rounded-lg px-2 py-1.5 text-sm disabled:opacity-40'

export function MaterialBulkFields({
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
  const fields: Array<{
    key: keyof EditRow
    label: string
    type?: 'number'
    className?: string
    span?: boolean
  }> = [
    { key: 'name', label: 'Ad', span: true, className: 'text-white' },
    { key: 'unit', label: 'Birim', className: 'text-white' },
    { key: 'category', label: 'Kategori', className: 'text-white' },
    { key: 'price_per_unit', label: 'Birim fiyat', type: 'number', className: 'font-bold text-amber-400' },
    { key: 'stock_quantity', label: 'Stok', type: 'number', className: 'text-white' },
    { key: 'critical_stock_level', label: 'Kritik seviye', type: 'number', span: true, className: 'text-rose-400' },
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map((field) => (
        <label key={field.key} className={`${field.span ? 'col-span-2' : ''} text-xs text-stone-400`}>
          {field.label}
          <input
            type={field.type || 'text'}
            min={field.type === 'number' ? 0 : undefined}
            value={row[field.key]}
            disabled={selected}
            onChange={(event) => onChange(material.id, field.key, event.target.value)}
            className={`${materialInputClass} mt-1 ${field.className || ''}`}
          />
        </label>
      ))}
    </div>
  )
}

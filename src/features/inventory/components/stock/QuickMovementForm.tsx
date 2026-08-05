import type { InlineFormState, Material } from '../../types'
import type { StockMovementType } from './stock-list-types'

type QuickMovementFormProps = {
  material: Material
  movementType: StockMovementType
  form: InlineFormState
  onFormChange: (form: InlineFormState) => void
  onSubmit: () => void
  onCancel: () => void
}

export function QuickMovementForm({
  material,
  movementType,
  form,
  onFormChange,
  onSubmit,
  onCancel,
}: QuickMovementFormProps) {
  const isIncoming = movementType === 'giris'

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/50 bg-stone-900 p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex min-w-0 items-center gap-2 text-xs font-extrabold text-amber-400 sm:text-sm">
          <span>{isIncoming ? '📥 Hızlı Stok Girişi' : '📤 Hızlı Stok Çıkışı'}</span>
          <span className="truncate font-normal text-stone-400">({material.name})</span>
        </h4>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Hızlı işlemi kapat"
          className="text-stone-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-stone-400">
          Miktar ({material.unit}) *
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={form.quantity}
            onChange={(event) => onFormChange({ ...form, quantity: event.target.value })}
            className="mt-1 w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-bold text-white focus:border-amber-500/50 focus:outline-none"
            placeholder="0"
            autoFocus
          />
        </label>
        <label className="text-xs font-semibold text-stone-400">
          Birim Fiyat (₺)
          <input
            type="number"
            inputMode="decimal"
            min="0"
            value={form.unit_price}
            onChange={(event) => onFormChange({ ...form, unit_price: event.target.value })}
            className="mt-1 w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-sm font-bold text-amber-400 focus:border-amber-500/50 focus:outline-none"
            placeholder={material.price_per_unit.toString()}
          />
        </label>
        <label className="text-xs font-semibold text-stone-400 sm:col-span-2">
          Not
          <input
            type="text"
            value={form.note}
            onChange={(event) => onFormChange({ ...form, note: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSubmit()
            }}
            className="mt-1 w-full rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 text-xs text-white focus:border-amber-500/50 focus:outline-none sm:text-sm"
            placeholder="Not yazın..."
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-stone-700 bg-stone-800 px-4 py-2 text-xs font-semibold text-stone-300 transition-colors hover:bg-stone-700"
        >
          İptal
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className={`rounded-xl px-4 py-2 text-xs font-bold shadow-md transition-all active:scale-95 ${
            isIncoming
              ? 'bg-emerald-500 text-stone-950 hover:bg-emerald-400'
              : 'bg-rose-500 text-white hover:bg-rose-400'
          }`}
        >
          Kaydet
        </button>
      </div>
    </div>
  )
}

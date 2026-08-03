import type { MaterialFormValues } from '../types'
import { MATERIAL_UNITS } from '../workspace-utils'

type MaterialFormModalProps = {
  open: boolean
  editing: boolean
  form: MaterialFormValues
  onFormChange: (form: MaterialFormValues) => void
  categories: string[]
  packageMultiplier: number
  onPackageMultiplierChange: (value: number) => void
  saving: boolean
  onClose: () => void
  onSubmit: () => void
}

const inputClass =
  'w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50'

export function MaterialFormModal(props: MaterialFormModalProps) {
  if (!props.open) return null
  const unit = props.form.unit.toLowerCase()
  const canScaleThousand = ['kg', 'kilogram', 'litre', 'l'].includes(unit)
  const canSplitPackage = ['kutu', 'koli', 'paket', 'adet'].includes(unit)
  const update = (field: keyof MaterialFormValues, value: string) =>
    props.onFormChange({ ...props.form, [field]: value })

  const convertToSmallUnit = () => {
    const quantity = Number(props.form.stock_quantity) || 0
    const price = Number(props.form.price_per_unit) || 0
    props.onFormChange({
      ...props.form,
      unit: unit === 'kg' || unit === 'kilogram' ? 'Gram' : 'Ml',
      stock_quantity: String(quantity * 1000),
      price_per_unit: (price / 1000).toFixed(4),
    })
  }

  const convertToUnits = () => {
    if (props.packageMultiplier <= 1) return
    const quantity = Number(props.form.stock_quantity) || 0
    const price = Number(props.form.price_per_unit) || 0
    props.onFormChange({
      ...props.form,
      unit: 'Adet',
      stock_quantity: String(quantity * props.packageMultiplier),
      price_per_unit: (price / props.packageMultiplier).toFixed(4),
    })
  }

  return (
    <div
      className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose()
      }}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-form-title"
        className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden my-auto"
      >
        <header className="px-4 sm:px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between gap-3">
          <div>
            <h2 id="material-form-title" className="font-bold text-white text-base sm:text-lg">
              {props.editing ? `${props.form.name || 'Hammadde'} Düzenle` : 'Yeni Hammadde Ekle'}
            </h2>
            <p className="text-stone-400 text-xs">Stok, fiyat ve kritik uyarı seviyesini tanımlayın.</p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Pencereyi kapat"
            className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-stone-300 text-xs font-semibold">
              Hammadde Adı *
              <input
                autoFocus
                value={props.form.name}
                onChange={(event) => update('name', event.target.value)}
                className={`${inputClass} mt-1`}
                placeholder="Örn. Espresso çekirdeği"
              />
            </label>
            <label className="text-stone-300 text-xs font-semibold">
              Kategori
              <select
                value={props.form.category}
                onChange={(event) => update('category', event.target.value)}
                className={`${inputClass} mt-1`}
              >
                {props.categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="text-stone-300 text-xs font-semibold">
              Ölçü Birimi *
              <select
                value={props.form.unit}
                onChange={(event) => update('unit', event.target.value)}
                className={`${inputClass} mt-1`}
              >
                {MATERIAL_UNITS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="text-stone-300 text-xs font-semibold">
              Birim Fiyat (₺) *
              <input
                type="number"
                min="0"
                step="0.01"
                value={props.form.price_per_unit}
                onChange={(event) => update('price_per_unit', event.target.value)}
                className={`${inputClass} mt-1 text-amber-400 font-bold`}
              />
            </label>
            <label className="text-stone-300 text-xs font-semibold">
              Stok Miktarı
              <input
                type="number"
                min="0"
                value={props.form.stock_quantity}
                onChange={(event) => update('stock_quantity', event.target.value)}
                className={`${inputClass} mt-1 font-bold`}
              />
            </label>
            <label className="text-rose-400 text-xs font-semibold">
              Kritik Stok Uyarısı
              <input
                type="number"
                min="0"
                value={props.form.critical_stock_level}
                onChange={(event) => update('critical_stock_level', event.target.value)}
                className={`${inputClass} mt-1 text-rose-400 font-bold border-rose-500/30`}
              />
            </label>
          </div>

          {canScaleThousand || canSplitPackage ? (
            <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800 space-y-3">
              <h3 className="font-bold text-amber-400 text-xs">⚖️ Birim Dönüştürme</h3>
              {canScaleThousand ? (
                <button
                  type="button"
                  onClick={convertToSmallUnit}
                  className="bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-300 font-semibold px-3 py-2 rounded-xl text-xs"
                >
                  {unit === 'kg' || unit === 'kilogram' ? 'Grama' : 'Mililitreye'} dönüştür (×1000)
                </button>
              ) : null}
              {canSplitPackage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-stone-400 text-xs">
                    İçindeki adet{' '}
                    <input
                      type="number"
                      min="1"
                      value={props.packageMultiplier}
                      onChange={(event) => props.onPackageMultiplierChange(Number(event.target.value) || 1)}
                      className="w-20 ml-2 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={convertToUnits}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-2 rounded-lg text-xs"
                  >
                    Adede Çevir
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="px-4 sm:px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
          <button
            onClick={props.onClose}
            disabled={props.saving}
            className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-300 px-5 py-2.5 rounded-xl text-xs font-semibold"
          >
            İptal
          </button>
          <button
            onClick={props.onSubmit}
            disabled={props.saving}
            className="bg-gradient-to-r from-amber-500 to-amber-600 disabled:opacity-50 text-stone-950 font-extrabold px-6 py-2.5 rounded-xl text-xs"
          >
            {props.saving ? 'Kaydediliyor…' : props.editing ? 'Hammaddeyi Güncelle' : 'Hammaddeyi Kaydet'}
          </button>
        </footer>
      </section>
    </div>
  )
}

import React from 'react'
import { Material, MovementFormState } from '../types'

type StockMovementFormProps = {
  materials: Material[]
  form: MovementFormState
  onChange: (form: MovementFormState) => void
  onSubmit: () => void
  onCancel: () => void
}

const movementTypes = [
  { value: 'giris', label: '📥 Stok Girişi', color: 'text-emerald-400' },
  { value: 'cikis', label: '📤 Stok Çıkışı', color: 'text-rose-400' },
  { value: 'fire', label: '🔥 Fire / Zayi', color: 'text-orange-400' },
]

export function StockMovementForm({ materials, form, onChange, onSubmit, onCancel }: StockMovementFormProps) {
  return (
    <div
      className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      onClick={onCancel}
    >
      <div
        className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
              📦
            </div>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg">Yeni Stok Hareketi</h3>
              <p className="text-stone-400 text-xs">Depoya stok girişi, çıkışı veya fire kaydı ekleyin.</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Hammadde Seçin *</label>
              <select
                value={form.material_id}
                onChange={(e) => onChange({ ...form, material_id: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="">Seçiniz...</option>
                {materials.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Mevcut: {i.stock_quantity || 0} {i.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Hareket Türü *</label>
              <select
                value={form.movement_type}
                onChange={(e) => onChange({ ...form, movement_type: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
              >
                {movementTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Miktar *</label>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => onChange({ ...form, quantity: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                placeholder="0"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Birim Fiyat (₺) — opsiyonel</label>
              <input
                type="number"
                value={form.unit_price}
                onChange={(e) => onChange({ ...form, unit_price: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500/50"
                placeholder="Boş bırakırsanız sistemdeki varsayılan fiyat kullanılır"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Açıklama / Not</label>
              <input
                value={form.note}
                onChange={(e) => onChange({ ...form, note: e.target.value })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500/50"
                placeholder="örn: Metro Toptancı Market'ten sipariş alındı"
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={onSubmit}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            Hareketi Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

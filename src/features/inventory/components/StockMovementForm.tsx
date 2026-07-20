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
    { value: 'giris', label: '📥 Stok Girişi', color: 'text-green-400' },
    { value: 'cikis', label: '📤 Stok Çıkışı', color: 'text-red-400' },
    { value: 'fire', label: '🔥 Fire/Zayi', color: 'text-orange-400' },
]

export function StockMovementForm({ materials, form, onChange, onSubmit, onCancel }: StockMovementFormProps) {
    return (
        <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">Stok Hareketi Ekle</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="text-stone-400 text-sm mb-1 block">Hammadde *</label>
                    <select
                        value={form.material_id}
                        onChange={e => onChange({ ...form, material_id: e.target.value })}
                        className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    >
                        <option value="">Seçin</option>
                        {materials.map(i => (
                            <option key={i.id} value={i.id}>
                                {i.name} (Mevcut: {i.stock_quantity || 0} {i.unit})
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-stone-400 text-sm mb-1 block">Hareket Türü</label>
                    <select
                        value={form.movement_type}
                        onChange={e => onChange({ ...form, movement_type: e.target.value })}
                        className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    >
                        {movementTypes.map(t => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-stone-400 text-sm mb-1 block">Miktar *</label>
                    <input
                        type="number"
                        value={form.quantity}
                        onChange={e => onChange({ ...form, quantity: e.target.value })}
                        className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        placeholder="0"
                    />
                </div>
                <div>
                    <label className="text-stone-400 text-sm mb-1 block">Birim Fiyat (₺) — opsiyonel</label>
                    <input
                        type="number"
                        value={form.unit_price}
                        onChange={e => onChange({ ...form, unit_price: e.target.value })}
                        className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        placeholder="Boş bırakırsanız kayıtlı fiyat kullanılır"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="text-stone-400 text-sm mb-1 block">Not</label>
                    <input
                        value={form.note}
                        onChange={e => onChange({ ...form, note: e.target.value })}
                        className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                        placeholder="örn: Metro'dan alındı"
                    />
                </div>
            </div>
            <div className="flex gap-3 mt-4">
                <button
                    onClick={onSubmit}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors"
                >
                    Kaydet
                </button>
                <button
                    onClick={onCancel}
                    className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors"
                >
                    İptal
                </button>
            </div>
        </div>
    )
}

import React, { Fragment } from 'react'
import { formatCurrency } from "@/lib/format"
import { Material, InlineFormState } from '../../types'

type StockListTabProps = {
    materials: Material[]
    inlineMovementMatId: string | null
    inlineMovementType: 'giris' | 'cikis'
    inlineForm: InlineFormState
    onInlineMatIdChange: (id: string, type: 'giris' | 'cikis') => void
    onInlineFormChange: (form: InlineFormState) => void
    onInlineSubmit: () => void
    onInlineCancel: () => void
}

export function StockListTab({
    materials,
    inlineMovementMatId,
    inlineMovementType,
    inlineForm,
    onInlineMatIdChange,
    onInlineFormChange,
    onInlineSubmit,
    onInlineCancel
}: StockListTabProps) {
    return (
        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <div className="overflow-x-auto w-full">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-stone-800">
                            <th className="text-left px-4 py-3 text-stone-400 text-sm">Hammadde</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Mevcut Stok</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Kritik Seviye</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Stok Değeri</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Durum</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Hızlı İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {materials.map(mat => {
                            const isCritical = (mat.stock_quantity || 0) <= (mat.critical_stock_level || 0) && (mat.critical_stock_level || 0) > 0
                            const stockValue = (mat.stock_quantity || 0) * mat.price_per_unit
                            return (
                                <Fragment key={mat.id}>
                                    <tr className={`border-b border-stone-800 hover:bg-stone-800 transition-colors ${inlineMovementMatId === mat.id ? 'bg-amber-900/10' : ''}`}>
                                        <td className="px-4 py-3 font-medium">{mat.name}</td>
                                        <td className={`px-4 py-3 text-right font-bold ${isCritical ? 'text-red-400' : 'text-green-400'}`}>
                                            {mat.stock_quantity || 0} {mat.unit}
                                        </td>
                                        <td className="px-4 py-3 text-right text-stone-400">
                                            {mat.critical_stock_level || 0} {mat.unit}
                                        </td>
                                        <td className="px-4 py-3 text-right text-amber-400">{formatCurrency(stockValue)}</td>
                                        <td className="px-4 py-3 text-right">
                                            {isCritical
                                                ? <span className="text-red-400 text-sm">🚨 Kritik</span>
                                                : <span className="text-green-400 text-sm">✓ Normal</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => onInlineMatIdChange(mat.id, 'giris')}
                                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${inlineMovementMatId === mat.id && inlineMovementType === 'giris' ? 'bg-green-500 text-stone-950' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'}`}
                                                >
                                                    📥 Giriş
                                                </button>
                                                <button 
                                                    onClick={() => onInlineMatIdChange(mat.id, 'cikis')}
                                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${inlineMovementMatId === mat.id && inlineMovementType === 'cikis' ? 'bg-red-500 text-stone-950' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'}`}
                                                >
                                                    📤 Çıkış
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {inlineMovementMatId === mat.id && (
                                        <tr>
                                            <td colSpan={6} className="p-4 bg-stone-950/80 border-b-2 border-amber-500/40">
                                                <div className="bg-stone-900 border border-amber-400/60 rounded-xl p-5">
                                                    <h3 className="font-bold mb-4 flex items-center gap-2">
                                                        {inlineMovementType === 'giris' ? '📥 Hızlı Stok Girişi' : '📤 Hızlı Stok Çıkışı'}
                                                        <span className="text-stone-400 text-sm">({mat.name})</span>
                                                    </h3>
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                        <div>
                                                            <label className="text-stone-400 text-xs mb-1 block">Miktar *</label>
                                                            <input
                                                                type="number"
                                                                value={inlineForm.quantity}
                                                                onChange={e => onInlineFormChange({ ...inlineForm, quantity: e.target.value })}
                                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                                                placeholder="0"
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-stone-400 text-xs mb-1 block">Birim Fiyat (opsiyonel)</label>
                                                            <input
                                                                type="number"
                                                                value={inlineForm.unit_price}
                                                                onChange={e => onInlineFormChange({ ...inlineForm, unit_price: e.target.value })}
                                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                                                placeholder={mat.price_per_unit.toString()}
                                                            />
                                                        </div>
                                                        <div className="md:col-span-2">
                                                            <label className="text-stone-400 text-xs mb-1 block">Not (opsiyonel)</label>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={inlineForm.note}
                                                                    onChange={e => onInlineFormChange({ ...inlineForm, note: e.target.value })}
                                                                    className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                                                    placeholder="Açıklama girin..."
                                                                    onKeyDown={e => {
                                                                        if(e.key === 'Enter') onInlineSubmit()
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={onInlineSubmit}
                                                                    className={`px-4 py-2 rounded-lg font-bold transition-colors ${inlineMovementType === 'giris' ? 'bg-green-500 hover:bg-green-400 text-stone-950' : 'bg-red-500 hover:bg-red-400 text-stone-950'}`}
                                                                >
                                                                    Kaydet
                                                                </button>
                                                                <button
                                                                    onClick={onInlineCancel}
                                                                    className="bg-stone-700 hover:bg-stone-600 text-white px-4 py-2 rounded-lg transition-colors"
                                                                >
                                                                    İptal
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            )
                        })}
                        {materials.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-stone-400">Hammadde bulunamadı.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

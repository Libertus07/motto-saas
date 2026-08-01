import React, { Fragment, useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
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
  onInlineCancel,
}: StockListTabProps) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'tumu' | 'normal' | 'kritik'>('tumu')

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesSearch = !search.trim() || m.name.toLowerCase().includes(search.toLowerCase())
      const isCritical = (m.stock_quantity || 0) <= (m.critical_stock_level || 0) && (m.critical_stock_level || 0) > 0

      if (!matchesSearch) return false
      if (filterStatus === 'normal' && isCritical) return false
      if (filterStatus === 'kritik' && !isCritical) return false

      return true
    })
  }, [materials, search, filterStatus])

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hammadde stoklarında ara..."
            className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-colors placeholder:text-stone-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus('tumu')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              filterStatus === 'tumu'
                ? 'bg-stone-800 text-white border border-stone-700'
                : 'bg-stone-950 text-stone-400 hover:text-stone-200'
            }`}
          >
            Tümü ({materials.length})
          </button>
          <button
            onClick={() => setFilterStatus('kritik')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              filterStatus === 'kritik'
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-stone-950 text-rose-400/70 hover:text-rose-400'
            }`}
          >
            🚨 Kritik Stok
          </button>
        </div>
      </div>

      {/* Container Card */}
      <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5">Hammadde Adı</th>
                <th className="px-4 py-3.5 text-right">Mevcut Stok</th>
                <th className="px-4 py-3.5 text-right">Kritik Seviye</th>
                <th className="px-4 py-3.5 text-right">Stok Değeri (₺)</th>
                <th className="px-4 py-3.5 text-center">Durum</th>
                <th className="px-5 py-3.5 text-right">Hızlı İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
              {filteredMaterials.map((mat) => {
                const isCritical =
                  (mat.stock_quantity || 0) <= (mat.critical_stock_level || 0) && (mat.critical_stock_level || 0) > 0
                const stockValue = (mat.stock_quantity || 0) * mat.price_per_unit

                return (
                  <Fragment key={mat.id}>
                    <tr
                      className={`hover:bg-stone-800/30 transition-colors ${
                        inlineMovementMatId === mat.id ? 'bg-amber-500/10' : ''
                      } ${isCritical ? 'bg-rose-950/20' : ''}`}
                    >
                      <td className="px-5 py-3.5 font-bold text-stone-100">{mat.name}</td>
                      <td
                        className={`px-4 py-3.5 text-right font-extrabold ${
                          isCritical ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {mat.stock_quantity || 0} {mat.unit}
                      </td>
                      <td className="px-4 py-3.5 text-right text-stone-400">
                        {mat.critical_stock_level ? `${mat.critical_stock_level} ${mat.unit}` : '-'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-extrabold text-amber-400">
                        {formatCurrency(stockValue)}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {isCritical ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold animate-pulse">
                            🚨 Kritik
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
                            ✓ Normal
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onInlineMatIdChange(mat.id, 'giris')}
                            className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${
                              inlineMovementMatId === mat.id && inlineMovementType === 'giris'
                                ? 'bg-emerald-500 text-stone-950 shadow-md shadow-emerald-500/20'
                                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            📥 Giriş
                          </button>
                          <button
                            onClick={() => onInlineMatIdChange(mat.id, 'cikis')}
                            className={`px-3 py-1 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${
                              inlineMovementMatId === mat.id && inlineMovementType === 'cikis'
                                ? 'bg-rose-500 text-stone-950 shadow-md shadow-rose-500/20'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            📤 Çıkış
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* INLINE MOVEMENT ENTRY ROW */}
                    {inlineMovementMatId === mat.id && (
                      <tr>
                        <td colSpan={6} className="p-4 bg-stone-950/90 border-b-2 border-amber-500/40">
                          <div className="bg-stone-900 border border-amber-500/50 rounded-2xl p-4 shadow-xl space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-extrabold text-amber-400 text-xs sm:text-sm flex items-center gap-2">
                                <span>
                                  {inlineMovementType === 'giris' ? '📥 Hızlı Stok Girişi' : '📤 Hızlı Stok Çıkışı'}
                                </span>
                                <span className="text-stone-400 font-normal">({mat.name})</span>
                              </h4>
                              <button onClick={onInlineCancel} className="text-stone-400 hover:text-white text-xs">
                                ✕
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <label className="text-stone-400 text-xs mb-1 block font-semibold">
                                  Miktar ({mat.unit}) *
                                </label>
                                <input
                                  type="number"
                                  value={inlineForm.quantity}
                                  onChange={(e) => onInlineFormChange({ ...inlineForm, quantity: e.target.value })}
                                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                                  placeholder="0"
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="text-stone-400 text-xs mb-1 block font-semibold">
                                  Birim Fiyat (₺)
                                </label>
                                <input
                                  type="number"
                                  value={inlineForm.unit_price}
                                  onChange={(e) => onInlineFormChange({ ...inlineForm, unit_price: e.target.value })}
                                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500/50"
                                  placeholder={mat.price_per_unit.toString()}
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="text-stone-400 text-xs mb-1 block font-semibold">Not</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={inlineForm.note}
                                    onChange={(e) => onInlineFormChange({ ...inlineForm, note: e.target.value })}
                                    className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50"
                                    placeholder="Not yazın..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') onInlineSubmit()
                                    }}
                                  />
                                  <button
                                    onClick={onInlineSubmit}
                                    className={`px-4 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-md ${
                                      inlineMovementType === 'giris'
                                        ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                                        : 'bg-rose-500 hover:bg-rose-400 text-white'
                                    }`}
                                  >
                                    Kaydet
                                  </button>
                                  <button
                                    onClick={onInlineCancel}
                                    className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
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

              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-stone-500">
                    Filtrelerinize uygun hammadde stok verisi bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-stone-800/60">
          {filteredMaterials.map((mat) => {
            const isCritical =
              (mat.stock_quantity || 0) <= (mat.critical_stock_level || 0) && (mat.critical_stock_level || 0) > 0
            const stockValue = (mat.stock_quantity || 0) * mat.price_per_unit

            return (
              <div
                key={mat.id}
                className={`p-4 space-y-3 hover:bg-stone-800/20 transition-colors ${
                  isCritical ? 'bg-rose-950/20' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>{mat.name}</span>
                    {isCritical && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold">
                        🚨 Kritik
                      </span>
                    )}
                  </h4>
                  <span className="text-stone-400 text-xs font-semibold">{mat.unit}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px]">Mevcut Stok</span>
                    <span className={`font-extrabold ${isCritical ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {mat.stock_quantity || 0} {mat.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">Stok Değeri</span>
                    <span className="font-extrabold text-amber-400">{formatCurrency(stockValue)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => onInlineMatIdChange(mat.id, 'giris')}
                    className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold border border-emerald-500/20"
                  >
                    📥 Giriş Yap
                  </button>
                  <button
                    onClick={() => onInlineMatIdChange(mat.id, 'cikis')}
                    className="px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-xl text-xs font-bold border border-rose-500/20"
                  >
                    📤 Çıkış Yap
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

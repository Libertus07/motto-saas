'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

type Material = {
  id: string
  name: string
  unit: string
  price_per_unit: number
  stock_quantity: number
  category?: string
  critical_stock_level?: number
}

type PriceHistory = {
  id: string
  old_price: number
  new_price: number
  source: string
  created_at: string
}

// Düzenlenebilir satır tipi
type EditRow = {
  id: string
  name: string
  unit: string
  price_per_unit: string
  stock_quantity: string
  category: string
}

export default function Hammaddeler() {
  const { showAlert, showConfirm } = useNotification()
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<string[]>(['Diğer'])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedMatName, setSelectedMatName] = useState('')
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Açık kategoriler kümesi
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Hızlı Düzenleme modu
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({})
  const [bulkSaving, setBulkSaving] = useState(false)
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())

  // Otomatik Kategorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<{ id: string; name: string; current: string; suggested: string }[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    category: 'Diğer',
    unit: 'Kg',
    price_per_unit: '',
    stock_quantity: '0',
  })

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchMaterials() }, [])

  const fetchMaterials = async () => {
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('settings').select('*')
    ])

    setMaterials(data || [])

    const catsSetting = settings?.find((s: any) => s.key === 'material_categories')?.value
    if (catsSetting) {
      const cats: string[] = Array.isArray(catsSetting) ? catsSetting : JSON.parse(catsSetting)
      setCategories(cats)
      setOpenCategories(new Set(cats)) // Başta hepsi açık
    }

    setLoading(false)
  }

  // Hızlı Düzelme modunu aç
  const enterBulkEdit = () => {
    const rows: Record<string, EditRow> = {}
    materials.forEach(m => {
      rows[m.id] = {
        id: m.id,
        name: m.name,
        unit: m.unit,
        price_per_unit: m.price_per_unit.toString(),
        stock_quantity: (m.stock_quantity || 0).toString(),
        category: m.category || 'Diğer',
      }
    })
    setEditRows(rows)
    setChangedIds(new Set())
    setBulkEditMode(true)
    setShowForm(false)
  }

  // Tek bir satırın alanını güncelle ve değiştiği olarak işaretle
  const updateEditRow = (id: string, field: keyof EditRow, value: string) => {
    setEditRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
    setChangedIds(prev => new Set([...prev, id]))
  }

  // Tüm değişenleri kaydet
  const handleBulkSave = async () => {
    setBulkSaving(true)
    const toUpdate = [...changedIds]
    const bulkDetails: string[] = []

    for (const id of toUpdate) {
      const row = editRows[id]
      const oldMat = materials.find(m => m.id === id)
      const newPrice = parseFloat(row.price_per_unit)
      const oldPrice = oldMat?.price_per_unit || 0
      const newStock = parseFloat(row.stock_quantity) || 0
      const oldStock = oldMat?.stock_quantity || 0

      const changes = []
      if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice}->${newPrice}`)
      if (oldStock !== newStock) changes.push(`Stok: ${oldStock}->${newStock}`)
      if (oldMat?.category !== row.category) changes.push(`Kategori: ${oldMat?.category || 'Diğer'}->${row.category}`)

      if (changes.length > 0) {
         bulkDetails.push(`${row.name} (${changes.join(', ')})`)
      }

      await supabase.from('materials').update({
        name: row.name,
        unit: row.unit,
        category: row.category,
        price_per_unit: newPrice,
        stock_quantity: newStock,
      }).eq('id', id)

      // Fiyat değiştiyse geçmişe kaydet
      if (!isNaN(newPrice) && newPrice !== oldPrice) {
        await supabase.from('material_price_history').insert({
          material_id: id,
          old_price: oldPrice,
          new_price: newPrice,
          source: 'manual'
        })
      }
    }

    setBulkEditMode(false)
    setChangedIds(new Set())
    setBulkSaving(false)
    fetchMaterials()
    logActivity('Hammadde', 'GUNCELLEME', `${changedIds.size} adet hammaddenin bilgileri (fiyat/stok/kategori) topluca güncellendi.`, bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : undefined)
  }

  // Otomatik Kategorize — AI'dan öneri al
  const handleAutoCategorize = async () => {
    setAutoCatLoading(true)
    try {
      const res = await fetch('/api/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materials: materials.map(m => ({ id: m.id, name: m.name, category: m.category })),
          categories
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Mevcut kategoriden farklı öneri olanları göster
      const suggestions = (data.suggestions || []).map((s: any) => {
        const mat = materials.find(m => m.id === s.id)
        return {
          id: s.id,
          name: mat?.name || s.id,
          current: mat?.category || 'Diğer',
          suggested: s.suggested_category
        }
      }).filter((s: any) => s.suggested !== s.current)

      setAutoCatSuggestions(suggestions)
      setAutoCatModalOpen(true)
    } catch (e: any) {
      await showAlert('Hata: ' + e.message, 'error')
    }
    setAutoCatLoading(false)
  }

  // Onaylanan önerileri kaydet
  const handleApplyAutoCat = async (approved: { id: string; suggested: string }[]) => {
    setAutoCatSaving(true)
    for (const item of approved) {
      await supabase.from('materials').update({ category: item.suggested }).eq('id', item.id)
    }
    setAutoCatModalOpen(false)
    setAutoCatSuggestions([])
    setAutoCatSaving(false)
    fetchMaterials()
    logActivity('Hammadde', 'GUNCELLEME', `${approved.length} adet hammaddenin kategorisi yapay zeka ile otomatik güncellendi.`)
  }

  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleAll = (open: boolean) => {
    if (open) {
      setOpenCategories(new Set([...categories, 'Diğer', 'Kategorisiz']))
    } else {
      setOpenCategories(new Set())
    }
  }

  const resetForm = () => {
    setForm({ name: '', category: 'Diğer', unit: 'Kg', price_per_unit: '', stock_quantity: '0' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.price_per_unit) return

    const payload = {
      name: form.name,
      category: form.category,
      unit: form.unit,
      price_per_unit: parseFloat(form.price_per_unit),
      stock_quantity: parseFloat(form.stock_quantity) || 0,
    }

    let details = ''

    if (editingId) {
      const oldMat = materials.find(m => m.id === editingId)
      const oldPrice = oldMat ? oldMat.price_per_unit : 0
      const oldStock = oldMat ? (oldMat.stock_quantity || 0) : 0
      const newPrice = payload.price_per_unit
      const newStock = payload.stock_quantity

      const changes = []
      if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice} -> ${newPrice} ₺`)
      if (oldStock !== newStock) changes.push(`Stok: ${oldStock} -> ${newStock}`)
      if (oldMat?.category !== payload.category) changes.push(`Kategori: ${oldMat?.category || 'Diğer'} -> ${payload.category}`)
      
      details = changes.length > 0 ? changes.join(', ') : 'İsim veya birim güncellendi'

      await supabase.from('materials').update(payload).eq('id', editingId)
      if (oldPrice !== newPrice) {
        await supabase.from('material_price_history').insert({
          material_id: editingId,
          old_price: oldPrice,
          new_price: newPrice,
          source: 'manual'
        })
      }
    } else {
      details = `Fiyat: ${payload.price_per_unit} ₺, Stok: ${payload.stock_quantity}, Kategori: ${payload.category}`
      const { data } = await supabase.from('materials').insert(payload).select().single()
      if (data) {
        await supabase.from('material_price_history').insert({
          material_id: data.id,
          old_price: 0,
          new_price: payload.price_per_unit,
          source: 'manual'
        })
      }
    }

    resetForm()
    fetchMaterials()
    logActivity('Hammadde', editingId ? 'GUNCELLEME' : 'EKLEME', `${form.name} isimli hammadde ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`, { detay: details })
  }

  const handleEdit = (mat: Material) => {
    setForm({
      name: mat.name,
      category: mat.category || 'Diğer',
      unit: mat.unit,
      price_per_unit: mat.price_per_unit.toString(),
      stock_quantity: (mat.stock_quantity || 0).toString(),
    })
    setEditingId(mat.id)
    setShowForm(false) // Üst formu kapat, inline açılacak
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('Bu hammaddeyi silmek istediğinize emin misiniz?', 'Hammaddeyi Sil 🗑️')
    if (!confirmed) return
    await supabase.from('materials').delete().eq('id', id)
    fetchMaterials()
    logActivity('Hammadde', 'SILME', `Bir hammadde sistemden silindi.`, { materialId: id })
  }

  const handleViewHistory = async (mat: Material) => {
    setSelectedMatName(mat.name)
    setHistoryModalOpen(true)
    setLoadingHistory(true)
    const { data } = await supabase
      .from('material_price_history')
      .select('*')
      .eq('material_id', mat.id)
      .order('created_at', { ascending: false })
    setPriceHistory(data || [])
    setLoadingHistory(false)
  }

  const units = ['Kg', 'Gram', 'Litre', 'Ml', 'Adet', 'Paket']

  // Arama filtresi
  const filteredMaterials = search.trim()
    ? materials.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    : materials

  // Kategori bazlı gruplama
  const groupedByCategory = (() => {
    const allCats = [...new Set([...categories, ...filteredMaterials.map(m => m.category || 'Diğer')])]
    return allCats
      .map(cat => ({
        cat,
        items: filteredMaterials.filter(m => (m.category || 'Diğer') === cat)
      }))
      .filter(g => g.items.length > 0)
  })()

  const totalValue = materials.reduce((t, m) => t + (m.stock_quantity || 0) * m.price_per_unit, 0)

  return (
    <div className="min-h-full bg-stone-950 text-white">
      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧪</span>
          <div>
            <h1 className="font-bold text-amber-400">Hammaddeler</h1>
            <p className="text-stone-500 text-xs">
              {materials.length} ürün &nbsp;·&nbsp; Toplam Stok Değeri:{' '}
              <span className="text-amber-400 font-bold">₺{totalValue.toFixed(2)}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {bulkEditMode ? (
            <>
              <span className="text-stone-400 text-sm flex items-center px-3">
                {changedIds.size > 0 ? (
                  <span className="text-amber-400 font-medium">{changedIds.size} satır düzenlendi</span>
                ) : 'Hiçbir değişiklik yapılmadı'}
              </span>
              <button
                onClick={() => { setBulkEditMode(false); setChangedIds(new Set()) }}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
              >
                İptal
              </button>
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || changedIds.size === 0}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {bulkSaving ? (
                  <><span className="w-3.5 h-3.5 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" /> Kaydediliyor...</>
                ) : (
                  <>✓ Tümünü Kaydet</>
                )}
              </button>
            </>
          ) : (
            <>

              <button
                onClick={enterBulkEdit}
                className="bg-stone-700 hover:bg-stone-600 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors border border-stone-600 flex items-center gap-2"
              >
                ✏️ Hızlı Düzenleme
              </button>
              <button
                onClick={handleAutoCategorize}
                disabled={autoCatLoading}
                className="bg-violet-700 hover:bg-violet-600 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {autoCatLoading ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analiz ediliyor...</>
                ) : (
                  <>🤖 Otomatik Kategorize</>
                )}
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true) }}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                + Yeni Hammadde
              </button>
            </>
          )}
        </div>
      </header>

      <main className="p-6">
        {/* Üst Form — Sadece Yeni Ekleme için */}
        {showForm && !editingId && (
          <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">
              Yeni Hammadde Ekle
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Hammadde Adı *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="örn: Espresso Çekirdeği"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Kategori</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Birim *</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Birim Fiyat (₺) *</label>
                <input
                  type="number"
                  value={form.price_per_unit}
                  onChange={e => setForm({ ...form, price_per_unit: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Stok Miktarı</label>
                <input
                  type="number"
                  value={form.stock_quantity}
                  onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSubmit}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors"
              >
                Kaydet
              </button>
              <button
                onClick={resetForm}
                className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* İçerik */}
        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : materials.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">🧪</div>
            <p>Henüz hammadde eklenmemiş.</p>
            <p className="text-sm mt-1">Yukarıdaki butonu kullanarak başlayın.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Arama + Tümünü aç/kapat */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Hammadde ara..."
                  className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                onClick={() => toggleAll(openCategories.size === 0)}
                className="text-stone-400 hover:text-white text-sm px-4 py-2.5 bg-stone-900 border border-stone-800 rounded-lg transition-colors whitespace-nowrap"
              >
                {openCategories.size === 0 ? '▼ Tümünü Aç' : '▲ Tümünü Kapat'}
              </button>
            </div>

            {/* Kategori Accordion'ları */}
            {groupedByCategory.map(({ cat, items }) => {
              const isOpen = openCategories.has(cat)
              const catTotal = items.reduce((t, m) => t + (m.stock_quantity || 0) * m.price_per_unit, 0)
              const criticalCount = items.filter(m =>
                m.critical_stock_level != null && (m.stock_quantity || 0) < m.critical_stock_level
              ).length

              return (
                <div key={cat} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                  {/* Başlık Satırı - Tıklanabilir */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-800/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-stone-500 text-xs transition-transform duration-200"
                        style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      >
                        ▶
                      </span>
                      <span className="font-semibold text-white">{cat}</span>
                      <span className="bg-stone-800 group-hover:bg-stone-700 text-stone-400 text-xs px-2 py-0.5 rounded-full transition-colors">
                        {items.length} ürün
                      </span>
                      {criticalCount > 0 && (
                        <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full font-medium">
                          ⚠ {criticalCount} kritik
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-amber-400 font-bold text-sm">₺{catTotal.toFixed(2)}</span>
                      <span className="text-stone-500 text-xs ml-1">stok değeri</span>
                    </div>
                  </button>

                  {/* Açılır/Kapanır İçerik */}
                  {isOpen && (
                    <div className="border-t border-stone-800">
                      <div className="overflow-x-auto w-full">
<table className="w-full">
                        <thead>
                          <tr className="bg-stone-950/40 border-b border-stone-800">
                            <th className="text-left px-5 py-2.5 text-stone-500 text-xs font-medium">Hammadde</th>
                            <th className="text-left px-4 py-2.5 text-stone-500 text-xs font-medium">Birim</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Birim Fiyat</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Stok</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Toplam</th>
                            <th className="text-right px-5 py-2.5 text-stone-500 text-xs font-medium">
                              {bulkEditMode ? 'Durum' : 'İşlem'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(mat => {
                            const isCritical = mat.critical_stock_level != null &&
                              (mat.stock_quantity || 0) < mat.critical_stock_level
                            const row = editRows[mat.id]

                            if (bulkEditMode && row) {
                              const isChanged = changedIds.has(mat.id)
                              const inputCls = "w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400"
                              return (
                                <tr key={mat.id} className={`border-b border-stone-800/50 last:border-0 transition-colors ${isChanged ? 'bg-amber-950/20' : ''}`}>
                                  <td className="px-2 py-2">
                                    <input
                                      value={row.name}
                                      onChange={e => updateEditRow(mat.id, 'name', e.target.value)}
                                      className={inputCls}
                                      placeholder="Ad"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <select
                                      value={row.unit}
                                      onChange={e => updateEditRow(mat.id, 'unit', e.target.value)}
                                      className={inputCls}
                                    >
                                      {['Kg','Gram','Litre','Ml','Adet','Paket'].map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="number"
                                      value={row.price_per_unit}
                                      onChange={e => updateEditRow(mat.id, 'price_per_unit', e.target.value)}
                                      className={inputCls + ' text-right'}
                                      placeholder="0.00"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      type="number"
                                      value={row.stock_quantity}
                                      onChange={e => updateEditRow(mat.id, 'stock_quantity', e.target.value)}
                                      className={inputCls + ' text-right'}
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-right text-amber-400 font-bold text-sm">
                                    ₺{(parseFloat(row.stock_quantity || '0') * parseFloat(row.price_per_unit || '0')).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    {isChanged && <span className="text-amber-400 text-xs font-medium">● değişti</span>}
                                  </td>
                                </tr>
                              )
                            }

                            return (
                              <Fragment key={mat.id}>
                                <tr
                                  className={`border-b border-stone-800/50 ${editingId === mat.id ? '' : 'last:border-0 hover:bg-stone-800/30'} transition-colors ${isCritical ? 'bg-red-950/10' : ''} ${editingId === mat.id ? 'bg-amber-900/10' : ''}`}
                                >
                                <td className="px-5 py-3">
                                  <span className="font-medium text-white">{mat.name}</span>
                                  {isCritical && (
                                    <span className="ml-2 text-red-400 text-xs">⚠ Kritik</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-stone-400 text-sm">{mat.unit}</td>
                                <td className="px-4 py-3 text-right text-stone-300 text-sm">
                                  ₺{mat.price_per_unit.toFixed(2)}
                                </td>
                                <td className={`px-4 py-3 text-right text-sm font-medium ${isCritical ? 'text-red-400' : 'text-stone-300'}`}>
                                  {mat.stock_quantity || 0}
                                </td>
                                <td className="px-4 py-3 text-right text-amber-400 font-bold text-sm">
                                  ₺{((mat.stock_quantity || 0) * mat.price_per_unit).toFixed(2)}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <div className="flex items-center justify-end gap-3">
                                    <button
                                      onClick={() => handleViewHistory(mat)}
                                      title="Fiyat Geçmişi"
                                      className="text-stone-500 hover:text-amber-400 transition-colors text-base"
                                    >
                                      📈
                                    </button>
                                    <button
                                      onClick={() => handleEdit(mat)}
                                      title="Düzenle"
                                      className="text-stone-500 hover:text-blue-400 transition-colors text-base"
                                    >
                                      ✏️
                                    </button>
                                    <button
                                      onClick={() => handleDelete(mat.id)}
                                      title="Sil"
                                      className="text-stone-500 hover:text-red-400 transition-colors text-base"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                                </tr>
                                {editingId === mat.id && (
                                  <tr>
                                    <td colSpan={6} className="p-4 bg-stone-950/80 border-b-2 border-amber-500/40">
                                      <div className="bg-stone-900 border border-amber-400/60 rounded-xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                          <h3 className="font-bold text-amber-400">✏️ {mat.name} Düzenle</h3>
                                          <button onClick={resetForm} className="text-stone-500 hover:text-white text-lg">✕</button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                                          <div>
                                            <label className="text-stone-400 text-xs mb-1 block">Hammadde Adı</label>
                                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" />
                                          </div>
                                          <div>
                                            <label className="text-stone-400 text-xs mb-1 block">Kategori</label>
                                            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
                                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-stone-400 text-xs mb-1 block">Birim</label>
                                            <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
                                              {units.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <label className="text-stone-400 text-xs mb-1 block">Birim Fiyat (₺)</label>
                                            <input type="number" value={form.price_per_unit} onChange={e => setForm({ ...form, price_per_unit: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" placeholder="0.00" />
                                          </div>
                                          <div>
                                            <label className="text-stone-400 text-xs mb-1 block">Stok Miktarı</label>
                                            <input type="number" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" placeholder="0" />
                                          </div>
                                        </div>
                                        <div className="flex gap-3 mt-4">
                                          <button onClick={handleSubmit} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-5 py-2 rounded-lg text-sm">Güncelle</button>
                                          <button onClick={resetForm} className="bg-stone-700 hover:bg-stone-600 text-white px-5 py-2 rounded-lg text-sm">İptal</button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Fiyat Geçmişi Modalı */}
      {historyModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-amber-400">Fiyat Geçmişi</h2>
                <p className="text-stone-400 text-sm">{selectedMatName}</p>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
            </div>

            {loadingHistory ? (
              <p className="text-stone-400 py-8 text-center">Geçmiş yükleniyor...</p>
            ) : priceHistory.length === 0 ? (
              <p className="text-stone-500 py-8 text-center">Bu hammadde için fiyat değişimi kaydedilmemiş.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
                {priceHistory.map(hist => {
                  const isIncrease = hist.new_price > hist.old_price
                  const diffPercent = hist.old_price > 0
                    ? ((hist.new_price - hist.old_price) / hist.old_price) * 100
                    : 0
                  return (
                    <div key={hist.id} className="bg-stone-800 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="text-stone-400 text-xs mb-1">
                          {new Date(hist.created_at).toLocaleDateString('tr-TR', {
                            day: '2-digit', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-stone-500 line-through">₺{hist.old_price.toFixed(2)}</span>
                          <span className="text-stone-300">→</span>
                          <span className="text-white font-bold text-lg">₺{hist.new_price.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {hist.old_price > 0 && (
                          <div className={`font-bold text-sm ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>
                            {isIncrease ? '▲' : '▼'} %{Math.abs(diffPercent).toFixed(1)}
                          </div>
                        )}
                        <span className="text-stone-500 text-xs">
                          {hist.source === 'receipt_upload' ? '📸 Fiş Okuma' : '✏️ Manuel'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Otomatik Kategorize Modalı */}
      {autoCatModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Modal Başlık */}
            <div className="px-6 py-5 border-b border-stone-800 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">🤖</span>
                  <h2 className="text-lg font-bold text-white">Otomatik Kategorize Önerileri</h2>
                </div>
                {autoCatSuggestions.length === 0 ? (
                  <p className="text-stone-400 text-sm">Tüm hammaddeler zaten doğru kategoride! ✨</p>
                ) : (
                  <p className="text-stone-400 text-sm">
                    Yapay zeka <span className="text-amber-400 font-bold">{autoCatSuggestions.length} hammadde</span> için kategori önerisi üreetti.
                    Onayla veya reddederek uygulayın.
                  </p>
                )}
              </div>
              <button
                onClick={() => setAutoCatModalOpen(false)}
                className="text-stone-500 hover:text-white text-xl mt-0.5 ml-4"
              >
                ✕
              </button>
            </div>

            {/* Öneri Listesi */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {autoCatSuggestions.length === 0 ? (
                <div className="text-center py-12 text-stone-500">
                  <div className="text-4xl mb-3">🎉</div>
                  <p>Her şey zaten doğru sınıflandırılmış!</p>
                </div>
              ) : (
                autoCatSuggestions.map((s, i) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-stone-800 rounded-xl px-4 py-3 gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-stone-500 text-xs line-through">{s.current}</span>
                        <span className="text-stone-600 text-xs">→</span>
                        <span className="text-violet-400 text-xs font-semibold">{s.suggested}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoCatSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-stone-600 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                      title="Bu öneriyi listeden çıkar"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Alt Butonlar */}
            {autoCatSuggestions.length > 0 && (
              <div className="px-6 py-4 border-t border-stone-800 flex items-center justify-between gap-3">
                <p className="text-stone-500 text-xs">
                  İstemediğin öneriyi listeden ✕ ile çıkarabilirsin.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAutoCatModalOpen(false)}
                    className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={() => handleApplyAutoCat(autoCatSuggestions.map(s => ({ id: s.id, suggested: s.suggested })))}
                    disabled={autoCatSaving}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                  >
                    {autoCatSaving ? (
                      <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uygulanıyor...</>
                    ) : (
                      <>✓ {autoCatSuggestions.length} Öneriyi Uygula</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatDate, formatCurrency } from '@/lib/format'
import dynamic from 'next/dynamic'

const MaterialHistoryModal = dynamic(
  () => import('@/features/materials/components/MaterialHistoryModal').then(mod => mod.MaterialHistoryModal),
  { ssr: false }
)
const MaterialAutoCatModal = dynamic(
  () => import('@/features/materials/components/MaterialAutoCatModal').then(mod => mod.MaterialAutoCatModal),
  { ssr: false }
)
import { useAppTour } from '@/hooks/useAppTour'

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

type EditRow = {
  id: string
  name: string
  unit: string
  price_per_unit: string
  stock_quantity: string
  critical_stock_level: string
  category: string
}

export default function Hammaddeler() {
  const { showAlert, showConfirm } = useNotification()
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<string[]>(['Diğer'])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Tümü')
  const [sortBy, setSortBy] = useState<'name' | 'price_desc' | 'stock_desc' | 'critical_first'>('name')

  // Modals state
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [selectedMatName, setSelectedMatName] = useState('')
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Accordion state
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Bulk Edit Mode
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({})
  const [bulkSaving, setBulkSaving] = useState(false)
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())

  // Auto Categorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<{ id: string; name: string; current: string; suggested: string }[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)

  // Package multiplier input state for conversion
  const [pkgMultiplier, setPkgMultiplier] = useState<number>(12)

  // Form State
  const [form, setForm] = useState({
    name: '',
    category: 'Diğer',
    unit: 'Kg',
    price_per_unit: '',
    stock_quantity: '0',
    critical_stock_level: '0'
  })

  const supabase = createClient()
  const router = useRouter()

  const units = ['Kg', 'Gram', 'Litre', 'Ml', 'Adet', 'Paket', 'Koli', 'Kutu']

  useEffect(() => {
    fetchMaterials()
  }, [])

  const fetchMaterials = async () => {
    setLoading(true)
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('settings').select('*')
    ])

    setMaterials(data || [])

    const catsSetting = settings?.find((s: any) => s.key === 'material_categories')?.value
    if (catsSetting) {
      const cats: string[] = Array.isArray(catsSetting) ? catsSetting : JSON.parse(catsSetting)
      setCategories(cats)
      setOpenCategories(new Set(cats))
    } else {
      setOpenCategories(new Set(['Diğer']))
    }

    setLoading(false)
  }

  // ─── Bulk Edit Management ───────────────────────────────────
  const enterBulkEdit = () => {
    const rows: Record<string, EditRow> = {}
    materials.forEach(m => {
      rows[m.id] = {
        id: m.id,
        name: m.name,
        unit: m.unit,
        price_per_unit: m.price_per_unit.toString(),
        stock_quantity: (m.stock_quantity || 0).toString(),
        critical_stock_level: (m.critical_stock_level || 0).toString(),
        category: m.category || 'Diğer'
      }
    })
    setEditRows(rows)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
    setBulkEditMode(true)
    setShowModal(false)
  }

  const cancelBulkEdit = () => {
    setBulkEditMode(false)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
  }

  const updateEditRow = (id: string, field: keyof EditRow, value: string) => {
    setEditRows(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value }
    }))
    const newChanged = new Set(changedIds)
    newChanged.add(id)
    setChangedIds(newChanged)
  }

  const toggleDeletion = (id: string) => {
    const newSet = new Set(selectedForDeletion)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedForDeletion(newSet)
  }

  const handleBulkSave = async () => {
    if (changedIds.size === 0) return
    setBulkSaving(true)
    const toUpdate = [...changedIds]
    const bulkDetails: string[] = []

    await Promise.all(
      toUpdate.map(async id => {
        const row = editRows[id]
        const oldMat = materials.find(m => m.id === id)
        const newPrice = parseFloat(row.price_per_unit)
        const oldPrice = oldMat?.price_per_unit || 0
        const newStock = parseFloat(row.stock_quantity) || 0
        const oldStock = oldMat?.stock_quantity || 0
        const newCritical = parseFloat(row.critical_stock_level) || 0
        const oldCritical = oldMat?.critical_stock_level || 0

        if (isNaN(newPrice) || !row.name) return

        const changes = []
        if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice}->${newPrice}`)
        if (oldStock !== newStock) changes.push(`Stok: ${oldStock}->${newStock}`)
        if (oldCritical !== newCritical) changes.push(`Kritik Stok: ${oldCritical}->${newCritical}`)
        if (oldMat?.category !== row.category) changes.push(`Kategori: ${oldMat?.category || 'Diğer'}->${row.category}`)

        if (changes.length > 0) {
          bulkDetails.push(`${row.name} (${changes.join(', ')})`)
        }

        await supabase
          .from('materials')
          .update({
            name: row.name,
            unit: row.unit,
            category: row.category,
            price_per_unit: newPrice,
            stock_quantity: newStock,
            critical_stock_level: newCritical
          })
          .eq('id', id)

        if (!isNaN(newPrice) && newPrice !== oldPrice) {
          await supabase.from('material_price_history').insert({
            material_id: id,
            old_price: oldPrice,
            new_price: newPrice,
            source: 'manual'
          })
        }
      })
    )

    setBulkEditMode(false)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
    setBulkSaving(false)
    fetchMaterials()
    logActivity(
      'Hammadde',
      'GUNCELLEME',
      `${changedIds.size} adet hammaddenin bilgileri (fiyat/stok/kategori) topluca güncellendi.`,
      bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : undefined
    )
  }

  const handleBulkDelete = async () => {
    if (selectedForDeletion.size === 0) return
    const confirmed = await showConfirm(
      `Seçili ${selectedForDeletion.size} adet hammaddeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`,
      'Seçilileri Sil 🗑️'
    )
    if (!confirmed) return

    setBulkSaving(true)
    const deletedNames = Array.from(selectedForDeletion)
      .map(id => materials.find(m => m.id === id)?.name)
      .filter(Boolean)

    await supabase.from('materials').delete().in('id', Array.from(selectedForDeletion))

    setBulkEditMode(false)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
    setBulkSaving(false)
    fetchMaterials()
    logActivity('Hammadde', 'SILME', `${selectedForDeletion.size} adet hammadde toplu olarak silindi.`, {
      silinen_urunler: deletedNames.join(', ')
    })
    showAlert(`${selectedForDeletion.size} adet hammadde başarıyla silindi.`, 'success')
  }

  // ─── Auto Categorize AI ─────────────────────────────────────
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

      const suggestions = (data.suggestions || [])
        .map((s: any) => {
          const mat = materials.find(m => m.id === s.id)
          return {
            id: s.id,
            name: mat?.name || s.id,
            current: mat?.category || 'Diğer',
            suggested: s.suggested_category
          }
        })
        .filter((s: any) => s.suggested !== s.current)

      setAutoCatSuggestions(suggestions)
      setAutoCatModalOpen(true)
    } catch (e: any) {
      await showAlert('Hata: ' + e.message, 'error')
    }
    setAutoCatLoading(false)
  }

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

  // ─── Accordion Helpers ─────────────────────────────────────
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

  // ─── Single Form Management ─────────────────────────────────
  const resetForm = () => {
    setForm({
      name: '',
      category: 'Diğer',
      unit: 'Kg',
      price_per_unit: '',
      stock_quantity: '0',
      critical_stock_level: '0'
    })
    setEditingId(null)
    setShowModal(false)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.price_per_unit) return
    const {
      data: { user }
    } = await supabase.auth.getUser()

    const payload = {
      name: form.name,
      category: form.category,
      unit: form.unit,
      price_per_unit: parseFloat(form.price_per_unit),
      stock_quantity: parseFloat(form.stock_quantity) || 0,
      critical_stock_level: parseFloat(form.critical_stock_level) || 0,
      user_id: user?.id
    }

    let details = ''

    if (editingId) {
      const oldMat = materials.find(m => m.id === editingId)
      const oldPrice = oldMat ? oldMat.price_per_unit : 0
      const oldStock = oldMat ? oldMat.stock_quantity || 0 : 0
      const newPrice = payload.price_per_unit
      const newStock = payload.stock_quantity

      const changes = []
      if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice} -> ${newPrice} ₺`)
      if (oldStock !== newStock) changes.push(`Stok: ${oldStock} -> ${newStock}`)
      if (oldMat?.critical_stock_level !== payload.critical_stock_level)
        changes.push(`Kritik Stok: ${oldMat?.critical_stock_level || 0} -> ${payload.critical_stock_level}`)
      if (oldMat?.unit !== payload.unit) changes.push(`Birim: ${oldMat?.unit} -> ${payload.unit}`)
      if (oldMat?.category !== payload.category)
        changes.push(`Kategori: ${oldMat?.category || 'Diğer'} -> ${payload.category}`)

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
    logActivity(
      'Hammadde',
      editingId ? 'GUNCELLEME' : 'EKLEME',
      `${form.name} isimli hammadde ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`,
      { detay: details }
    )
  }

  const handleEdit = (mat: Material) => {
    setForm({
      name: mat.name,
      category: mat.category || 'Diğer',
      unit: mat.unit,
      price_per_unit: mat.price_per_unit.toString(),
      stock_quantity: (mat.stock_quantity || 0).toString(),
      critical_stock_level: (mat.critical_stock_level || 0).toString()
    })
    setEditingId(mat.id)
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const matToDelete = materials.find(m => m.id === id)
    const confirmed = await showConfirm(
      `"${matToDelete?.name}" isimli hammaddeyi silmek istediğinize emin misiniz?`,
      'Hammaddeyi Sil 🗑️'
    )
    if (!confirmed) return
    await supabase.from('materials').delete().eq('id', id)
    fetchMaterials()
    logActivity('Hammadde', 'SILME', `${matToDelete?.name || 'Bir hammadde'} sistemden silindi.`, { materialId: id })
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

  const handleDeleteAll = async () => {
    const confirmed = await showConfirm(
      'DİKKAT: Sistemdeki TÜM hammaddeleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz ve tüm stok verileriniz sıfırlanır!',
      'TÜMÜNÜ SİL 🚨'
    )
    if (!confirmed) return

    setLoading(true)
    const allNames = materials.map(m => m.name)

    const { error } = await supabase
      .from('materials')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      await showAlert('Silme hatası: ' + error.message, 'error')
      setLoading(false)
      return
    }

    await fetchMaterials()
    logActivity('Hammadde', 'SILME', `Tüm hammaddeler sistemden toptan silindi.`, { silinen_urunler: allNames.join(', ') })
    await showAlert('Tüm hammaddeler başarıyla silindi!', 'success')
    setLoading(false)
  }

  // ─── Computed Stats & Filters ────────────────────────────────
  const totalValue = useMemo(
    () => materials.reduce((t, m) => t + (m.stock_quantity || 0) * m.price_per_unit, 0),
    [materials]
  )

  const criticalMaterialsCount = useMemo(
    () =>
      materials.filter(
        m => m.critical_stock_level != null && m.critical_stock_level > 0 && (m.stock_quantity || 0) <= m.critical_stock_level
      ).length,
    [materials]
  )

  const activeCategoriesCount = useMemo(
    () => new Set(materials.map(m => m.category || 'Diğer')).size,
    [materials]
  )

  const processedMaterials = useMemo(() => {
    let result = [...materials]

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(query))
    }

    if (categoryFilter !== 'Tümü') {
      result = result.filter(m => (m.category || 'Diğer') === categoryFilter)
    }

    result.sort((a, b) => {
      const isCriticalA =
        a.critical_stock_level != null && a.critical_stock_level > 0 && (a.stock_quantity || 0) <= a.critical_stock_level
      const isCriticalB =
        b.critical_stock_level != null && b.critical_stock_level > 0 && (b.stock_quantity || 0) <= b.critical_stock_level

      if (sortBy === 'critical_first') {
        if (isCriticalA && !isCriticalB) return -1
        if (!isCriticalA && isCriticalB) return 1
      }
      if (sortBy === 'price_desc') return b.price_per_unit - a.price_per_unit
      if (sortBy === 'stock_desc') return (b.stock_quantity || 0) - (a.stock_quantity || 0)
      return a.name.localeCompare(b.name)
    })

    return result
  }, [materials, search, categoryFilter, sortBy])

  const groupedByCategory = useMemo(() => {
    const allCats = [...new Set([...categories, 'Diğer', ...processedMaterials.map(m => m.category || 'Diğer')])]
    const filteredCats = categoryFilter !== 'Tümü' ? [categoryFilter] : allCats

    return filteredCats
      .map(cat => ({
        cat,
        items: processedMaterials.filter(m => (m.category || 'Diğer') === cat)
      }))
      .filter(g => g.items.length > 0)
  }, [categories, processedMaterials, categoryFilter])

  // Driver Tour
  useAppTour(
    'hammaddeler',
    [
      {
        element: '#tour-mat-add',
        popover: {
          title: 'Hammadde Ekle ➕',
          description: 'Tedarikçinizden aldığınız hammaddeleri sisteme buradan tek tek girebilirsiniz.',
          side: 'bottom',
          align: 'end'
        }
      },
      {
        element: '#tour-mat-bulk-edit',
        popover: {
          title: 'Hızlı Düzenleme ⚡',
          description: 'Excel gibi çalışır! Fiyat güncellemelerini veya stok sayımlarını ekrana tıklayarak hızlıca yapıp toplu kaydedebilirsiniz.',
          side: 'bottom',
          align: 'center'
        }
      },
      {
        element: '#tour-mat-autocat',
        popover: {
          title: 'Yapay Zeka ile Düzenle 🤖',
          description: 'Yüzlerce hammaddeniz mi var? Yapay zeka asistanımız hepsini saniyeler içinde "Süt Ürünleri", "Paketleme" gibi kategorilere ayırır.',
          side: 'bottom',
          align: 'center'
        }
      }
    ],
    800
  )

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              🧪
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Hammaddeler</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Stok & Maliyet
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Stok takibi, birim maliyetler, kritik stok seviyeleri ve fiyat geçmişi yönetimi.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {bulkEditMode ? (
              <div className="flex items-center gap-2 bg-stone-950 p-1.5 rounded-xl border border-amber-500/40">
                <span className="text-stone-300 text-xs px-2 font-medium">
                  {changedIds.size > 0 ? (
                    <span className="text-amber-400 font-bold">● {changedIds.size} satır düzenlendi</span>
                  ) : (
                    'Değişiklik bekleniyor'
                  )}
                </span>

                <button
                  onClick={() => {
                    if (selectedForDeletion.size === processedMaterials.length && processedMaterials.length > 0) {
                      setSelectedForDeletion(new Set())
                    } else {
                      setSelectedForDeletion(new Set(processedMaterials.map(m => m.id)))
                    }
                  }}
                  className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-700 transition-colors"
                >
                  {selectedForDeletion.size === processedMaterials.length && processedMaterials.length > 0
                    ? '☐ Temizle'
                    : '☑️ Tümünü Seç'}
                </button>

                <button
                  onClick={handleBulkDelete}
                  disabled={selectedForDeletion.size === 0}
                  className="bg-red-950/80 hover:bg-red-900 disabled:opacity-50 text-red-400 font-semibold px-3 py-1.5 rounded-lg text-xs border border-red-900/50 transition-colors"
                >
                  🗑️ Seçilileri Sil ({selectedForDeletion.size})
                </button>

                <button
                  onClick={cancelBulkEdit}
                  className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-700 transition-colors"
                >
                  İptal
                </button>

                <button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || changedIds.size === 0}
                  className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold px-4 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-95"
                >
                  {bulkSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>✓ Tümünü Kaydet</>
                  )}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleDeleteAll}
                  disabled={materials.length === 0}
                  className="bg-red-950/60 hover:bg-red-900/80 disabled:opacity-50 text-red-400 hover:text-red-300 font-medium px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-red-900/40 flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <span>🗑️</span>
                  <span>Tümünü Sil</span>
                </button>

                <button
                  id="tour-mat-bulk-edit"
                  onClick={enterBulkEdit}
                  className="bg-stone-900 hover:bg-stone-800 text-stone-200 font-medium px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-stone-800 flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                >
                  <span>✏️</span>
                  <span>Hızlı Düzenle</span>
                </button>

                <button
                  id="tour-mat-autocat"
                  onClick={handleAutoCategorize}
                  disabled={autoCatLoading}
                  className="bg-violet-950/60 hover:bg-violet-900/80 text-violet-300 hover:text-violet-200 font-semibold px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-violet-800/40 flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                >
                  {autoCatLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                      <span>Analiz...</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>AI Kategorize</span>
                    </>
                  )}
                </button>

                <button
                  id="tour-mat-add"
                  onClick={() => {
                    resetForm()
                    setShowModal(true)
                  }}
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                >
                  <span>➕</span>
                  <span>Yeni Hammadde</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE KPI METRIC CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam Hammadde</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                📦
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{materials.length}</div>
            <div className="text-stone-400 text-[11px] mt-1 flex items-center gap-1">
              <span className="text-stone-300 font-bold">{activeCategoriesCount}</span> Kategori Altında
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam Stok Değeri</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                💰
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">{formatCurrency(totalValue)}</div>
            <div className="text-stone-400 text-[11px] mt-1">Depo Mevcut Stok Maliyeti</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Kritik Stok Uyarısı</span>
              <span
                className={`p-2 rounded-xl text-base ${
                  criticalMaterialsCount > 0
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                🚨
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black ${
                criticalMaterialsCount > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {criticalMaterialsCount} Ürün
            </div>
            <div className="text-stone-400 text-[11px] mt-1">
              {criticalMaterialsCount > 0 ? 'Kritik Seviyenin Altında!' : 'Tüm Stoklar Yeterli'}
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Aktif Kategoriler</span>
              <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-base">
                🏷️
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-violet-400">{categories.length}</div>
            <div className="text-stone-400 text-[11px] mt-1">Tedarik & Depo Grupları</div>
          </div>
        </div>

        {/* SEARCH, FILTER & ACTION BAR */}
        <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Hammadde adı ile arama yapın..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-colors placeholder:text-stone-600"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category & Sorting Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="Tümü">Tüm Kategoriler ({materials.length})</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat} ({materials.filter(m => (m.category || 'Diğer') === cat).length})
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="name">İsme Göre (A-Z)</option>
              <option value="critical_first">🚨 Kritik Stoktakiler Önce</option>
              <option value="price_desc">Birim Fiyat (En Yüksek)</option>
              <option value="stock_desc">Stok Miktarı (En Çok)</option>
            </select>

            <button
              onClick={() => toggleAll(openCategories.size === 0)}
              className="bg-stone-950 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-semibold px-3 py-2 border border-stone-800 rounded-xl whitespace-nowrap transition-colors"
            >
              {openCategories.size === 0 ? '▼ Tümünü Aç' : '▲ Tümünü Kapat'}
            </button>
          </div>
        </div>

        {/* ──────────────── MATERIALS LIST / CATEGORY ACCORDIONS ──────────────── */}
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">🧪</div>
            <p className="text-sm font-medium">Hammaddeler ve Stok Verileri Yükleniyor...</p>
          </div>
        ) : groupedByCategory.length === 0 ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-500 backdrop-blur-md">
            <div className="text-5xl mb-3">🧪</div>
            <h3 className="text-lg font-bold text-stone-300 mb-1">Aramanıza Uygun Hammadde Bulunamadı</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Arama kriterinizi değiştirerek veya "+ Yeni Hammadde" butonuna basarak yeni hammadde tanımlayabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByCategory.map(({ cat, items }) => {
              const isOpen = openCategories.has(cat)
              const catTotal = items.reduce((t, m) => t + (m.stock_quantity || 0) * m.price_per_unit, 0)
              const criticalCount = items.filter(
                m => m.critical_stock_level != null && m.critical_stock_level > 0 && (m.stock_quantity || 0) <= m.critical_stock_level
              ).length

              return (
                <div
                  key={cat}
                  className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl transition-all"
                >
                  {/* Category Header Bar */}
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-800/40 transition-colors group select-none"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-stone-400 text-xs transition-transform duration-200"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                      >
                        ▶
                      </span>
                      <span className="font-extrabold text-stone-100 text-sm sm:text-base">{cat}</span>
                      <span className="bg-stone-800 text-stone-400 border border-stone-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                        {items.length} hammadde
                      </span>
                      {criticalCount > 0 && (
                        <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                          ⚠ {criticalCount} kritik
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-amber-400 font-extrabold text-sm sm:text-base">
                        {formatCurrency(catTotal)}
                      </span>
                      <span className="text-stone-500 text-xs ml-1 font-medium">stok değeri</span>
                    </div>
                  </button>

                  {/* Category Content Area */}
                  {isOpen && (
                    <div className="border-t border-stone-800/80">
                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                              {bulkEditMode && (
                                <th className="px-4 py-3 text-center w-12 text-rose-400">Sil</th>
                              )}
                              <th className="px-5 py-3">Hammadde Adı</th>
                              <th className="px-4 py-3">Birim</th>
                              <th className="px-4 py-3 text-right">Birim Fiyat (₺)</th>
                              <th className="px-4 py-3 text-right">Stok Miktarı</th>
                              <th className="px-4 py-3 text-right">Kritik Seviye</th>
                              <th className="px-4 py-3 text-right">Toplam Değer</th>
                              <th className="px-5 py-3 text-right">{bulkEditMode ? 'Durum' : 'İşlem'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                            {items.map(mat => {
                              const isCritical =
                                mat.critical_stock_level != null &&
                                mat.critical_stock_level > 0 &&
                                (mat.stock_quantity || 0) <= mat.critical_stock_level
                              const row = editRows[mat.id]

                              if (bulkEditMode && row) {
                                const isChanged = changedIds.has(mat.id)
                                const isSelected = selectedForDeletion.has(mat.id)
                                const inputCls =
                                  'w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-amber-500 disabled:opacity-40'
                                return (
                                  <tr
                                    key={mat.id}
                                    className={`transition-colors ${
                                      isSelected
                                        ? 'bg-rose-950/40'
                                        : isChanged
                                        ? 'bg-amber-500/10'
                                        : ''
                                    }`}
                                  >
                                    <td className="px-4 py-2.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleDeletion(mat.id)}
                                        className="w-4 h-4 rounded bg-stone-950 border-stone-700 text-rose-500 focus:ring-rose-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        value={row.name}
                                        onChange={e => updateEditRow(mat.id, 'name', e.target.value)}
                                        className={inputCls}
                                        disabled={isSelected}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <select
                                        value={row.unit}
                                        onChange={e => updateEditRow(mat.id, 'unit', e.target.value)}
                                        className={inputCls}
                                        disabled={isSelected}
                                      >
                                        {units.map(u => (
                                          <option key={u} value={u}>
                                            {u}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        value={row.price_per_unit}
                                        onChange={e => updateEditRow(mat.id, 'price_per_unit', e.target.value)}
                                        className={inputCls + ' text-right font-bold text-amber-400'}
                                        disabled={isSelected}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        value={row.stock_quantity}
                                        onChange={e => updateEditRow(mat.id, 'stock_quantity', e.target.value)}
                                        className={inputCls + ' text-right font-semibold'}
                                        disabled={isSelected}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        value={row.critical_stock_level}
                                        onChange={e => updateEditRow(mat.id, 'critical_stock_level', e.target.value)}
                                        className={inputCls + ' text-right text-amber-400'}
                                        disabled={isSelected}
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-bold text-amber-400">
                                      ₺
                                      {(
                                        (parseFloat(row.stock_quantity || '0') || 0) *
                                        (parseFloat(row.price_per_unit || '0') || 0)
                                      ).toFixed(2)}
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-semibold">
                                      {isSelected ? (
                                        <span className="text-rose-400 text-xs">🗑️ Silinecek</span>
                                      ) : isChanged ? (
                                        <span className="text-amber-400 text-xs">● Değişti</span>
                                      ) : null}
                                    </td>
                                  </tr>
                                )
                              }

                              return (
                                <tr
                                  key={mat.id}
                                  className={`hover:bg-stone-800/30 transition-colors ${
                                    isCritical ? 'bg-rose-950/20' : ''
                                  }`}
                                >
                                  <td className="px-5 py-3.5 font-bold text-stone-100 flex items-center gap-2">
                                    <span>{mat.name}</span>
                                    {isCritical && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold animate-pulse">
                                        ⚠ Kritik Stok!
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-stone-400">{mat.unit}</td>
                                  <td className="px-4 py-3.5 text-right text-amber-400 font-semibold">
                                    ₺{mat.price_per_unit.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-extrabold text-white">
                                    {mat.stock_quantity || 0}
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    {mat.critical_stock_level != null && mat.critical_stock_level > 0 ? (
                                      <span
                                        className={`font-bold ${
                                          isCritical ? 'text-rose-400 font-black' : 'text-stone-400'
                                        }`}
                                      >
                                        {mat.critical_stock_level}
                                      </span>
                                    ) : (
                                      <span className="text-stone-600">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-bold text-amber-400">
                                    ₺{((mat.stock_quantity || 0) * mat.price_per_unit).toFixed(2)}
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => handleViewHistory(mat)}
                                        className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition-colors active:scale-95"
                                        title="Fiyat Geçmişi"
                                      >
                                        📈
                                      </button>
                                      <button
                                        onClick={() => handleEdit(mat)}
                                        className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition-colors active:scale-95"
                                        title="Düzenle"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={() => handleDelete(mat.id)}
                                        className="p-1.5 bg-stone-800 hover:bg-rose-500/20 text-stone-400 hover:text-rose-400 rounded-lg border border-stone-700 hover:border-rose-500/30 transition-colors active:scale-95"
                                        title="Sil"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards View */}
                      <div className="md:hidden divide-y divide-stone-800/60">
                        {items.map(mat => {
                          const isCritical =
                            mat.critical_stock_level != null &&
                            mat.critical_stock_level > 0 &&
                            (mat.stock_quantity || 0) <= mat.critical_stock_level
                          const row = editRows[mat.id]

                          if (bulkEditMode && row) {
                            const isChanged = changedIds.has(mat.id)
                            const isSelected = selectedForDeletion.has(mat.id)
                            return (
                              <div
                                key={mat.id}
                                className={`p-4 space-y-3 ${
                                  isSelected ? 'bg-rose-950/30' : isChanged ? 'bg-amber-500/10' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <label className="flex items-center gap-2 font-bold text-white text-sm">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleDeletion(mat.id)}
                                      className="w-4 h-4 rounded text-rose-500"
                                    />
                                    <span>{mat.name}</span>
                                  </label>
                                  {isSelected ? (
                                    <span className="text-rose-400 text-xs font-bold">🗑️ Silinecek</span>
                                  ) : isChanged ? (
                                    <span className="text-amber-400 text-xs font-bold">● Değişti</span>
                                  ) : null}
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <label className="text-stone-400 block mb-1">Birim Fiyat (₺)</label>
                                    <input
                                      type="number"
                                      value={row.price_per_unit}
                                      onChange={e => updateEditRow(mat.id, 'price_per_unit', e.target.value)}
                                      className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold text-sm"
                                      disabled={isSelected}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-stone-400 block mb-1">Stok Miktarı</label>
                                    <input
                                      type="number"
                                      value={row.stock_quantity}
                                      onChange={e => updateEditRow(mat.id, 'stock_quantity', e.target.value)}
                                      className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                                      disabled={isSelected}
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={mat.id}
                              className={`p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors ${
                                isCritical ? 'bg-rose-950/20' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                                  <span>{mat.name}</span>
                                  {isCritical && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold">
                                      ⚠ Kritik
                                    </span>
                                  )}
                                </h4>
                                <span className="text-stone-400 text-xs font-semibold">{mat.unit}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Birim Fiyat</span>
                                  <span className="font-bold text-amber-400">₺{mat.price_per_unit.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Stok Miktarı</span>
                                  <span className="font-extrabold text-white">{mat.stock_quantity || 0}</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Kritik Seviye</span>
                                  <span className={isCritical ? 'text-rose-400 font-bold' : 'text-stone-300'}>
                                    {mat.critical_stock_level || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Toplam Stok Değeri</span>
                                  <span className="font-extrabold text-amber-400">
                                    ₺{((mat.stock_quantity || 0) * mat.price_per_unit).toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => handleViewHistory(mat)}
                                  className="px-3 py-1 bg-stone-800 text-stone-200 hover:text-white rounded-lg text-xs font-semibold border border-stone-700"
                                >
                                  📈 Geçmiş
                                </button>
                                <button
                                  onClick={() => handleEdit(mat)}
                                  className="px-3 py-1 bg-stone-800 text-stone-200 hover:text-white rounded-lg text-xs font-semibold border border-stone-700"
                                >
                                  ✏️ Düzenle
                                </button>
                                <button
                                  onClick={() => handleDelete(mat.id)}
                                  className="px-3 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg text-xs font-semibold border border-rose-500/20"
                                >
                                  🗑️ Sil
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ──────────────── MATERIAL FORM MODAL ──────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => resetForm()}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  {editingId ? '✏️' : '🧪'}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg">
                    {editingId ? `${form.name || 'Hammadde'} Düzenle` : 'Yeni Hammadde Ekle'}
                  </h3>
                  <p className="text-stone-400 text-xs">
                    Stok miktarı, birim fiyat ve kritik uyarı seviyesini tanımlayabilirsiniz.
                  </p>
                </div>
              </div>
              <button
                onClick={() => resetForm()}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Hammadde Adı *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="örn: Espresso Çekirdeği"
                  />
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Kategori</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Ölçü Birimi *</label>
                  <select
                    value={form.unit}
                    onChange={e => setForm({ ...form, unit: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  >
                    {units.map(u => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Birim Fiyat (₺) *</label>
                  <input
                    type="number"
                    value={form.price_per_unit}
                    onChange={e => setForm({ ...form, price_per_unit: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Stok Miktarı</label>
                  <input
                    type="number"
                    value={form.stock_quantity}
                    onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="text-rose-400 text-xs font-semibold mb-1 block">Kritik Stok Uyarısı (🚨)</label>
                  <input
                    type="number"
                    value={form.critical_stock_level}
                    onChange={e => setForm({ ...form, critical_stock_level: e.target.value })}
                    className="w-full bg-stone-950 border border-rose-500/30 rounded-xl px-3 py-2 text-rose-400 font-bold text-sm focus:outline-none focus:border-rose-500/50"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Unit Converter Helper Cards */}
              <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800/80 space-y-3">
                <h4 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                  <span>⚖️</span>
                  <span>Birim Dönüştürme Araçları</span>
                </h4>

                <div className="flex flex-wrap items-center gap-3">
                  {(form.unit.toLowerCase() === 'kg' ||
                    form.unit.toLowerCase() === 'kilogram' ||
                    form.unit.toLowerCase() === 'litre' ||
                    form.unit.toLowerCase() === 'l') && (
                    <button
                      onClick={() => {
                        const currentQty = parseFloat(form.stock_quantity) || 0
                        const currentPrice = parseFloat(form.price_per_unit) || 0
                        const u = form.unit.toLowerCase()
                        setForm({
                          ...form,
                          unit: u === 'kg' || u === 'kilogram' ? 'Gram' : 'Ml',
                          stock_quantity: (currentQty * 1000).toString(),
                          price_per_unit: (currentPrice / 1000).toFixed(4)
                        })
                      }}
                      className="bg-indigo-600/20 border border-indigo-500/30 hover:bg-indigo-600/30 text-indigo-300 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all active:scale-95"
                    >
                      ⚖️ {form.unit.toLowerCase() === 'kg' || form.unit.toLowerCase() === 'kilogram' ? 'Gram' : 'Ml'}
                      'a Dönüştür (x1000)
                    </button>
                  )}

                  {(form.unit.toLowerCase() === 'kutu' ||
                    form.unit.toLowerCase() === 'koli' ||
                    form.unit.toLowerCase() === 'paket' ||
                    form.unit.toLowerCase() === 'adet') && (
                    <div className="flex items-center gap-2 bg-stone-900 border border-stone-800 px-3 py-1.5 rounded-xl text-xs">
                      <span className="text-stone-400 font-medium">İçindeki Adet:</span>
                      <input
                        type="number"
                        value={pkgMultiplier}
                        onChange={e => setPkgMultiplier(parseInt(e.target.value) || 1)}
                        className="w-12 bg-stone-950 border border-stone-700 rounded-lg text-white font-bold text-center py-0.5 text-xs"
                      />
                      <button
                        onClick={() => {
                          if (pkgMultiplier > 1) {
                            const currentQty = parseFloat(form.stock_quantity) || 0
                            const currentPrice = parseFloat(form.price_per_unit) || 0
                            setForm({
                              ...form,
                              unit: 'Adet',
                              stock_quantity: (currentQty * pkgMultiplier).toString(),
                              price_per_unit: (currentPrice / pkgMultiplier).toFixed(4)
                            })
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1 rounded-lg text-xs transition-colors"
                      >
                        Adete Çevir
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
              <button
                onClick={() => resetForm()}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                {editingId ? 'Hammaddeyi Güncelle' : 'Hammaddeyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL COMPONENTS ──────────────── */}
      <MaterialHistoryModal
        isOpen={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        selectedMatName={selectedMatName}
        priceHistory={priceHistory}
        loadingHistory={loadingHistory}
      />

      <MaterialAutoCatModal
        isOpen={autoCatModalOpen}
        onClose={() => setAutoCatModalOpen(false)}
        suggestions={autoCatSuggestions}
        onRemoveSuggestion={index => setAutoCatSuggestions(prev => prev.filter((_, idx) => idx !== index))}
        onApply={handleApplyAutoCat}
        isSaving={autoCatSaving}
      />
    </div>
  )
}

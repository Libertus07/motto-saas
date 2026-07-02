'use client'

import React, { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

type Material = { id: string; name: string; unit: string; price_per_unit: number }
type SubRecipe = { id: string; name: string; yield_quantity: number; yield_unit: string; wastage_percent: number; cost_per_yield?: number }
type ProductIngredient = { type: 'material' | 'sub_recipe'; item_id: string; quantity: number }
type Product = {
  id: string; name: string; category: string; sale_price: number
  estimated_monthly_sales: number; calculated_cost?: number; actual_sales_30d?: number
}
type BulkRow = { id: string; sale_price: string; estimated_monthly_sales: string; category: string }

export default function Urunler() {
  const { showAlert, showConfirm } = useNotification()
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isBuildingAiRecipe, setIsBuildingAiRecipe] = useState(false)
  const [search, setSearch] = useState('')

  // Accordion
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Hızlı Düzenleme
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<Record<string, BulkRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  // Otomatik Kategorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<{ id: string; name: string; current: string; suggested: string }[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)

  const [form, setForm] = useState({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' })
  const [recipeItems, setRecipeItems] = useState<ProductIngredient[]>([])

  const supabase = createClient()
  const router = useRouter()

  const defaultCategories = ['Sıcak Kahveler', 'Soğuk Kahveler', 'Tatlılar', 'Çaylar', 'Kutu İçecekler', 'Diğer']
  const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...defaultCategories, ...uniqueCategories]))

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: mats } = await supabase.from('materials').select('*').order('name')
    setMaterials(mats || [])

    const { data: s_recipes } = await supabase.from('sub_recipes').select('*').order('name')
    const { data: s_recipe_ings } = await supabase.from('sub_recipe_ingredients').select('*')
    let processedSubRecipes: SubRecipe[] = []
    if (s_recipes && s_recipe_ings && mats) {
      processedSubRecipes = s_recipes.map(r => {
        const myIngs = s_recipe_ings.filter(i => i.sub_recipe_id === r.id)
        let totalCost = 0
        myIngs.forEach(ing => { const mat = mats.find(m => m.id === ing.material_id); if (mat) totalCost += mat.price_per_unit * ing.quantity })
        const finalCost = totalCost * (1 + r.wastage_percent / 100)
        return { ...r, cost_per_yield: r.yield_quantity > 0 ? finalCost / r.yield_quantity : 0 }
      })
    }
    setSubRecipes(processedSubRecipes)

    const { data: prods } = await supabase.from('products').select('*').order('name')
    const { data: prod_ings } = await supabase.from('product_ingredients').select('*')
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: recentSales } = await supabase.from('sales').select('product_id, quantity').gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0])
    const salesByProduct: Record<string, number> = {}
    recentSales?.forEach(s => { salesByProduct[s.product_id] = (salesByProduct[s.product_id] || 0) + s.quantity })

    if (prods) {
      const productsWithCost = prods.map(p => {
        const myIngs = prod_ings?.filter(i => i.product_id === p.id) || []
        let cost = 0
        myIngs.forEach(ing => {
          if (ing.material_id) { const mat = mats?.find(m => m.id === ing.material_id); if (mat) cost += mat.price_per_unit * ing.quantity }
          else if (ing.sub_recipe_id) { const sr = processedSubRecipes.find(s => s.id === ing.sub_recipe_id); if (sr?.cost_per_yield) cost += sr.cost_per_yield * ing.quantity }
        })
        return { ...p, calculated_cost: cost, actual_sales_30d: salesByProduct[p.id] || 0 }
      })
      setProducts(productsWithCost)
      setOpenCategories(new Set(productsWithCost.map(p => p.category)))
    }
    setLoading(false)
  }

  // ─── Accordion ───────────────────────────────────────
  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => { const next = new Set(prev); if (next.has(cat)) next.delete(cat); else next.add(cat); return next })
  }
  const toggleAll = (open: boolean) => {
    setOpenCategories(open ? new Set(allCategories) : new Set())
  }

  // ─── Hızlı Düzenleme ─────────────────────────────────
  const enterBulkEdit = () => {
    const rows: Record<string, BulkRow> = {}
    products.forEach(p => { rows[p.id] = { id: p.id, sale_price: p.sale_price.toString(), estimated_monthly_sales: (p.estimated_monthly_sales || 0).toString(), category: p.category } })
    setBulkRows(rows); setChangedIds(new Set()); setBulkEditMode(true); setShowForm(false)
  }
  const updateBulkRow = (id: string, field: keyof BulkRow, value: string) => {
    setBulkRows(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
    setChangedIds(prev => new Set([...prev, id]))
  }
  const handleBulkSave = async () => {
    setBulkSaving(true)
    const bulkDetails: string[] = []
    for (const id of [...changedIds]) {
      const row = bulkRows[id]
      const oldProd = products.find(p => p.id === id)
      const oldPrice = oldProd?.sale_price || 0
      const newPrice = parseFloat(row.sale_price)
      const oldEst = oldProd?.estimated_monthly_sales || 0
      const newEst = parseInt(row.estimated_monthly_sales)
      const changes = []
      if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice}->${newPrice}`)
      if (oldEst !== newEst) changes.push(`Tahmin: ${oldEst}->${newEst}`)
      if (oldProd?.category !== row.category) changes.push(`Kategori: ${oldProd?.category}->${row.category}`)
      if (changes.length > 0) bulkDetails.push(`${oldProd?.name || 'Ürün'} (${changes.join(', ')})`)

      await supabase.from('products').update({ sale_price: newPrice, estimated_monthly_sales: newEst, category: row.category }).eq('id', id)
    }
    setBulkEditMode(false); setChangedIds(new Set()); setBulkSaving(false); fetchData()
    logActivity('Ürünler', 'GUNCELLEME', `${changedIds.size} adet ürünün bilgileri (fiyat/kategori) topluca güncellendi.`, bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : undefined)
  }

  // ─── Otomatik Kategorize ─────────────────────────────
  const handleAutoCategorize = async () => {
    setAutoCatLoading(true)
    try {
      const res = await fetch('/api/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materials: products.map(p => ({ id: p.id, name: p.name, category: p.category })), categories: allCategories })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const suggestions = (data.suggestions || []).map((s: any) => {
        const prod = products.find(p => p.id === s.id)
        return { id: s.id, name: prod?.name || s.id, current: prod?.category || 'Diğer', suggested: s.suggested_category }
      }).filter((s: any) => s.suggested !== s.current)
      setAutoCatSuggestions(suggestions); setAutoCatModalOpen(true)
    } catch (e: any) { await showAlert('Hata: ' + e.message, 'error') }
    setAutoCatLoading(false)
  }
  const handleApplyAutoCat = async (approved: { id: string; suggested: string }[]) => {
    setAutoCatSaving(true)
    for (const item of approved) { await supabase.from('products').update({ category: item.suggested }).eq('id', item.id) }
    setAutoCatModalOpen(false); setAutoCatSuggestions([]); setAutoCatSaving(false); fetchData()
    logActivity('Ürünler', 'GUNCELLEME', `${approved.length} adet ürünün kategorisi yapay zeka ile otomatik güncellendi.`)
  }

  // ─── Form ─────────────────────────────────────────────
  const resetForm = () => { setForm({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' }); setRecipeItems([]); setEditingId(null); setShowForm(false) }
  const addRecipeItem = (type: 'material' | 'sub_recipe') => setRecipeItems([...recipeItems, { type, item_id: '', quantity: 0 }])
  const updateRecipeItem = (index: number, field: string, value: string | number) => { const u = [...recipeItems]; u[index] = { ...u[index], [field]: value }; setRecipeItems(u) }
  const removeRecipeItem = (index: number) => setRecipeItems(recipeItems.filter((_, i) => i !== index))

  const calculateLiveCost = () => {
    let total = 0
    recipeItems.forEach(item => {
      if (!item.item_id || !item.quantity) return
      if (item.type === 'material') { const mat = materials.find(m => m.id === item.item_id); if (mat) total += mat.price_per_unit * item.quantity }
      else { const sr = subRecipes.find(s => s.id === item.item_id); if (sr?.cost_per_yield) total += sr.cost_per_yield * item.quantity }
    })
    return total
  }

  const handleSubmit = async () => {
    if (!form.name) return
    const payload = { name: form.name, category: form.category, sale_price: parseFloat(form.sale_price || '0'), estimated_monthly_sales: parseInt(form.estimated_monthly_sales || '0') }
    let productId = editingId
    let details = ''
    if (editingId) {
      const oldProd = products.find(p => p.id === editingId)
      const changes = []
      if (oldProd?.sale_price !== payload.sale_price) changes.push(`Fiyat: ${oldProd?.sale_price} -> ${payload.sale_price} ₺`)
      if ((oldProd?.estimated_monthly_sales || 0) !== payload.estimated_monthly_sales) changes.push(`Tahmin: ${oldProd?.estimated_monthly_sales} -> ${payload.estimated_monthly_sales}`)
      if (oldProd?.category !== payload.category) changes.push(`Kategori: ${oldProd?.category || 'Diğer'} -> ${payload.category}`)
      details = changes.length > 0 ? changes.join(', ') : 'İsim veya reçete güncellendi'
      await supabase.from('products').update(payload).eq('id', editingId)
      await supabase.from('product_ingredients').delete().eq('product_id', editingId)
    } else {
      details = `Fiyat: ${payload.sale_price} ₺, Kategori: ${payload.category}`
      const { data } = await supabase.from('products').insert(payload).select().single()
      productId = data?.id
    }
    if (productId && recipeItems.length > 0) {
      const validItems = recipeItems.filter(r => r.item_id && r.quantity > 0)
      if (validItems.length > 0) {
        await supabase.from('product_ingredients').insert(validItems.map(r => ({
          product_id: productId, material_id: r.type === 'material' ? r.item_id : null,
          sub_recipe_id: r.type === 'sub_recipe' ? r.item_id : null, quantity: r.quantity
        })))
      }
    }
    resetForm(); fetchData()
    logActivity('Ürünler', editingId ? 'GUNCELLEME' : 'EKLEME', `${form.name} isimli ürün ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`, { detay: details })
  }

  const handleEdit = async (product: Product) => {
    setForm({ name: product.name, category: product.category, sale_price: product.sale_price.toString(), estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString() })
    setEditingId(product.id)
    const { data } = await supabase.from('product_ingredients').select('*').eq('product_id', product.id)
    setRecipeItems(data?.map(r => ({ type: r.material_id ? 'material' : 'sub_recipe', item_id: r.material_id || r.sub_recipe_id, quantity: r.quantity })) || [])
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('Bu ürünü silmek istediğinize emin misiniz?', 'Ürünü Sil 🗑️')
    if (!confirmed) return
    await supabase.from('products').delete().eq('id', id); fetchData()
    logActivity('Ürünler', 'SILME', `Ürün sistemden silindi.`, { productId: id })
  }

  const handleAiRecipeBuild = async () => {
    if (!form.name) { await showAlert('Lütfen önce Ürün Adı girin.', 'warning'); return }
    setIsBuildingAiRecipe(true)
    try {
      const res = await fetch('/api/ai-recipe-builder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productName: form.name, materials: materials.map(m => ({ id: m.id, name: m.name, unit: m.unit })), subRecipes: subRecipes.map(sr => ({ id: sr.id, name: sr.name, yield_unit: sr.yield_unit })), option: 1 }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.ingredients && Array.isArray(data.ingredients)) {
        const newItems: ProductIngredient[] = data.ingredients.map((ing: any) => ({ type: ing.type || 'material', item_id: ing.id, quantity: Number(ing.quantity) || 0 }))
        if (recipeItems.length > 0) {
          const confirmed = await showConfirm('Mevcut reçete silinip yapay zeka reçetesi eklenecek. Onaylıyor musunuz?', 'Reçeteyi Güncelle 🤖')
          if (!confirmed) { setIsBuildingAiRecipe(false); return }
        }
        setRecipeItems(newItems)
      }
    } catch (err: any) { await showAlert(err.message, 'error') }
    setIsBuildingAiRecipe(false)
  }

  // ─── Computed ─────────────────────────────────────────
  const liveCost = calculateLiveCost()
  const salePrice = parseFloat(form.sale_price || '0')
  const liveMargin = salePrice > 0 ? ((salePrice - liveCost) / salePrice) * 100 : 0
  const liveCashContribution = (salePrice - liveCost) * parseInt(form.estimated_monthly_sales || '0')

  const filteredProducts = search.trim() ? products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : products

  const groupedByCategory = (() => {
    const cats = [...new Set([...allCategories, ...filteredProducts.map(p => p.category)])]
    return cats.map(cat => ({ cat, items: filteredProducts.filter(p => p.category === cat) })).filter(g => g.items.length > 0)
  })()

  const totalRevenue = products.reduce((t, p) => t + p.sale_price * (p.actual_sales_30d || 0), 0)

  const getMarginColor = (margin: number) => margin > 50 ? 'text-green-400' : margin > 30 ? 'text-yellow-400' : 'text-red-400'

  const renderForm = () => (
    <div className={`bg-stone-900 border border-amber-400 rounded-xl p-6 ${!editingId ? 'mb-6' : ''}`}>
      <h2 className="font-bold text-lg mb-4">{editingId ? 'Ürün Düzenle' : 'Yeni Menü Ürünü Ekle'}</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Ürün Adı *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="örn: Latte" />
        </div>
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Kategori</label>
          <input list="category-options" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Seç veya yeni yaz..." className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
          <datalist id="category-options">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Satış Fiyatı (₺)</label>
          <input type="number" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="0.00" />
        </div>
        <div>
          <label className="text-amber-400 text-sm mb-1 block">Tahmini Aylık Satış</label>
          <input type="number" value={form.estimated_monthly_sales} onChange={e => setForm({ ...form, estimated_monthly_sales: e.target.value })} className="w-full bg-stone-800 border border-amber-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-3 gap-3">
          <h3 className="font-bold text-amber-400">Ürün Reçetesi</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleAiRecipeBuild} disabled={isBuildingAiRecipe} className="text-stone-900 font-bold bg-amber-400 hover:bg-amber-500 px-3 py-2 md:py-1 rounded-lg text-sm disabled:opacity-50 flex-1 md:flex-none text-center">{isBuildingAiRecipe ? '⏳ Hesaplanıyor...' : '✨ Yapay Zeka Hesaplasın'}</button>
            <button onClick={() => addRecipeItem('material')} className="text-stone-300 text-sm bg-stone-800 hover:bg-stone-700 px-3 py-2 md:py-1 rounded-lg flex-1 md:flex-none text-center">+ Hammadde</button>
            <button onClick={() => addRecipeItem('sub_recipe')} className="text-amber-400 text-sm border border-amber-400 hover:bg-amber-950 px-3 py-2 md:py-1 rounded-lg flex-1 md:flex-none text-center">+ Üretim Reçetesi</button>
          </div>
        </div>
        {recipeItems.length === 0 ? (
          <p className="text-stone-500 text-sm">İçerik boş. Hammadde veya üretim reçetesi ekleyin.</p>
        ) : (
          <div className="space-y-2">
            {recipeItems.map((item, index) => (
              <div key={index} className="flex flex-col md:grid md:grid-cols-12 gap-2 md:items-center bg-stone-800/50 p-3 md:p-2 rounded-lg border border-stone-800 mb-2">
                <div className="col-span-2 mb-1 md:mb-0"><span className={`text-xs px-2 py-1 rounded-md ${item.type === 'sub_recipe' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>{item.type === 'sub_recipe' ? 'Üretim Reçetesi' : 'Hammadde'}</span></div>
                <div className="col-span-5">
                  {item.type === 'material' ? (
                    <select value={item.item_id} onChange={e => updateRecipeItem(index, 'item_id', e.target.value)} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
                      <option value="">Seçiniz...</option>{materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                    </select>
                  ) : (
                    <select value={item.item_id} onChange={e => updateRecipeItem(index, 'item_id', e.target.value)} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
                      <option value="">Seçiniz...</option>{subRecipes.map(sr => <option key={sr.id} value={sr.id}>{sr.name} (1 {sr.yield_unit})</option>)}
                    </select>
                  )}
                </div>
                <div className="col-span-4">
                  <div className="flex items-center gap-2">
                    <input type="number" value={item.quantity || ''} onChange={e => updateRecipeItem(index, 'quantity', parseFloat(e.target.value))} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" placeholder="Miktar" />
                    <span className="text-stone-500 text-sm">{item.type === 'material' ? materials.find(m => m.id === item.item_id)?.unit : subRecipes.find(s => s.id === item.item_id)?.yield_unit}</span>
                  </div>
                </div>
                <div className="col-span-1 text-center"><button onClick={() => removeRecipeItem(index)} className="text-red-400 hover:text-red-300">✕</button></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-stone-800 rounded-lg p-5 mb-4 grid grid-cols-4 gap-4 border border-stone-700">
        <div><span className="text-stone-400 text-sm block">Food Cost</span><span className="text-white font-bold text-lg">₺{liveCost.toFixed(2)}</span></div>
        <div><span className="text-stone-400 text-sm block">Satış Fiyatı</span><span className="text-white font-bold text-lg">₺{salePrice.toFixed(2)}</span></div>
        <div><span className="text-stone-400 text-sm block">Kâr Marjı</span><span className={`font-bold text-lg ${getMarginColor(liveMargin)}`}>%{liveMargin.toFixed(1)}</span></div>
        <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20"><span className="text-amber-400 text-xs block">Aylık Nakit Katkı</span><span className="text-amber-400 font-bold text-xl">₺{liveCashContribution.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</span></div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleSubmit} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg">{editingId ? 'Güncelle' : 'Kaydet'}</button>
        <button onClick={resetForm} className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg">İptal</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-stone-950 text-white">
      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <h1 className="font-bold text-amber-400">Menü & Ürünler</h1>
            <p className="text-stone-500 text-xs">{products.length} ürün &nbsp;·&nbsp; Son 30 gün ciro: <span className="text-amber-400 font-bold">₺{totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span></p>
          </div>
        </div>
        <div className="flex gap-2">
          {bulkEditMode ? (
            <>
              <span className="text-stone-400 text-sm flex items-center px-3">
                {changedIds.size > 0 ? <span className="text-amber-400 font-medium">{changedIds.size} satır düzenlendi</span> : 'Değişiklik yok'}
              </span>
              <button onClick={() => { setBulkEditMode(false); setChangedIds(new Set()) }} className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-lg text-sm border border-stone-700">İptal</button>
              <button onClick={handleBulkSave} disabled={bulkSaving || changedIds.size === 0} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2">
                {bulkSaving ? <><span className="w-3.5 h-3.5 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" /> Kaydediliyor...</> : <>✓ Tümünü Kaydet</>}
              </button>
            </>
          ) : (
            <>
              <button onClick={enterBulkEdit} className="bg-stone-700 hover:bg-stone-600 text-white font-medium px-4 py-2 rounded-lg text-sm border border-stone-600 flex items-center gap-2">✏️ Hızlı Düzenleme</button>
              <button onClick={handleAutoCategorize} disabled={autoCatLoading} className="bg-violet-700 hover:bg-violet-600 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                {autoCatLoading ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analiz...</> : <>🤖 Otomatik Kategorize</>}
              </button>
              <button onClick={() => { resetForm(); setShowForm(true) }} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm">+ Yeni Satış Ürünü</button>
            </>
          )}
        </div>
      </header>

      <main className="p-6">
        {showForm && !editingId && renderForm()}

        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-stone-500"><div className="text-5xl mb-4">📋</div><p>Henüz satış ürünü eklenmemiş.</p></div>
        ) : (
          <div className="space-y-3">
            {/* Arama + Tümünü Aç/Kapat */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 text-sm">🔍</span>
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün ara..." className="w-full bg-stone-900 border border-stone-800 rounded-lg pl-8 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-amber-400" />
              </div>
              <button onClick={() => toggleAll(openCategories.size === 0)} className="text-stone-400 hover:text-white text-sm px-4 py-2.5 bg-stone-900 border border-stone-800 rounded-lg whitespace-nowrap">
                {openCategories.size === 0 ? '▼ Tümünü Aç' : '▲ Tümünü Kapat'}
              </button>
            </div>

            {/* Kategori Accordion'ları */}
            {groupedByCategory.map(({ cat, items }) => {
              const isOpen = openCategories.has(cat)
              const avgMargin = items.reduce((t, p) => {
                const cost = p.calculated_cost || 0
                return t + (p.sale_price > 0 ? ((p.sale_price - cost) / p.sale_price) * 100 : 0)
              }, 0) / items.length

              return (
                <div key={cat} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
                  {/* Başlık */}
                  <button onClick={() => toggleCategory(cat)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-stone-800/50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <span className="text-stone-500 text-xs transition-transform duration-200" style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span className="font-semibold text-white">{cat}</span>
                      <span className="bg-stone-800 group-hover:bg-stone-700 text-stone-400 text-xs px-2 py-0.5 rounded-full">{items.length} ürün</span>
                    </div>
                    <div className="text-right">
                      <span className={`font-bold text-sm ${getMarginColor(avgMargin)}`}>Ort. %{avgMargin.toFixed(1)}</span>
                      <span className="text-stone-500 text-xs ml-1">kâr marjı</span>
                    </div>
                  </button>

                  {/* İçerik */}
                  {isOpen && (
                    <div className="border-t border-stone-800">
                      <div className="overflow-x-auto w-full">
<table className="w-full">
                        <thead>
                          <tr className="bg-stone-950/40 border-b border-stone-800">
                            <th className="text-left px-5 py-2.5 text-stone-500 text-xs font-medium">Ürün Adı</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Food Cost</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Satış Fiyatı</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Aylık Tahmin</th>
                            <th className="text-right px-4 py-2.5 text-amber-500 text-xs font-medium">Son 30G</th>
                            <th className="text-right px-4 py-2.5 text-stone-500 text-xs font-medium">Kâr Marjı</th>
                            <th className="text-right px-5 py-2.5 text-stone-500 text-xs font-medium">{bulkEditMode ? 'Durum' : 'İşlem'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map(product => {
                            const cost = product.calculated_cost || 0
                            const margin = product.sale_price > 0 ? ((product.sale_price - cost) / product.sale_price) * 100 : 0
                            const isEditing = editingId === product.id
                            const row = bulkRows[product.id]

                            if (bulkEditMode && row) {
                              const isChanged = changedIds.has(product.id)
                              const inputCls = "w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400"
                              return (
                                <tr key={product.id} className={`border-b border-stone-800/50 last:border-0 ${isChanged ? 'bg-amber-950/20' : ''}`}>
                                  <td className="px-5 py-2.5">
                                    <span className="font-medium text-white text-sm">{product.name}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-stone-400 text-sm">₺{cost.toFixed(2)}</td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center justify-end gap-1">
                                      <span className="text-stone-500 text-xs">₺</span>
                                      <input type="number" value={row.sale_price} onChange={e => updateBulkRow(product.id, 'sale_price', e.target.value)} className={inputCls + ' text-right w-20'} />
                                    </div>
                                  </td>
                                  <td className="px-2 py-2">
                                    <input type="number" value={row.estimated_monthly_sales} onChange={e => updateBulkRow(product.id, 'estimated_monthly_sales', e.target.value)} className={inputCls + ' text-right'} />
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-amber-400 font-bold text-sm">{product.actual_sales_30d || 0}</td>
                                  <td className="px-4 py-2.5 text-right">
                                    <span className={`font-bold text-sm ${getMarginColor(margin)}`}>%{margin.toFixed(1)}</span>
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    {isChanged && <span className="text-amber-400 text-xs font-medium">● değişti</span>}
                                  </td>
                                </tr>
                              )
                            }

                            return (
                              <Fragment key={product.id}>
                                <tr className={`border-b border-stone-800/50 last:border-0 hover:bg-stone-800/30 transition-colors ${isEditing ? 'bg-amber-900/20' : ''}`}>
                                  <td className="px-5 py-3 font-medium text-white">{product.name}</td>
                                  <td className="px-4 py-3 text-right text-stone-300 text-sm">₺{cost.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right text-white font-bold text-sm">₺{product.sale_price.toFixed(2)}</td>
                                  <td className="px-4 py-3 text-right text-stone-500 text-sm">{product.estimated_monthly_sales}</td>
                                  <td className="px-4 py-3 text-right text-amber-400 font-bold">{product.actual_sales_30d || 0}</td>
                                  <td className="px-4 py-3 text-right"><span className={`font-bold text-sm ${getMarginColor(margin)}`}>%{margin.toFixed(1)}</span></td>
                                  <td className="px-5 py-3 text-right">
                                    <div className="flex items-center justify-end gap-3">
                                      <button onClick={() => isEditing ? resetForm() : handleEdit(product)} className={`text-xs ${isEditing ? 'text-amber-400' : 'text-stone-400 hover:text-blue-400'} transition-colors`}>
                                        {isEditing ? 'İptal' : '✏️'}
                                      </button>
                                      <button onClick={() => handleDelete(product.id)} className="text-stone-400 hover:text-red-400 text-xs transition-colors">🗑️</button>
                                    </div>
                                  </td>
                                </tr>
                                {isEditing && (
                                  <tr>
                                    <td colSpan={7} className="p-4 bg-stone-950/80 border-b-2 border-amber-500/50">{renderForm()}</td>
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

      {/* Otomatik Kategorize Modalı */}
      {autoCatModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="px-6 py-5 border-b border-stone-800 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1"><span className="text-xl">🤖</span><h2 className="text-lg font-bold text-white">Otomatik Kategorize Önerileri</h2></div>
                {autoCatSuggestions.length === 0
                  ? <p className="text-stone-400 text-sm">Tüm ürünler zaten doğru kategoride! ✨</p>
                  : <p className="text-stone-400 text-sm">Yapay zeka <span className="text-amber-400 font-bold">{autoCatSuggestions.length} ürün</span> için kategori önerisi üretti.</p>}
              </div>
              <button onClick={() => setAutoCatModalOpen(false)} className="text-stone-500 hover:text-white text-xl ml-4">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {autoCatSuggestions.length === 0 ? (
                <div className="text-center py-12 text-stone-500"><div className="text-4xl mb-3">🎉</div><p>Her şey doğru sınıflandırılmış!</p></div>
              ) : (
                autoCatSuggestions.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between bg-stone-800 rounded-xl px-4 py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-stone-500 text-xs line-through">{s.current}</span>
                        <span className="text-stone-600 text-xs">→</span>
                        <span className="text-violet-400 text-xs font-semibold">{s.suggested}</span>
                      </div>
                    </div>
                    <button onClick={() => setAutoCatSuggestions(prev => prev.filter((_, idx) => idx !== i))} className="text-stone-600 hover:text-red-400 text-xs transition-colors">✕</button>
                  </div>
                ))
              )}
            </div>
            {autoCatSuggestions.length > 0 && (
              <div className="px-6 py-4 border-t border-stone-800 flex items-center justify-between gap-3">
                <p className="text-stone-500 text-xs">İstemediğin öneriyi ✕ ile çıkarabilirsin.</p>
                <div className="flex gap-3">
                  <button onClick={() => setAutoCatModalOpen(false)} className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-lg text-sm border border-stone-700">Vazgeç</button>
                  <button onClick={() => handleApplyAutoCat(autoCatSuggestions.map(s => ({ id: s.id, suggested: s.suggested })))} disabled={autoCatSaving} className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg text-sm flex items-center gap-2">
                    {autoCatSaving ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uygulanıyor...</> : <>✓ {autoCatSuggestions.length} Öneriyi Uygula</>}
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
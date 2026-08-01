'use client'

import React, { useState, useEffect, useMemo, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency } from '@/lib/format'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Material = { id: string; name: string; unit: string; price_per_unit: number }
type SubRecipe = { id: string; name: string; yield_quantity: number; yield_unit: string; wastage_percent: number; cost_per_yield?: number }
type ProductIngredient = { type: 'material' | 'sub_recipe'; item_id: string; quantity: number }
type Product = {
  id: string
  name: string
  category: string
  sale_price: number
  estimated_monthly_sales: number
  calculated_cost?: number
  actual_sales_30d?: number
}
type BulkRow = { id: string; sale_price: string; estimated_monthly_sales: string; category: string }

export default function Urunler() {
  const { showAlert, showConfirm } = useNotification()
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isBuildingAiRecipe, setIsBuildingAiRecipe] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Tümü')
  const [sortBy, setSortBy] = useState<'name' | 'price_desc' | 'price_asc' | 'margin_desc' | 'sales_desc'>('name')

  // Accordion state
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Bulk Edit Mode
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<Record<string, BulkRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  // Auto Categorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<{ id: string; name: string; current: string; suggested: string }[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)

  // Form State
  const [form, setForm] = useState({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' })
  const [recipeItems, setRecipeItems] = useState<ProductIngredient[]>([])

  const supabase = createClient()

  const defaultCategories = ['Sıcak Kahveler', 'Soğuk Kahveler', 'Tatlılar', 'Çaylar', 'Kutu İçecekler', 'Diğer']
  const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...defaultCategories, ...uniqueCategories]))

   
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
        myIngs.forEach(ing => {
          const mat = mats.find(m => m.id === ing.material_id)
          if (mat) totalCost += mat.price_per_unit * ing.quantity
        })
        const finalCost = totalCost * (1 + r.wastage_percent / 100)
        return { ...r, cost_per_yield: r.yield_quantity > 0 ? finalCost / r.yield_quantity : 0 }
      })
    }
    setSubRecipes(processedSubRecipes)

    const { data: prods } = await supabase.from('products').select('*').order('name')
    const { data: prod_ings } = await supabase.from('product_ingredients').select('*')
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: recentSales } = await supabase
      .from('sales')
      .select('product_id, quantity')
      .gte('sale_date', thirtyDaysAgo.toISOString().split('T')[0])

    const salesByProduct: Record<string, number> = {}
    recentSales?.forEach(s => {
      salesByProduct[s.product_id] = (salesByProduct[s.product_id] || 0) + s.quantity
    })

    if (prods) {
      const productsWithCost = prods.map(p => {
        const myIngs = prod_ings?.filter(i => i.product_id === p.id) || []
        let cost = 0
        myIngs.forEach(ing => {
          if (ing.material_id) {
            const mat = mats?.find(m => m.id === ing.material_id)
            if (mat) cost += mat.price_per_unit * ing.quantity
          } else if (ing.sub_recipe_id) {
            const sr = processedSubRecipes.find(s => s.id === ing.sub_recipe_id)
            if (sr?.cost_per_yield) cost += sr.cost_per_yield * ing.quantity
          }
        })
        return { ...p, calculated_cost: cost, actual_sales_30d: salesByProduct[p.id] || 0 }
      })
      setProducts(productsWithCost)
      setOpenCategories(new Set(productsWithCost.map(p => p.category)))
    }
    setLoading(false)
  }

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchData()
    }, 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Accordion Toggle ──────────────────────────────────────
  const toggleCategory = (cat: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const toggleAll = (open: boolean) => {
    setOpenCategories(open ? new Set(allCategories) : new Set())
  }

  // ─── Bulk Edit Mode ────────────────────────────────────────
  const enterBulkEdit = () => {
    const rows: Record<string, BulkRow> = {}
    products.forEach(p => {
      rows[p.id] = {
        id: p.id,
        sale_price: p.sale_price.toString(),
        estimated_monthly_sales: (p.estimated_monthly_sales || 0).toString(),
        category: p.category
      }
    })
    setBulkRows(rows)
    setChangedIds(new Set())
    setBulkEditMode(true)
    setShowModal(false)
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

      await supabase
        .from('products')
        .update({ sale_price: newPrice, estimated_monthly_sales: newEst, category: row.category })
        .eq('id', id)
    }
    setBulkEditMode(false)
    setChangedIds(new Set())
    setBulkSaving(false)
    fetchData()
    logActivity(
      'Ürünler',
      'GUNCELLEME',
      `${changedIds.size} adet ürünün bilgileri (fiyat/kategori) topluca güncellendi.`,
      bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : undefined
    )
  }

  // ─── Auto Categorize ────────────────────────────────────────
  const handleAutoCategorize = async () => {
    setAutoCatLoading(true)
    try {
      const res = await fetch('/api/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materials: products.map(p => ({ id: p.id, name: p.name, category: p.category })),
          categories: allCategories
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const suggestions = (data.suggestions || [])
        .map((s: { id: string, suggested_category: string }) => {
          const prod = products.find(p => p.id === s.id)
          return { id: s.id, name: prod?.name || s.id, current: prod?.category || 'Diğer', suggested: s.suggested_category }
        })
        .filter((s: { suggested: string, current: string }) => s.suggested !== s.current)

      setAutoCatSuggestions(suggestions)
      setAutoCatModalOpen(true)
    } catch (e: unknown) {
      await showAlert('Hata: ' + (e as Error).message, 'error')
    }
    setAutoCatLoading(false)
  }

  const handleApplyAutoCat = async (approved: { id: string; suggested: string }[]) => {
    setAutoCatSaving(true)
    for (const item of approved) {
      await supabase.from('products').update({ category: item.suggested }).eq('id', item.id)
    }
    setAutoCatModalOpen(false)
    setAutoCatSuggestions([])
    setAutoCatSaving(false)
    fetchData()
    logActivity('Ürünler', 'GUNCELLEME', `${approved.length} adet ürünün kategorisi yapay zeka ile otomatik güncellendi.`)
  }

  // ─── Form Management ────────────────────────────────────────
  const resetForm = () => {
    setForm({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' })
    setRecipeItems([])
    setEditingId(null)
    setShowModal(false)
  }

  const addRecipeItem = (type: 'material' | 'sub_recipe') =>
    setRecipeItems([...recipeItems, { type, item_id: '', quantity: 0 }])

  const updateRecipeItem = (index: number, field: string, value: string | number) => {
    const u = [...recipeItems]
    u[index] = { ...u[index], [field]: value }
    setRecipeItems(u)
  }

  const removeRecipeItem = (index: number) =>
    setRecipeItems(recipeItems.filter((_, i) => i !== index))

  const calculateLiveCost = () => {
    let total = 0
    recipeItems.forEach(item => {
      if (!item.item_id || !item.quantity) return
      if (item.type === 'material') {
        const mat = materials.find(m => m.id === item.item_id)
        if (mat) total += mat.price_per_unit * item.quantity
      } else {
        const sr = subRecipes.find(s => s.id === item.item_id)
        if (sr?.cost_per_yield) total += sr.cost_per_yield * item.quantity
      }
    })
    return total
  }

  const handleSubmit = async () => {
    if (!form.name) return
    const payload = {
      name: form.name,
      category: form.category,
      sale_price: parseFloat(form.sale_price || '0'),
      estimated_monthly_sales: parseInt(form.estimated_monthly_sales || '0')
    }
    let productId = editingId
    let details = ''

    if (editingId) {
      const oldProd = products.find(p => p.id === editingId)
      const changes = []
      if (oldProd?.sale_price !== payload.sale_price) changes.push(`Fiyat: ${oldProd?.sale_price} -> ${payload.sale_price} ₺`)
      if ((oldProd?.estimated_monthly_sales || 0) !== payload.estimated_monthly_sales)
        changes.push(`Tahmin: ${oldProd?.estimated_monthly_sales} -> ${payload.estimated_monthly_sales}`)
      if (oldProd?.category !== payload.category)
        changes.push(`Kategori: ${oldProd?.category || 'Diğer'} -> ${payload.category}`)
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
        await supabase.from('product_ingredients').insert(
          validItems.map(r => ({
            product_id: productId,
            material_id: r.type === 'material' ? r.item_id : null,
            sub_recipe_id: r.type === 'sub_recipe' ? r.item_id : null,
            quantity: r.quantity
          }))
        )
      }
    }
    resetForm()
    fetchData()
    logActivity(
      'Ürünler',
      editingId ? 'GUNCELLEME' : 'EKLEME',
      `${form.name} isimli ürün ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`,
      { detay: details }
    )
  }

  const handleEdit = async (product: Product) => {
    setForm({
      name: product.name,
      category: product.category,
      sale_price: product.sale_price.toString(),
      estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString()
    })
    setEditingId(product.id)
    const { data } = await supabase.from('product_ingredients').select('*').eq('product_id', product.id)
    setRecipeItems(
      data?.map(r => ({
        type: r.material_id ? 'material' : 'sub_recipe',
        item_id: r.material_id || r.sub_recipe_id,
        quantity: r.quantity
      })) || []
    )
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const productToDelete = products.find(p => p.id === id)
    const confirmed = await showConfirm(
      `"${productToDelete?.name}" ürününü silmek istediğinize emin misiniz?`,
      'Ürünü Sil 🗑️'
    )
    if (!confirmed) return
    await supabase.from('products').delete().eq('id', id)
    fetchData()
    logActivity('Ürünler', 'SILME', `${productToDelete?.name || 'Bir ürün'} sistemden silindi.`, { productId: id })
  }

  const handleAiRecipeBuild = async () => {
    if (!form.name) {
      await showAlert('Lütfen önce Ürün Adı girin.', 'warning')
      return
    }
    setIsBuildingAiRecipe(true)
    try {
      const res = await fetch('/api/ai-recipe-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: form.name,
          materials: materials.map(m => ({ id: m.id, name: m.name, unit: m.unit })),
          subRecipes: subRecipes.map(sr => ({ id: sr.id, name: sr.name, yield_unit: sr.yield_unit })),
          option: 1
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.ingredients && Array.isArray(data.ingredients)) {
        const newItems: ProductIngredient[] = data.ingredients.map((ing: { type: string, id: string, quantity: number }) => ({
          type: ing.type || 'material',
          item_id: ing.id,
          quantity: Number(ing.quantity) || 0
        }))
        if (recipeItems.length > 0) {
          const confirmed = await showConfirm(
            'Mevcut reçete silinip yapay zeka reçetesi eklenecek. Onaylıyor musunuz?',
            'Reçeteyi Güncelle 🤖'
          )
          if (!confirmed) {
            setIsBuildingAiRecipe(false)
            return
          }
        }
        setRecipeItems(newItems)
      }
    } catch (err: unknown) {
      await showAlert((err as Error).message, 'error')
    }
    setIsBuildingAiRecipe(false)
  }

  // ─── Computed Statistics & Calculations ─────────────────────
  const liveCost = calculateLiveCost()
  const salePrice = parseFloat(form.sale_price || '0')
  const liveMargin = salePrice > 0 ? ((salePrice - liveCost) / salePrice) * 100 : 0
  const liveCashContribution = (salePrice - liveCost) * parseInt(form.estimated_monthly_sales || '0')

  const totalRevenue = useMemo(
    () => products.reduce((t, p) => t + p.sale_price * (p.actual_sales_30d || 0), 0),
    [products]
  )

  const totalEstContribution = useMemo(
    () =>
      products.reduce(
        (t, p) => t + (p.sale_price - (p.calculated_cost || 0)) * (p.estimated_monthly_sales || 0),
        0
      ),
    [products]
  )

  const overallAvgMargin = useMemo(() => {
    if (products.length === 0) return 0
    const totalMargin = products.reduce((t, p) => {
      const cost = p.calculated_cost || 0
      return t + (p.sale_price > 0 ? ((p.sale_price - cost) / p.sale_price) * 100 : 0)
    }, 0)
    return totalMargin / products.length
  }, [products])

  const getMarginColor = (margin: number) =>
    margin >= 50
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : margin >= 30
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20'

  // Filtered and sorted products
  const processedProducts = useMemo(() => {
    let result = [...products]

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter(p => p.name.toLowerCase().includes(query))
    }

    if (categoryFilter !== 'Tümü') {
      result = result.filter(p => p.category === categoryFilter)
    }

    result.sort((a, b) => {
      const costA = a.calculated_cost || 0
      const costB = b.calculated_cost || 0
      const marginA = a.sale_price > 0 ? ((a.sale_price - costA) / a.sale_price) * 100 : 0
      const marginB = b.sale_price > 0 ? ((b.sale_price - costB) / b.sale_price) * 100 : 0

      if (sortBy === 'price_desc') return b.sale_price - a.sale_price
      if (sortBy === 'price_asc') return a.sale_price - b.sale_price
      if (sortBy === 'margin_desc') return marginB - marginA
      if (sortBy === 'sales_desc') return (b.actual_sales_30d || 0) - (a.actual_sales_30d || 0)
      return a.name.localeCompare(b.name)
    })

    return result
  }, [products, search, categoryFilter, sortBy])

  const groupedByCategory = useMemo(() => {
    const activeCats = categoryFilter !== 'Tümü' ? [categoryFilter] : allCategories
    return activeCats
      .map(cat => ({
        cat,
        items: processedProducts.filter(p => p.category === cat)
      }))
      .filter(g => g.items.length > 0)
  }, [allCategories, processedProducts, categoryFilter])

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              ☕
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Menü & Ürünler</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Reçete & Maliyet Engine
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Reçeteli ürün maliyeti, kar marjı ve yapay zeka destekli fiyat yönetimi.
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBulkEditMode(false)
                    setChangedIds(new Set())
                  }}
                  className="border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white"
                >
                  İptal
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkSave}
                  disabled={bulkSaving || changedIds.size === 0}
                  className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold shadow-md shadow-amber-500/20"
                >
                  {bulkSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin mr-2" />
                      Kaydediliyor...
                    </>
                  ) : (
                    <>✓ Tümünü Kaydet</>
                  )}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={enterBulkEdit}
                  className="bg-stone-900 border-stone-800 text-stone-200 hover:bg-stone-800 shadow-sm"
                >
                  <span className="mr-2">✏️</span>
                  Hızlı Düzenle
                </Button>

                <Button
                  variant="outline"
                  onClick={handleAutoCategorize}
                  disabled={autoCatLoading}
                  className="bg-violet-950/60 border-violet-800/40 text-violet-300 hover:bg-violet-900/80 hover:text-violet-200 shadow-sm"
                >
                  {autoCatLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mr-2" />
                      Analiz...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">🤖</span>
                      AI Kategorize
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => {
                    resetForm()
                    setShowModal(true)
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold shadow-lg shadow-amber-500/20"
                >
                  <span className="mr-2">➕</span>
                  Yeni Ürün Ekle
                </Button>
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
              <span className="text-stone-400 text-xs font-semibold">Toplam Menü Ürünü</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                📦
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{products.length}</div>
            <div className="text-stone-400 text-[11px] mt-1 flex items-center gap-1">
              <span className="text-stone-400 font-bold">{allCategories.length}</span> Kategori Altında
            </div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Son 30 Günlük Ciro</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                💰
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">{formatCurrency(totalRevenue)}</div>
            <div className="text-stone-400 text-[11px] mt-1">Gerçekleşen Satışlar</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Ortalama Kar Marjı</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
                📈
              </span>
            </div>
            <div className={`text-xl sm:text-2xl font-black ${overallAvgMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
              %{overallAvgMargin.toFixed(1)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Menü Genel Ortalama</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Aylık Tahmini Nakit Katkı</span>
              <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-base">
                💵
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-violet-400">{formatCurrency(totalEstContribution)}</div>
            <div className="text-stone-400 text-[11px] mt-1">Hedeflenen Net Brüt Katkı</div>
          </div>
        </div>

        {/* SEARCH, FILTER & ACTION BAR */}
        <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
            <Input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ürün adı ile hızlı ara..."
              className="pl-9 pr-8"
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
              <option value="Tümü">Tüm Kategoriler ({products.length})</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>
                  {cat} ({products.filter(p => p.category === cat).length})
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'name' | 'price_desc' | 'price_asc' | 'margin_desc' | 'sales_desc')}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-300 text-xs focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="name">İsme Göre (A-Z)</option>
              <option value="price_desc">Fiyat (En Yüksek)</option>
              <option value="price_asc">Fiyat (En Düşük)</option>
              <option value="margin_desc">Kar Marjı (En Yüksek)</option>
              <option value="sales_desc">Son 30G Satış (En Çok)</option>
            </select>

            <button
              onClick={() => toggleAll(openCategories.size === 0)}
              className="bg-stone-950 hover:bg-stone-800 text-stone-300 hover:text-white text-xs font-semibold px-3 py-2 border border-stone-800 rounded-xl whitespace-nowrap transition-colors"
            >
              {openCategories.size === 0 ? '▼ Tümünü Aç' : '▲ Tümünü Kapat'}
            </button>
          </div>
        </div>

        {/* ──────────────── PRODUCTS LIST / CATEGORY ACCORDIONS ──────────────── */}
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">⚙️</div>
            <p className="text-sm font-medium">Menü ve Reçeteler Yükleniyor...</p>
          </div>
        ) : groupedByCategory.length === 0 ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-500 backdrop-blur-md">
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-bold text-stone-300 mb-1">Aramanıza Uygun Ürün Bulunamadı</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Arama filtrenizi temizleyerek veya &quot;+ Yeni Ürün Ekle&quot; butonunu kullanarak yeni ürün tanımlayabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByCategory.map(({ cat, items }) => {
              const isOpen = openCategories.has(cat)
              const avgMargin =
                items.reduce((t, p) => {
                  const cost = p.calculated_cost || 0
                  return t + (p.sale_price > 0 ? ((p.sale_price - cost) / p.sale_price) * 100 : 0)
                }, 0) / items.length

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
                        {items.length} ürün
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className={`font-bold text-xs sm:text-sm px-2 py-0.5 rounded-lg border ${getMarginColor(avgMargin)}`}>
                          Ort. %{avgMargin.toFixed(1)}
                        </span>
                      </div>
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
                              <th className="px-5 py-3">Ürün Adı</th>
                              <th className="px-4 py-3 text-right">Food Cost</th>
                              <th className="px-4 py-3 text-right">Satış Fiyatı</th>
                              <th className="px-4 py-3 text-right">Tahmini Aylık</th>
                              <th className="px-4 py-3 text-right text-amber-400">Son 30G Satış</th>
                              <th className="px-4 py-3 text-right">Kâr Marjı</th>
                              <th className="px-5 py-3 text-right">{bulkEditMode ? 'Durum' : 'İşlem'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                            {items.map(product => {
                              const cost = product.calculated_cost || 0
                              const margin = product.sale_price > 0 ? ((product.sale_price - cost) / product.sale_price) * 100 : 0
                              const isEditing = editingId === product.id
                              const row = bulkRows[product.id]

                              if (bulkEditMode && row) {
                                const isChanged = changedIds.has(product.id)
                                const inputCls =
                                  'w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-amber-500'
                                return (
                                  <tr
                                    key={product.id}
                                    className={`transition-colors ${isChanged ? 'bg-amber-500/10' : ''}`}
                                  >
                                    <td className="px-5 py-3 font-semibold text-white">{product.name}</td>
                                    <td className="px-4 py-3 text-right text-stone-400">₺{cost.toFixed(2)}</td>
                                    <td className="px-2 py-2">
                                      <div className="flex items-center justify-end gap-1">
                                        <span className="text-stone-500 text-xs">₺</span>
                                        <input
                                          type="number"
                                          value={row.sale_price}
                                          onChange={e => updateBulkRow(product.id, 'sale_price', e.target.value)}
                                          className={inputCls + ' text-right w-24 font-bold text-amber-400'}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-2 py-2">
                                      <input
                                        type="number"
                                        value={row.estimated_monthly_sales}
                                        onChange={e => updateBulkRow(product.id, 'estimated_monthly_sales', e.target.value)}
                                        className={inputCls + ' text-right w-20'}
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-right text-amber-400 font-bold">
                                      {product.actual_sales_30d || 0}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className={`font-bold px-2 py-0.5 rounded-lg border ${getMarginColor(margin)}`}>
                                        %{margin.toFixed(1)}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3 text-right font-medium text-amber-400">
                                      {isChanged && <span>● Değişti</span>}
                                    </td>
                                  </tr>
                                )
                              }

                              return (
                                <tr
                                  key={product.id}
                                  className={`hover:bg-stone-800/30 transition-colors ${
                                    isEditing ? 'bg-amber-500/10' : ''
                                  }`}
                                >
                                  <td className="px-5 py-3.5 font-bold text-stone-100">{product.name}</td>
                                  <td className="px-4 py-3.5 text-right text-stone-400 font-medium">₺{cost.toFixed(2)}</td>
                                  <td className="px-4 py-3.5 text-right text-white font-extrabold text-base">
                                    ₺{product.sale_price.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3.5 text-right text-stone-400">{product.estimated_monthly_sales} adet</td>
                                  <td className="px-4 py-3.5 text-right text-amber-400 font-bold">
                                    {product.actual_sales_30d || 0} adet
                                  </td>
                                  <td className="px-4 py-3.5 text-right">
                                    <span className={`font-bold px-2.5 py-0.5 rounded-lg border ${getMarginColor(margin)}`}>
                                      %{margin.toFixed(1)}
                                    </span>
                                  </td>
                                  <td className="px-5 py-3.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => handleEdit(product)}
                                        className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition-colors active:scale-95"
                                        title="Düzenle"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={() => handleDelete(product.id)}
                                        className="p-1.5 bg-stone-800 hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg border border-stone-700 hover:border-red-500/30 transition-colors active:scale-95"
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
                        {items.map(product => {
                          const cost = product.calculated_cost || 0
                          const margin = product.sale_price > 0 ? ((product.sale_price - cost) / product.sale_price) * 100 : 0
                          const row = bulkRows[product.id]

                          if (bulkEditMode && row) {
                            const isChanged = changedIds.has(product.id)
                            return (
                              <div key={product.id} className={`p-4 space-y-3 ${isChanged ? 'bg-amber-500/10' : ''}`}>
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-white text-sm">{product.name}</span>
                                  {isChanged && <span className="text-amber-400 text-xs font-bold">● Değişti</span>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <label className="text-stone-400 block mb-1">Satış Fiyatı (₺)</label>
                                    <input
                                      type="number"
                                      value={row.sale_price}
                                      onChange={e => updateBulkRow(product.id, 'sale_price', e.target.value)}
                                      className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-amber-400 font-bold text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-stone-400 block mb-1">Tahmini Satış</label>
                                    <input
                                      type="number"
                                      value={row.estimated_monthly_sales}
                                      onChange={e => updateBulkRow(product.id, 'estimated_monthly_sales', e.target.value)}
                                      className="w-full bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1.5 text-white text-sm"
                                    />
                                  </div>
                                </div>
                              </div>
                            )
                          }

                          return (
                            <div key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
                              <div className="flex items-center justify-between">
                                <h4 className="font-bold text-white text-sm sm:text-base">{product.name}</h4>
                                <span className={`font-bold text-xs px-2 py-0.5 rounded-lg border ${getMarginColor(margin)}`}>
                                  %{margin.toFixed(1)} Kar
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Food Cost</span>
                                  <span className="font-semibold text-stone-200">₺{cost.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Satış Fiyatı</span>
                                  <span className="font-extrabold text-amber-400">₺{product.sale_price.toFixed(2)}</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Tahmini Satış</span>
                                  <span className="text-stone-300">{product.estimated_monthly_sales} adet</span>
                                </div>
                                <div>
                                  <span className="text-stone-400 block text-[10px]">Son 30G Satış</span>
                                  <span className="font-bold text-amber-400">{product.actual_sales_30d || 0} adet</span>
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => handleEdit(product)}
                                  className="px-3 py-1 bg-stone-800 text-stone-200 hover:text-white rounded-lg text-xs font-semibold border border-stone-700"
                                >
                                  ✏️ Düzenle
                                </button>
                                <button
                                  onClick={() => handleDelete(product.id)}
                                  className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-semibold border border-red-500/20"
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

      {/* ──────────────── PRODUCT FORM MODAL / DRAWER ──────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => resetForm()}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  {editingId ? '✏️' : '✨'}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg">
                    {editingId ? 'Ürünü Düzenle' : 'Yeni Menü Ürünü Ekle'}
                  </h3>
                  <p className="text-stone-400 text-xs">
                    Reçete ve fiyat bilgilerini girerek ürün maliyetini hesaplayabilirsiniz.
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Product Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Ürün Adı *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="örn: Caffe Latte"
                  />
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Kategori</label>
                  <input
                    list="category-options-modal"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    placeholder="Kategori seç/yaz..."
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  />
                  <datalist id="category-options-modal">
                    {allCategories.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    value={form.sale_price}
                    onChange={e => setForm({ ...form, sale_price: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="text-amber-400 text-xs font-semibold mb-1 block">Tahmini Aylık Satış</label>
                  <input
                    type="number"
                    value={form.estimated_monthly_sales}
                    onChange={e => setForm({ ...form, estimated_monthly_sales: e.target.value })}
                    className="w-full bg-stone-950 border border-amber-500/30 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Recipe Ingredients Section */}
              <div className="bg-stone-950/60 p-4 rounded-2xl border border-stone-800/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-800/80">
                  <div>
                    <h4 className="font-bold text-amber-400 text-sm">Ürün Reçetesi</h4>
                    <p className="text-stone-400 text-xs">Bu ürünü hazırlamak için kullanılan hammadde veya soslar.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleAiRecipeBuild}
                      disabled={isBuildingAiRecipe}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-all active:scale-95"
                    >
                      {isBuildingAiRecipe ? '⏳ Oluşturuluyor...' : '✨ Yapay Zeka Hesaplasın'}
                    </button>
                    <button
                      onClick={() => addRecipeItem('material')}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
                    >
                      + Hammadde
                    </button>
                    <button
                      onClick={() => addRecipeItem('sub_recipe')}
                      className="bg-stone-800 hover:bg-stone-700 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
                    >
                      + Üretim Reçetesi
                    </button>
                  </div>
                </div>

                {recipeItems.length === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-4">
                    Reçete boş. Yukarıdaki butonlarla hammadde veya üretim reçetesi ekleyebilirsiniz.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recipeItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-stone-900 p-2.5 rounded-xl border border-stone-800 text-xs"
                      >
                        <span
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold text-center shrink-0 ${
                            item.type === 'sub_recipe'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {item.type === 'sub_recipe' ? 'Üretim Reçetesi' : 'Hammadde'}
                        </span>

                        <div className="flex-1 min-w-0">
                          {item.type === 'material' ? (
                            <select
                              value={item.item_id}
                              onChange={e => updateRecipeItem(index, 'item_id', e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                            >
                              <option value="">Hammadde Seçiniz...</option>
                              {materials.map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.unit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={item.item_id}
                              onChange={e => updateRecipeItem(index, 'item_id', e.target.value)}
                              className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                            >
                              <option value="">Üretim Reçetesi Seçiniz...</option>
                              {subRecipes.map(sr => (
                                <option key={sr.id} value={sr.id}>
                                  {sr.name} (1 {sr.yield_unit})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-40">
                          <input
                            type="number"
                            value={item.quantity || ''}
                            onChange={e => updateRecipeItem(index, 'quantity', parseFloat(e.target.value))}
                            className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs text-right focus:outline-none"
                            placeholder="Miktar"
                          />
                          <span className="text-stone-400 text-xs shrink-0 w-12 truncate">
                            {item.type === 'material'
                              ? materials.find(m => m.id === item.item_id)?.unit
                              : subRecipes.find(s => s.id === item.item_id)?.yield_unit}
                          </span>
                        </div>

                        <button
                          onClick={() => removeRecipeItem(index)}
                          className="text-stone-500 hover:text-red-400 p-1 rounded-lg hover:bg-stone-800 text-center transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Real-time Financial Breakdown Card */}
              <div className="bg-stone-950 border border-stone-800 p-4 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <span className="text-stone-400 text-[11px] block">Food Cost (Maliyet)</span>
                  <span className="text-stone-200 font-bold text-base">₺{liveCost.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-stone-400 text-[11px] block">Satış Fiyatı</span>
                  <span className="text-amber-400 font-extrabold text-base">₺{salePrice.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-stone-400 text-[11px] block">Kâr Marjı</span>
                  <span className={`font-bold text-base ${overallAvgMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    %{liveMargin.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 text-[11px] block">Aylık Nakit Katkı</span>
                  <span className="text-violet-400 font-extrabold text-base">{formatCurrency(liveCashContribution)}</span>
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
                {editingId ? 'Ürünü Güncelle' : 'Ürünü Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── AUTO CATEGORIZE MODAL ──────────────── */}
      {autoCatModalOpen && (
        <div className="fixed inset-0 bg-stone-950/90 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="text-base font-bold text-white">Otomatik AI Kategorize Önerileri</h3>
                  <p className="text-stone-400 text-xs">
                    {autoCatSuggestions.length === 0
                      ? 'Tüm ürünler doğru kategoride! ✨'
                      : `Yapay zeka ${autoCatSuggestions.length} ürün için yeni kategori önerdi.`}
                  </p>
                </div>
              </div>
              <button onClick={() => setAutoCatModalOpen(false)} className="text-stone-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {autoCatSuggestions.length === 0 ? (
                <div className="text-center py-12 text-stone-500">
                  <div className="text-4xl mb-2">🎉</div>
                  <p className="text-xs">Tüm ürünler doğru kategorilere atanmış durumda!</p>
                </div>
              ) : (
                autoCatSuggestions.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="text-stone-500 line-through">{s.current}</span>
                        <span className="text-stone-600">→</span>
                        <span className="text-violet-400 font-bold">{s.suggested}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoCatSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-stone-500 hover:text-red-400 p-1.5 rounded-lg transition-colors ml-2"
                      title="Öneriyi Kaldır"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {autoCatSuggestions.length > 0 && (
              <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex items-center justify-between gap-3">
                <span className="text-stone-500 text-[11px]">İstemediğin öneriyi ✕ ile listeden çıkarabilirsin.</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAutoCatModalOpen(false)}
                    className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-xl text-xs font-semibold border border-stone-700"
                  >
                    Vazgeç
                  </button>
                  <button
                    onClick={() =>
                      handleApplyAutoCat(autoCatSuggestions.map(s => ({ id: s.id, suggested: s.suggested })))
                    }
                    disabled={autoCatSaving}
                    className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-violet-600/20"
                  >
                    {autoCatSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Uygulanıyor...
                      </>
                    ) : (
                      <>✓ Önerileri Uygula</>
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
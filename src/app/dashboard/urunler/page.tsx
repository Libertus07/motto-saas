'use client'

import React, { useState, useEffect, useMemo, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { useAppTour } from '@/hooks/useAppTour'
import { ProductCatalog } from '@/features/products/components/ProductCatalog'
import { ProductFilters } from '@/features/products/components/ProductFilters'
import { ProductFormDrawer } from '@/features/products/components/ProductFormDrawer'
import type {
  Product,
  ProductBulkRow,
  ProductFormValues,
  ProductIngredient,
  ProductMaterial,
  ProductSort,
  SubRecipe,
} from '@/features/products/types'
import { productTourSteps } from '@/features/products/tour'
import { calculateMargin, calculateProductMetrics, calculateRecipeCost } from '@/features/products/utils'

export default function Urunler() {
  const { showAlert, showConfirm } = useNotification()
  useAppTour('urunler', productTourSteps)
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isBuildingAiRecipe, setIsBuildingAiRecipe] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('Tümü')
  const [sortBy, setSortBy] = useState<ProductSort>('name')

  // Accordion state
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  // Bulk Edit Mode
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<Record<string, ProductBulkRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  // Auto Categorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<
    { id: string; name: string; current: string; suggested: string }[]
  >([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)

  // Form State
  const [form, setForm] = useState<ProductFormValues>({
    name: '',
    category: 'Sıcak Kahveler',
    sale_price: '',
    estimated_monthly_sales: '0',
  })
  const [recipeItems, setRecipeItems] = useState<ProductIngredient[]>([])

  const supabase = createClient()

  const defaultCategories = ['Sıcak Kahveler', 'Soğuk Kahveler', 'Tatlılar', 'Çaylar', 'Kutu İçecekler', 'Diğer']
  const uniqueCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...defaultCategories, ...uniqueCategories]))

  const fetchData = async () => {
    setLoading(true)
    const { data: mats } = await supabase.from('materials').select('*').order('name')
    setMaterials(mats || [])

    const { data: s_recipes } = await supabase.from('sub_recipes').select('*').order('name')
    const { data: s_recipe_ings } = await supabase.from('sub_recipe_ingredients').select('*')
    let processedSubRecipes: SubRecipe[] = []
    if (s_recipes && s_recipe_ings && mats) {
      processedSubRecipes = s_recipes.map((r) => {
        const myIngs = s_recipe_ings.filter((i) => i.sub_recipe_id === r.id)
        let totalCost = 0
        myIngs.forEach((ing) => {
          const mat = mats.find((m) => m.id === ing.material_id)
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
    recentSales?.forEach((s) => {
      salesByProduct[s.product_id] = (salesByProduct[s.product_id] || 0) + s.quantity
    })

    if (prods) {
      const productsWithCost = prods.map((p) => {
        const myIngs = prod_ings?.filter((i) => i.product_id === p.id) || []
        let cost = 0
        myIngs.forEach((ing) => {
          if (ing.material_id) {
            const mat = mats?.find((m) => m.id === ing.material_id)
            if (mat) cost += mat.price_per_unit * ing.quantity
          } else if (ing.sub_recipe_id) {
            const sr = processedSubRecipes.find((s) => s.id === ing.sub_recipe_id)
            if (sr?.cost_per_yield) cost += sr.cost_per_yield * ing.quantity
          }
        })
        return { ...p, calculated_cost: cost, actual_sales_30d: salesByProduct[p.id] || 0 }
      })
      setProducts(productsWithCost)
      setOpenCategories(new Set(productsWithCost.map((p) => p.category)))
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
    setOpenCategories((prev) => {
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
    const rows: Record<string, ProductBulkRow> = {}
    products.forEach((p) => {
      rows[p.id] = {
        id: p.id,
        sale_price: p.sale_price.toString(),
        estimated_monthly_sales: (p.estimated_monthly_sales || 0).toString(),
        category: p.category,
      }
    })
    setBulkRows(rows)
    setChangedIds(new Set())
    setBulkEditMode(true)
    setShowModal(false)
  }

  const updateBulkRow = (id: string, field: keyof ProductBulkRow, value: string) => {
    setBulkRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
    setChangedIds((prev) => new Set([...prev, id]))
  }

  const handleBulkSave = async () => {
    setBulkSaving(true)
    const bulkDetails: string[] = []
    for (const id of [...changedIds]) {
      const row = bulkRows[id]
      const oldProd = products.find((p) => p.id === id)
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
      bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : undefined,
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
          materials: products.map((p) => ({ id: p.id, name: p.name, category: p.category })),
          categories: allCategories,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const suggestions = (data.suggestions || [])
        .map((s: { id: string; suggested_category: string }) => {
          const prod = products.find((p) => p.id === s.id)
          return {
            id: s.id,
            name: prod?.name || s.id,
            current: prod?.category || 'Diğer',
            suggested: s.suggested_category,
          }
        })
        .filter((s: { suggested: string; current: string }) => s.suggested !== s.current)

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
    logActivity(
      'Ürünler',
      'GUNCELLEME',
      `${approved.length} adet ürünün kategorisi yapay zeka ile otomatik güncellendi.`,
    )
  }

  // ─── Form Management ────────────────────────────────────────
  const resetForm = () => {
    setForm({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' })
    setRecipeItems([])
    setEditingId(null)
    setShowModal(false)
  }

  const addRecipeItem = (type: 'material' | 'sub_recipe') =>
    setRecipeItems((currentItems) => [...currentItems, { type, item_id: '', quantity: 0 }])

  const updateRecipeItem = (index: number, field: 'item_id' | 'quantity', value: string | number) =>
    setRecipeItems((currentItems) =>
      currentItems.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    )

  const updateFormField = <Field extends keyof ProductFormValues>(field: Field, value: ProductFormValues[Field]) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const removeRecipeItem = (index: number) =>
    setRecipeItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index))

  const handleSubmit = async () => {
    if (!form.name) return
    const payload = {
      name: form.name,
      category: form.category,
      sale_price: parseFloat(form.sale_price || '0'),
      estimated_monthly_sales: parseInt(form.estimated_monthly_sales || '0'),
    }
    let productId = editingId
    let details = ''

    if (editingId) {
      const oldProd = products.find((p) => p.id === editingId)
      const changes = []
      if (oldProd?.sale_price !== payload.sale_price)
        changes.push(`Fiyat: ${oldProd?.sale_price} -> ${payload.sale_price} ₺`)
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
      const validItems = recipeItems.filter((r) => r.item_id && r.quantity > 0)
      if (validItems.length > 0) {
        await supabase.from('product_ingredients').insert(
          validItems.map((r) => ({
            product_id: productId,
            material_id: r.type === 'material' ? r.item_id : null,
            sub_recipe_id: r.type === 'sub_recipe' ? r.item_id : null,
            quantity: r.quantity,
          })),
        )
      }
    }
    resetForm()
    fetchData()
    logActivity(
      'Ürünler',
      editingId ? 'GUNCELLEME' : 'EKLEME',
      `${form.name} isimli ürün ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`,
      { detay: details },
    )
  }

  const handleEdit = async (product: Product) => {
    setForm({
      name: product.name,
      category: product.category,
      sale_price: product.sale_price.toString(),
      estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString(),
    })
    setEditingId(product.id)
    const { data } = await supabase.from('product_ingredients').select('*').eq('product_id', product.id)
    setRecipeItems(
      data?.map((r) => ({
        type: r.material_id ? 'material' : 'sub_recipe',
        item_id: r.material_id || r.sub_recipe_id,
        quantity: r.quantity,
      })) || [],
    )
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const productToDelete = products.find((p) => p.id === id)
    const confirmed = await showConfirm(
      `"${productToDelete?.name}" ürününü silmek istediğinize emin misiniz?`,
      'Ürünü Sil 🗑️',
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
          materials: materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit })),
          subRecipes: subRecipes.map((sr) => ({ id: sr.id, name: sr.name, yield_unit: sr.yield_unit })),
          option: 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.ingredients && Array.isArray(data.ingredients)) {
        const newItems: ProductIngredient[] = data.ingredients.map(
          (ing: { type: string; id: string; quantity: number }) => ({
            type: ing.type || 'material',
            item_id: ing.id,
            quantity: Number(ing.quantity) || 0,
          }),
        )
        if (recipeItems.length > 0) {
          const confirmed = await showConfirm(
            'Mevcut reçete silinip yapay zeka reçetesi eklenecek. Onaylıyor musunuz?',
            'Reçeteyi Güncelle 🤖',
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
  const liveCost = calculateRecipeCost(recipeItems, materials, subRecipes)
  const salePrice = parseFloat(form.sale_price || '0')
  const liveMargin = calculateMargin(salePrice, liveCost)
  const liveCashContribution = (salePrice - liveCost) * parseInt(form.estimated_monthly_sales || '0')

  const {
    totalRevenue,
    totalEstimatedContribution: totalEstContribution,
    averageMargin: overallAvgMargin,
  } = useMemo(() => calculateProductMetrics(products), [products])

  // Filtered and sorted products
  const processedProducts = useMemo(() => {
    let result = [...products]

    if (search.trim()) {
      const query = search.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(query))
    }

    if (categoryFilter !== 'Tümü') {
      result = result.filter((p) => p.category === categoryFilter)
    }

    result.sort((a, b) => {
      const costA = a.calculated_cost || 0
      const costB = b.calculated_cost || 0
      const marginA = calculateMargin(a.sale_price, costA)
      const marginB = calculateMargin(b.sale_price, costB)

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
      .map((cat) => ({
        cat,
        items: processedProducts.filter((p) => p.category === cat),
      }))
      .filter((g) => g.items.length > 0)
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
          <div id="tour-products-create" className="flex flex-wrap items-center gap-2 sm:gap-3">
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
        <div id="tour-products-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
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
            <div
              className={`text-xl sm:text-2xl font-black ${overallAvgMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}
            >
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

        <ProductFilters
          search={search}
          onSearchChange={setSearch}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          products={products}
          categories={allCategories}
          sortBy={sortBy}
          onSortChange={setSortBy}
          allCategoriesOpen={openCategories.size > 0}
          onToggleAll={() => toggleAll(openCategories.size === 0)}
        />

        <ProductCatalog
          loading={loading}
          groups={groupedByCategory}
          openCategories={openCategories}
          bulkEditMode={bulkEditMode}
          bulkRows={bulkRows}
          changedIds={changedIds}
          editingId={editingId}
          onToggleCategory={toggleCategory}
          onBulkRowChange={updateBulkRow}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </main>

      <ProductFormDrawer
        open={showModal}
        editing={editingId !== null}
        form={form}
        categories={allCategories}
        recipeItems={recipeItems}
        materials={materials}
        subRecipes={subRecipes}
        isBuildingAiRecipe={isBuildingAiRecipe}
        liveCost={liveCost}
        salePrice={salePrice}
        liveMargin={liveMargin}
        liveCashContribution={liveCashContribution}
        onClose={resetForm}
        onFormChange={updateFormField}
        onBuildAiRecipe={handleAiRecipeBuild}
        onAddRecipeItem={addRecipeItem}
        onUpdateRecipeItem={updateRecipeItem}
        onRemoveRecipeItem={removeRecipeItem}
        onSubmit={handleSubmit}
      />

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
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold truncate">{s.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                        <span className="text-stone-500 line-through">{s.current}</span>
                        <span className="text-stone-600">→</span>
                        <span className="text-violet-400 font-bold">{s.suggested}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoCatSuggestions((prev) => prev.filter((_, idx) => idx !== i))}
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
                      handleApplyAutoCat(autoCatSuggestions.map((s) => ({ id: s.id, suggested: s.suggested })))
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

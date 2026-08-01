'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useNotification } from '@/components/NotificationProvider'
import { useAppTour } from '@/hooks/useAppTour'
import { AutoCategorizeDialog } from '@/features/products/components/AutoCategorizeDialog'
import { ProductCatalog } from '@/features/products/components/ProductCatalog'
import { ProductFilters } from '@/features/products/components/ProductFilters'
import { ProductFormDrawer } from '@/features/products/components/ProductFormDrawer'
import { ProductMetrics } from '@/features/products/components/ProductMetrics'
import { ProductPageHeader } from '@/features/products/components/ProductPageHeader'
import { useProductMutations } from '@/features/products/hooks/useProductMutations'
import { useProductsData } from '@/features/products/hooks/useProductsData'
import type {
  Product,
  ProductBulkRow,
  ProductBulkUpdate,
  ProductCategorySuggestion,
  ProductFormValues,
  ProductIngredient,
  ProductSort,
} from '@/features/products/types'
import { productTourSteps } from '@/features/products/tour'
import { calculateMargin, calculateProductMetrics, calculateRecipeCost } from '@/features/products/utils'

export default function Urunler() {
  const { showAlert, showConfirm } = useNotification()
  useAppTour('urunler', productTourSteps)
  const {
    supabase,
    organizationId,
    products,
    materials,
    subRecipes,
    loading,
    error: productsError,
    refresh: fetchData,
  } = useProductsData()
  const {
    saveProduct,
    updateProducts,
    removeProduct,
    loadProductRecipe,
    savingProduct,
    bulkSaving,
    categorizing: autoCatSaving,
  } = useProductMutations({ supabase, organizationId, refresh: fetchData })
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

  // Auto Categorize
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<ProductCategorySuggestion[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)

  // Form State
  const [form, setForm] = useState<ProductFormValues>({
    name: '',
    category: 'Sıcak Kahveler',
    sale_price: '',
    estimated_monthly_sales: '0',
  })
  const [recipeItems, setRecipeItems] = useState<ProductIngredient[]>([])

  const defaultCategories = ['Sıcak Kahveler', 'Soğuk Kahveler', 'Tatlılar', 'Çaylar', 'Kutu İçecekler', 'Diğer']
  const uniqueCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)))
  const allCategories = Array.from(new Set([...defaultCategories, ...uniqueCategories]))

  useEffect(() => {
    if (loading) return

    const timeoutId = window.setTimeout(() => {
      setOpenCategories(new Set(products.map((product) => product.category)))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [loading, products])

  useEffect(() => {
    if (productsError) void showAlert(`Ürün verileri yüklenemedi: ${productsError.message}`, 'error')
  }, [productsError, showAlert])

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
    const bulkDetails: string[] = []
    const updates: ProductBulkUpdate[] = []

    for (const id of [...changedIds]) {
      const row = bulkRows[id]
      const oldProd = products.find((p) => p.id === id)
      const oldPrice = oldProd?.sale_price || 0
      const newPrice = parseFloat(row.sale_price)
      const oldEst = oldProd?.estimated_monthly_sales || 0
      const newEst = parseInt(row.estimated_monthly_sales)

      if (!Number.isFinite(newPrice) || newPrice < 0 || !Number.isInteger(newEst) || newEst < 0) {
        await showAlert('Toplu düzenlemede geçersiz fiyat veya satış tahmini bulundu.', 'warning')
        return
      }

      const changes = []
      if (oldPrice !== newPrice) changes.push(`Fiyat: ${oldPrice}->${newPrice}`)
      if (oldEst !== newEst) changes.push(`Tahmin: ${oldEst}->${newEst}`)
      if (oldProd?.category !== row.category) changes.push(`Kategori: ${oldProd?.category}->${row.category}`)
      if (changes.length > 0) bulkDetails.push(`${oldProd?.name || 'Ürün'} (${changes.join(', ')})`)

      updates.push({ id, sale_price: newPrice, estimated_monthly_sales: newEst, category: row.category })
    }

    try {
      await updateProducts(
        updates,
        `${updates.length} adet ürünün bilgileri (fiyat/kategori) topluca güncellendi.`,
        bulkDetails.length > 0 ? { detay: bulkDetails.join(' | ') } : {},
        'bulk',
      )
      setBulkEditMode(false)
      setChangedIds(new Set())
      await showAlert(`${updates.length} ürün başarıyla güncellendi.`, 'success')
    } catch (error: unknown) {
      await showAlert(`Toplu güncelleme tamamlanamadı: ${(error as Error).message}`, 'error')
    }
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
    const suggestionById = new Map(approved.map((item) => [item.id, item.suggested]))
    const updates = products
      .filter((product) => suggestionById.has(product.id))
      .map((product) => ({
        id: product.id,
        sale_price: product.sale_price,
        estimated_monthly_sales: product.estimated_monthly_sales || 0,
        category: suggestionById.get(product.id) ?? product.category,
      }))

    if (updates.length === 0) {
      await showAlert('Uygulanacak kategori önerisi bulunamadı.', 'warning')
      return
    }

    try {
      await updateProducts(
        updates,
        `${updates.length} adet ürünün kategorisi yapay zeka ile otomatik güncellendi.`,
        { kaynak: 'ai_auto_categorize', urunler: approved },
        'categorize',
      )
      setAutoCatModalOpen(false)
      setAutoCatSuggestions([])
      await showAlert('Kategori önerileri başarıyla uygulandı.', 'success')
    } catch (error: unknown) {
      await showAlert(`Kategoriler güncellenemedi: ${(error as Error).message}`, 'error')
    }
  }

  const closeAutoCategorize = () => setAutoCatModalOpen(false)

  const dismissAutoCatSuggestion = (id: string) => {
    setAutoCatSuggestions((currentSuggestions) => currentSuggestions.filter((suggestion) => suggestion.id !== id))
  }

  const applyAutoCatSuggestions = () => {
    handleApplyAutoCat(autoCatSuggestions.map((suggestion) => ({ id: suggestion.id, suggested: suggestion.suggested })))
  }

  // ─── Form Management ────────────────────────────────────────
  const resetForm = () => {
    setForm({ name: '', category: 'Sıcak Kahveler', sale_price: '', estimated_monthly_sales: '0' })
    setRecipeItems([])
    setEditingId(null)
    setShowModal(false)
  }

  const cancelBulkEdit = () => {
    setBulkEditMode(false)
    setChangedIds(new Set())
  }

  const openCreateForm = () => {
    resetForm()
    setShowModal(true)
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
    if (!form.name.trim()) {
      await showAlert('Ürün adı zorunludur.', 'warning')
      return
    }

    const payload = {
      name: form.name.trim(),
      category: form.category.trim(),
      sale_price: parseFloat(form.sale_price || '0'),
      estimated_monthly_sales: parseInt(form.estimated_monthly_sales || '0'),
    }

    if (
      !Number.isFinite(payload.sale_price) ||
      payload.sale_price < 0 ||
      !Number.isInteger(payload.estimated_monthly_sales) ||
      payload.estimated_monthly_sales < 0
    ) {
      await showAlert('Satış fiyatı ve aylık satış tahmini geçerli olmalıdır.', 'warning')
      return
    }

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
    } else {
      details = `Fiyat: ${payload.sale_price} ₺, Kategori: ${payload.category}`
    }

    const validItems = recipeItems.filter((item) => item.item_id && item.quantity > 0)

    try {
      await saveProduct({
        id: editingId,
        name: payload.name,
        category: payload.category,
        salePrice: payload.sale_price,
        estimatedMonthlySales: payload.estimated_monthly_sales,
        ingredients: validItems,
        auditDetails: { detay: details },
      })
      const action = editingId ? 'güncellendi' : 'eklendi'
      resetForm()
      await showAlert(`${payload.name} başarıyla ${action}.`, 'success')
    } catch (error: unknown) {
      await showAlert(`Ürün kaydedilemedi: ${(error as Error).message}`, 'error')
    }
  }

  const handleEdit = async (product: Product) => {
    setForm({
      name: product.name,
      category: product.category,
      sale_price: product.sale_price.toString(),
      estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString(),
    })
    setEditingId(product.id)
    try {
      setRecipeItems(await loadProductRecipe(product.id))
      setShowModal(true)
    } catch (error: unknown) {
      setEditingId(null)
      await showAlert(`Ürün reçetesi yüklenemedi: ${(error as Error).message}`, 'error')
    }
  }

  const handleDelete = async (id: string) => {
    const productToDelete = products.find((p) => p.id === id)
    const confirmed = await showConfirm(
      `"${productToDelete?.name}" ürününü silmek istediğinize emin misiniz?`,
      'Ürünü Sil 🗑️',
    )
    if (!confirmed) return

    try {
      await removeProduct(id)
      await showAlert(`${productToDelete?.name || 'Ürün'} başarıyla silindi.`, 'success')
    } catch (error: unknown) {
      await showAlert(`Ürün silinemedi: ${(error as Error).message}`, 'error')
    }
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
      <ProductPageHeader
        bulkEditMode={bulkEditMode}
        changedCount={changedIds.size}
        bulkSaving={bulkSaving}
        autoCategorizeLoading={autoCatLoading}
        onCancelBulkEdit={cancelBulkEdit}
        onSaveBulkChanges={handleBulkSave}
        onEnterBulkEdit={enterBulkEdit}
        onAutoCategorize={handleAutoCategorize}
        onCreateProduct={openCreateForm}
      />

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        <ProductMetrics
          productCount={products.length}
          categoryCount={allCategories.length}
          totalRevenue={totalRevenue}
          averageMargin={overallAvgMargin}
          totalEstimatedContribution={totalEstContribution}
        />

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
        saving={savingProduct}
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

      <AutoCategorizeDialog
        open={autoCatModalOpen}
        suggestions={autoCatSuggestions}
        saving={autoCatSaving}
        onClose={closeAutoCategorize}
        onDismissSuggestion={dismissAutoCatSuggestion}
        onApply={applyAutoCatSuggestions}
      />
    </div>
  )
}

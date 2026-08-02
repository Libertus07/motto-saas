import { useCallback, useEffect, useMemo, useState } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import type {
  Product,
  ProductBulkRow,
  ProductBulkUpdate,
  ProductCategorySuggestion,
  ProductSort,
} from '@/features/products/types'
import {
  createAutoCategorySuggestions,
  createAutoCategoryUpdates,
  createBulkUpdatePlan,
  createProductBulkRows,
  groupVisibleProducts,
  PRODUCT_CATEGORY_ALL,
} from '@/features/products/workspace-utils'

type UpdateProducts = (
  updates: ProductBulkUpdate[],
  description: string,
  auditDetails: Record<string, unknown>,
  source: 'bulk' | 'categorize',
) => Promise<number>

type ProductCatalogWorkspaceOptions = {
  products: Product[]
  categories: string[]
  loading: boolean
  editingId: string | null
  bulkSaving: boolean
  categorizing: boolean
  updateProducts: UpdateProducts
  onCreateProduct: () => void
  onEditProduct: (product: Product) => void
  onDeleteProduct: (id: string) => void
}

export function useProductCatalogWorkspace({
  products,
  categories,
  loading,
  editingId,
  bulkSaving,
  categorizing,
  updateProducts,
  onCreateProduct,
  onEditProduct,
  onDeleteProduct,
}: ProductCatalogWorkspaceOptions) {
  const { showAlert } = useNotification()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(PRODUCT_CATEGORY_ALL)
  const [sortBy, setSortBy] = useState<ProductSort>('name')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [bulkRows, setBulkRows] = useState<Record<string, ProductBulkRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSuggestions, setAutoCatSuggestions] = useState<ProductCategorySuggestion[]>([])
  const [autoCatModalOpen, setAutoCatModalOpen] = useState(false)

  useEffect(() => {
    if (loading) return
    const timeoutId = window.setTimeout(() => {
      setOpenCategories(new Set(products.map((product) => product.category)))
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [loading, products])

  const toggleCategory = useCallback((category: string) => {
    setOpenCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const allCategoriesOpen = categories.length > 0 && categories.every((category) => openCategories.has(category))
  const toggleAllCategories = useCallback(() => {
    setOpenCategories(allCategoriesOpen ? new Set() : new Set(categories))
  }, [allCategoriesOpen, categories])

  const enterBulkEdit = useCallback(() => {
    setBulkRows(createProductBulkRows(products))
    setChangedIds(new Set())
    setBulkEditMode(true)
  }, [products])

  const cancelBulkEdit = useCallback(() => {
    setBulkEditMode(false)
    setChangedIds(new Set())
  }, [])

  const updateBulkRow = useCallback((id: string, field: keyof ProductBulkRow, value: string) => {
    setBulkRows((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setChangedIds((current) => new Set(current).add(id))
  }, [])

  const saveBulkChanges = useCallback(async () => {
    const plan = createBulkUpdatePlan(products, bulkRows, changedIds)
    if (!plan) {
      await showAlert('Toplu düzenlemede geçersiz fiyat veya satış tahmini bulundu.', 'warning')
      return
    }
    if (plan.updates.length === 0) return

    try {
      await updateProducts(
        plan.updates,
        `${plan.updates.length} adet ürünün bilgileri (fiyat/kategori) topluca güncellendi.`,
        plan.details.length > 0 ? { detay: plan.details.join(' | ') } : {},
        'bulk',
      )
      cancelBulkEdit()
      await showAlert(`${plan.updates.length} ürün başarıyla güncellendi.`, 'success')
    } catch (caughtError: unknown) {
      await showAlert(`Toplu güncelleme tamamlanamadı: ${(caughtError as Error).message}`, 'error')
    }
  }, [bulkRows, cancelBulkEdit, changedIds, products, showAlert, updateProducts])

  const autoCategorize = useCallback(async () => {
    setAutoCatLoading(true)
    try {
      const response = await fetch('/api/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materials: products.map((product) => ({ id: product.id, name: product.name, category: product.category })),
          categories,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || 'Kategori önerileri alınamadı.')
      setAutoCatSuggestions(createAutoCategorySuggestions(products, data.suggestions || []))
      setAutoCatModalOpen(true)
    } catch (caughtError: unknown) {
      await showAlert(`Kategoriler analiz edilemedi: ${(caughtError as Error).message}`, 'error')
    } finally {
      setAutoCatLoading(false)
    }
  }, [categories, products, showAlert])

  const applyAutoCategories = useCallback(async () => {
    const approved = autoCatSuggestions.map((suggestion) => ({ id: suggestion.id, suggested: suggestion.suggested }))
    const updates = createAutoCategoryUpdates(products, approved)
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
    } catch (caughtError: unknown) {
      await showAlert(`Kategoriler güncellenemedi: ${(caughtError as Error).message}`, 'error')
    }
  }, [autoCatSuggestions, products, showAlert, updateProducts])

  const closeAutoCategorize = useCallback(() => setAutoCatModalOpen(false), [])
  const dismissAutoCategory = useCallback((id: string) => {
    setAutoCatSuggestions((current) => current.filter((suggestion) => suggestion.id !== id))
  }, [])

  const groups = useMemo(
    () => groupVisibleProducts(products, categories, search, categoryFilter, sortBy),
    [categories, categoryFilter, products, search, sortBy],
  )

  return {
    header: {
      bulkEditMode,
      changedCount: changedIds.size,
      bulkSaving,
      autoCategorizeLoading: autoCatLoading,
      onCancelBulkEdit: cancelBulkEdit,
      onSaveBulkChanges: saveBulkChanges,
      onEnterBulkEdit: enterBulkEdit,
      onAutoCategorize: autoCategorize,
      onCreateProduct,
    },
    filters: {
      search,
      onSearchChange: setSearch,
      categoryFilter,
      onCategoryFilterChange: setCategoryFilter,
      products,
      categories,
      sortBy,
      onSortChange: setSortBy,
      allCategoriesOpen,
      onToggleAll: toggleAllCategories,
    },
    catalog: {
      loading,
      groups,
      openCategories,
      bulkEditMode,
      bulkRows,
      changedIds,
      editingId,
      onToggleCategory: toggleCategory,
      onBulkRowChange: updateBulkRow,
      onEdit: onEditProduct,
      onDelete: onDeleteProduct,
    },
    autoCategorize: {
      open: autoCatModalOpen,
      suggestions: autoCatSuggestions,
      saving: categorizing,
      onClose: closeAutoCategorize,
      onDismissSuggestion: dismissAutoCategory,
      onApply: applyAutoCategories,
    },
  }
}

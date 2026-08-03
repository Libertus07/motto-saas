import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { useOrganization } from '@/context/OrganizationContext'
import {
  bulkUpdateMaterials,
  deleteMaterials,
  fetchMaterialPriceHistory,
  fetchMaterialWorkspace,
  saveMaterial,
} from '@/features/materials/services/material-service'
import { materialTourSteps } from '@/features/materials/tour'
import type {
  AutoCategoryResponse,
  AutoCatSuggestion,
  EditRow,
  Material,
  MaterialFormValues,
  PriceHistory,
} from '@/features/materials/types'
import type { MaterialSort } from '@/features/materials/utils'
import {
  calculateMaterialMetrics,
  createAutoCategorySuggestions,
  createMaterialBulkPlan,
  createMaterialEditRows,
  EMPTY_MATERIAL_FORM,
  groupVisibleMaterials,
  MATERIAL_CATEGORY_ALL,
} from '@/features/materials/workspace-utils'
import { useAppTour } from '@/hooks/useAppTour'
import { createClient } from '@/lib/supabase'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
}

export function useMaterialWorkspace() {
  const { showAlert, showConfirm } = useNotification()
  const { activeOrg, loading: organizationLoading } = useOrganization()
  const supabase = useMemo(() => createClient(), [])
  const requestId = useRef(0)
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(MATERIAL_CATEGORY_ALL)
  const [sortBy, setSortBy] = useState<MaterialSort>('name')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MaterialFormValues>(EMPTY_MATERIAL_FORM)
  const [packageMultiplier, setPackageMultiplier] = useState(12)
  const [saving, setSaving] = useState(false)

  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyName, setHistoryName] = useState('')
  const [history, setHistory] = useState<PriceHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [autoCatLoading, setAutoCatLoading] = useState(false)
  const [autoCatSaving, setAutoCatSaving] = useState(false)
  const [autoCatOpen, setAutoCatOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<AutoCatSuggestion[]>([])

  const organizationId = activeOrg?.id
  useAppTour('hammaddeler', materialTourSteps, 800)

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!organizationId) {
      if (!organizationLoading) {
        setMaterials([])
        setCategories([])
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const workspace = await fetchMaterialWorkspace(supabase, organizationId)
      if (currentRequest !== requestId.current) return
      setMaterials(workspace.materials)
      setCategories(workspace.categories)
      setOpenCategories(new Set(workspace.categories))
    } catch (error: unknown) {
      if (currentRequest === requestId.current)
        await showAlert(`Hammaddeler yüklenemedi: ${errorMessage(error)}`, 'error')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [organizationId, organizationLoading, showAlert, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditingId(null)
    setForm(EMPTY_MATERIAL_FORM)
    setPackageMultiplier(12)
  }, [])

  const openCreate = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_MATERIAL_FORM)
    setPackageMultiplier(12)
    setFormOpen(true)
  }, [])

  const openEdit = useCallback((material: Material) => {
    setEditingId(material.id)
    setForm({
      name: material.name,
      category: material.category || 'Diğer',
      unit: material.unit,
      price_per_unit: String(material.price_per_unit),
      stock_quantity: String(material.stock_quantity || 0),
      critical_stock_level: String(material.critical_stock_level || 0),
    })
    setPackageMultiplier(12)
    setFormOpen(true)
  }, [])

  const submitForm = useCallback(async () => {
    if (!organizationId) return
    const price = Number(form.price_per_unit)
    const stock = Number(form.stock_quantity || 0)
    const critical = Number(form.critical_stock_level || 0)
    if (
      !form.name.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isFinite(stock) ||
      stock < 0 ||
      !Number.isFinite(critical) ||
      critical < 0
    ) {
      await showAlert('Ad, fiyat, stok ve kritik stok alanlarını geçerli değerlerle doldurun.', 'warning')
      return
    }

    setSaving(true)
    try {
      await saveMaterial(supabase, organizationId, {
        id: editingId,
        name: form.name.trim(),
        category: form.category,
        unit: form.unit,
        pricePerUnit: price,
        stockQuantity: stock,
        criticalStockLevel: critical,
        auditDetails: { fiyat: price, stok: stock, kategori: form.category },
      })
      closeForm()
      await refresh()
      await showAlert(`Hammadde başarıyla ${editingId ? 'güncellendi' : 'eklendi'}.`, 'success')
    } catch (error: unknown) {
      await showAlert(`Hammadde kaydedilemedi: ${errorMessage(error)}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [closeForm, editingId, form, organizationId, refresh, showAlert, supabase])

  const removeMaterials = useCallback(
    async (ids: string[]) => {
      if (!organizationId || ids.length === 0) return
      const selected = materials.filter((material) => ids.includes(material.id))
      const confirmed = await showConfirm(
        ids.length === materials.length
          ? 'DİKKAT: Sistemdeki tüm hammaddeler silinecek. Bu işlem geri alınamaz.'
          : `${ids.length} hammaddeyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
        ids.length === 1 ? 'Hammaddeyi Sil 🗑️' : 'Hammaddeleri Sil 🗑️',
      )
      if (!confirmed) return

      setBulkSaving(true)
      try {
        await deleteMaterials(supabase, organizationId, ids, `${ids.length} adet hammadde sistemden silindi.`, {
          silinen_hammaddeler: selected.map((material) => material.name),
        })
        setBulkEditMode(false)
        setChangedIds(new Set())
        setSelectedForDeletion(new Set())
        await refresh()
        await showAlert(`${ids.length} hammadde başarıyla silindi.`, 'success')
      } catch (error: unknown) {
        await showAlert(`Hammaddeler silinemedi: ${errorMessage(error)}`, 'error')
      } finally {
        setBulkSaving(false)
      }
    },
    [materials, organizationId, refresh, showAlert, showConfirm, supabase],
  )

  const enterBulkEdit = useCallback(() => {
    setEditRows(createMaterialEditRows(materials))
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
    setBulkEditMode(true)
    setFormOpen(false)
  }, [materials])

  const cancelBulkEdit = useCallback(() => {
    setBulkEditMode(false)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
  }, [])

  const updateEditRow = useCallback((id: string, field: keyof EditRow, value: string) => {
    setEditRows((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setChangedIds((current) => new Set(current).add(id))
  }, [])

  const saveBulkChanges = useCallback(async () => {
    if (!organizationId) return
    const plan = createMaterialBulkPlan(materials, editRows, changedIds)
    if (!plan) {
      await showAlert('Toplu düzenlemede geçersiz veya negatif bir değer bulundu.', 'warning')
      return
    }
    if (plan.updates.length === 0) return

    setBulkSaving(true)
    try {
      await bulkUpdateMaterials(
        supabase,
        organizationId,
        plan.updates,
        `${plan.updates.length} adet hammaddenin bilgileri topluca güncellendi.`,
        { detay: plan.details },
      )
      cancelBulkEdit()
      await refresh()
      await showAlert(`${plan.updates.length} hammadde başarıyla güncellendi.`, 'success')
    } catch (error: unknown) {
      await showAlert(`Toplu güncelleme tamamlanamadı: ${errorMessage(error)}`, 'error')
    } finally {
      setBulkSaving(false)
    }
  }, [cancelBulkEdit, changedIds, editRows, materials, organizationId, refresh, showAlert, supabase])

  const viewHistory = useCallback(
    async (material: Material) => {
      if (!organizationId) return
      setHistoryName(material.name)
      setHistoryOpen(true)
      setHistoryLoading(true)
      try {
        setHistory(await fetchMaterialPriceHistory(supabase, organizationId, material.id))
      } catch (error: unknown) {
        setHistory([])
        await showAlert(`Fiyat geçmişi yüklenemedi: ${errorMessage(error)}`, 'error')
      } finally {
        setHistoryLoading(false)
      }
    },
    [organizationId, showAlert, supabase],
  )

  const autoCategorize = useCallback(async () => {
    setAutoCatLoading(true)
    try {
      const response = await fetch('/api/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materials: materials.map(({ id, name, category }) => ({ id, name, category })),
          categories,
        }),
      })
      const data = (await response.json()) as AutoCategoryResponse
      if (!response.ok || data.error) throw new Error(data.error || 'Kategori önerileri alınamadı.')
      setSuggestions(createAutoCategorySuggestions(materials, data.suggestions || []))
      setAutoCatOpen(true)
    } catch (error: unknown) {
      await showAlert(`Kategoriler analiz edilemedi: ${errorMessage(error)}`, 'error')
    } finally {
      setAutoCatLoading(false)
    }
  }, [categories, materials, showAlert])

  const applyAutoCategories = useCallback(
    async (approved: { id: string; suggested: string }[]) => {
      if (!organizationId || approved.length === 0) return
      const approvedById = new Map(approved.map((item) => [item.id, item.suggested]))
      const rows = createMaterialEditRows(materials)
      const ids = new Set<string>()
      for (const material of materials) {
        const category = approvedById.get(material.id)
        if (category) {
          rows[material.id].category = category
          ids.add(material.id)
        }
      }
      const plan = createMaterialBulkPlan(materials, rows, ids)
      if (!plan || plan.updates.length === 0) return

      setAutoCatSaving(true)
      try {
        await bulkUpdateMaterials(
          supabase,
          organizationId,
          plan.updates,
          `${plan.updates.length} hammaddenin kategorisi yapay zeka ile güncellendi.`,
          { kaynak: 'ai_auto_categorize', hammaddeler: approved },
        )
        setAutoCatOpen(false)
        setSuggestions([])
        await refresh()
        await showAlert('Kategori önerileri başarıyla uygulandı.', 'success')
      } catch (error: unknown) {
        await showAlert(`Kategoriler güncellenemedi: ${errorMessage(error)}`, 'error')
      } finally {
        setAutoCatSaving(false)
      }
    },
    [materials, organizationId, refresh, showAlert, supabase],
  )

  const groups = useMemo(
    () => groupVisibleMaterials(materials, categories, search, categoryFilter, sortBy),
    [categories, categoryFilter, materials, search, sortBy],
  )
  const metrics = useMemo(() => calculateMaterialMetrics(materials), [materials])
  const visibleIds = useMemo(() => groups.flatMap((group) => group.items.map((material) => material.id)), [groups])
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((materialId) => selectedForDeletion.has(materialId))
  const allCategoriesOpen = groups.length > 0 && groups.every((group) => openCategories.has(group.category))

  const toggleCategory = useCallback((category: string) => {
    setOpenCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  return {
    header: {
      materialCount: materials.length,
      bulkEditMode,
      changedCount: changedIds.size,
      selectedCount: selectedForDeletion.size,
      allVisibleSelected,
      bulkSaving,
      autoCatLoading,
      onEnterBulkEdit: enterBulkEdit,
      onCancelBulkEdit: cancelBulkEdit,
      onSaveBulk: saveBulkChanges,
      onDeleteSelected: () => removeMaterials([...selectedForDeletion]),
      onToggleSelectAll: () =>
        setSelectedForDeletion((current) => {
          const next = new Set(current)
          if (visibleIds.every((materialId) => next.has(materialId))) {
            visibleIds.forEach((materialId) => next.delete(materialId))
          } else {
            visibleIds.forEach((materialId) => next.add(materialId))
          }
          return next
        }),
      onDeleteAll: () => removeMaterials(materials.map((material) => material.id)),
      onAutoCategorize: autoCategorize,
      onCreate: openCreate,
    },
    metrics: { materialCount: materials.length, categoryCount: categories.length, ...metrics },
    filters: {
      search,
      onSearchChange: setSearch,
      categoryFilter,
      onCategoryFilterChange: setCategoryFilter,
      sortBy,
      onSortChange: setSortBy,
      materials,
      categories,
      allCategoriesOpen,
      onToggleAll: () =>
        setOpenCategories(allCategoriesOpen ? new Set() : new Set(groups.map((group) => group.category))),
    },
    catalog: {
      loading,
      groups,
      openCategories,
      bulkEditMode,
      editRows,
      changedIds,
      selectedForDeletion,
      onToggleCategory: toggleCategory,
      onRowChange: updateEditRow,
      onToggleDeletion: (id: string) =>
        setSelectedForDeletion((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      onEdit: openEdit,
      onDelete: (id: string) => removeMaterials([id]),
      onViewHistory: viewHistory,
    },
    form: {
      open: formOpen,
      editing: Boolean(editingId),
      form,
      onFormChange: setForm,
      categories,
      packageMultiplier,
      onPackageMultiplierChange: setPackageMultiplier,
      saving,
      onClose: closeForm,
      onSubmit: submitForm,
    },
    history: {
      isOpen: historyOpen,
      onClose: () => setHistoryOpen(false),
      selectedMatName: historyName,
      priceHistory: history,
      loadingHistory: historyLoading,
    },
    autoCategorize: {
      isOpen: autoCatOpen,
      onClose: () => setAutoCatOpen(false),
      suggestions,
      onRemoveSuggestion: (index: number) =>
        setSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index)),
      onApply: applyAutoCategories,
      isSaving: autoCatSaving,
    },
  }
}

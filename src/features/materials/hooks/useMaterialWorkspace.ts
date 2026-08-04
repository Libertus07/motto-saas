import { useCallback, useEffect, useMemo, useState } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { useAppTour } from '@/hooks/useAppTour'

import { materialTourSteps } from '../tour'
import type { MaterialSort } from '../utils'
import { calculateMaterialMetrics, groupVisibleMaterials, MATERIAL_CATEGORY_ALL } from '../workspace-utils'
import { useMaterialAutoCategorization } from './useMaterialAutoCategorization'
import { useMaterialBulkActions } from './useMaterialBulkActions'
import { useMaterialData } from './useMaterialData'
import { useMaterialForm } from './useMaterialForm'
import { useMaterialHistory } from './useMaterialHistory'

export function useMaterialWorkspace() {
  const { showAlert, showConfirm } = useNotification()
  useAppTour('hammaddeler', materialTourSteps, 800)

  const handleLoadError = useCallback(
    (message: string) => showAlert(`Hammaddeler yüklenemedi: ${message}`, 'error'),
    [showAlert],
  )
  const data = useMaterialData(handleLoadError)
  const form = useMaterialForm({
    supabase: data.supabase,
    organizationId: data.organizationId,
    categories: data.categories,
    refresh: data.refresh,
    showAlert,
  })
  const bulk = useMaterialBulkActions({
    supabase: data.supabase,
    organizationId: data.organizationId,
    materials: data.materials,
    refresh: data.refresh,
    showAlert,
    showConfirm,
    onEnter: form.dismiss,
  })
  const history = useMaterialHistory({
    supabase: data.supabase,
    organizationId: data.organizationId,
    onError: (message) => showAlert(`Fiyat geçmişi yüklenemedi: ${message}`, 'error'),
  })
  const autoCategorize = useMaterialAutoCategorization({
    supabase: data.supabase,
    organizationId: data.organizationId,
    materials: data.materials,
    categories: data.categories,
    refresh: data.refresh,
    showAlert,
  })

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(MATERIAL_CATEGORY_ALL)
  const [sortBy, setSortBy] = useState<MaterialSort>('name')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setOpenCategories(new Set(data.categories)), 0)
    return () => window.clearTimeout(timeoutId)
  }, [data.categories])

  const groups = useMemo(
    () => groupVisibleMaterials(data.materials, data.categories, search, categoryFilter, sortBy),
    [categoryFilter, data.categories, data.materials, search, sortBy],
  )
  const metrics = useMemo(() => calculateMaterialMetrics(data.materials), [data.materials])
  const visibleIds = useMemo(() => groups.flatMap((group) => group.items.map((material) => material.id)), [groups])
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((materialId) => bulk.selectedForDeletion.has(materialId))
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
      materialCount: data.materials.length,
      bulkEditMode: bulk.bulkEditMode,
      changedCount: bulk.changedIds.size,
      selectedCount: bulk.selectedForDeletion.size,
      allVisibleSelected,
      bulkSaving: bulk.bulkSaving,
      autoCatLoading: autoCategorize.loading,
      onEnterBulkEdit: bulk.enter,
      onCancelBulkEdit: bulk.cancel,
      onSaveBulk: bulk.save,
      onDeleteSelected: () => bulk.remove([...bulk.selectedForDeletion]),
      onToggleSelectAll: () => bulk.toggleVisibleSelection(visibleIds),
      onDeleteAll: () => bulk.remove(data.materials.map((material) => material.id)),
      onAutoCategorize: autoCategorize.analyze,
      onCreate: form.create,
    },
    metrics: {
      materialCount: data.materials.length,
      categoryCount: data.categories.length,
      ...metrics,
    },
    filters: {
      search,
      onSearchChange: setSearch,
      categoryFilter,
      onCategoryFilterChange: setCategoryFilter,
      sortBy,
      onSortChange: setSortBy,
      materials: data.materials,
      categories: data.categories,
      allCategoriesOpen,
      onToggleAll: () =>
        setOpenCategories(allCategoriesOpen ? new Set() : new Set(groups.map((group) => group.category))),
    },
    catalog: {
      loading: data.loading,
      groups,
      openCategories,
      bulkEditMode: bulk.bulkEditMode,
      editRows: bulk.editRows,
      changedIds: bulk.changedIds,
      selectedForDeletion: bulk.selectedForDeletion,
      onToggleCategory: toggleCategory,
      onRowChange: bulk.updateRow,
      onToggleDeletion: bulk.toggleDeletion,
      onEdit: form.edit,
      onDelete: (id: string) => bulk.remove([id]),
      onViewHistory: history.view,
    },
    form: {
      open: form.open,
      editing: Boolean(form.editingId),
      form: form.form,
      onFormChange: form.setForm,
      categories: form.categories,
      packageMultiplier: form.packageMultiplier,
      onPackageMultiplierChange: form.setPackageMultiplier,
      saving: form.saving,
      onClose: form.close,
      onSubmit: form.submit,
    },
    history: {
      isOpen: history.isOpen,
      onClose: history.onClose,
      selectedMatName: history.selectedMatName,
      priceHistory: history.priceHistory,
      loadingHistory: history.loadingHistory,
    },
    autoCategorize: {
      isOpen: autoCategorize.isOpen,
      onClose: autoCategorize.close,
      suggestions: autoCategorize.suggestions,
      onRemoveSuggestion: autoCategorize.removeSuggestion,
      onApply: autoCategorize.apply,
      isSaving: autoCategorize.saving,
    },
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState } from 'react'

import { bulkUpdateMaterials, deleteMaterials } from '../services/material-service'
import type { EditRow, Material } from '../types'
import { createMaterialBulkPlan, createMaterialEditRows } from '../workspace-utils'

type ShowAlert = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => Promise<void>
type ShowConfirm = (message: string, title: string) => Promise<boolean>

export function useMaterialBulkActions({
  supabase,
  organizationId,
  materials,
  refresh,
  showAlert,
  showConfirm,
  onEnter,
}: {
  supabase: SupabaseClient
  organizationId?: string
  materials: Material[]
  refresh: () => Promise<void>
  showAlert: ShowAlert
  showConfirm: ShowConfirm
  onEnter: () => void
}) {
  const [bulkEditMode, setBulkEditMode] = useState(false)
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({})
  const [changedIds, setChangedIds] = useState<Set<string>>(new Set())
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)

  const cancel = useCallback(() => {
    setBulkEditMode(false)
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
  }, [])

  const enter = useCallback(() => {
    setEditRows(createMaterialEditRows(materials))
    setChangedIds(new Set())
    setSelectedForDeletion(new Set())
    setBulkEditMode(true)
    onEnter()
  }, [materials, onEnter])

  const updateRow = useCallback((id: string, field: keyof EditRow, value: string) => {
    setEditRows((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setChangedIds((current) => new Set(current).add(id))
  }, [])

  const save = useCallback(async () => {
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
      cancel()
      await refresh()
      await showAlert(`${plan.updates.length} hammadde başarıyla güncellendi.`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
      await showAlert(`Toplu güncelleme tamamlanamadı: ${message}`, 'error')
    } finally {
      setBulkSaving(false)
    }
  }, [cancel, changedIds, editRows, materials, organizationId, refresh, showAlert, supabase])

  const remove = useCallback(
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
        cancel()
        await refresh()
        await showAlert(`${ids.length} hammadde başarıyla silindi.`, 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
        await showAlert(`Hammaddeler silinemedi: ${message}`, 'error')
      } finally {
        setBulkSaving(false)
      }
    },
    [cancel, materials, organizationId, refresh, showAlert, showConfirm, supabase],
  )

  const toggleDeletion = useCallback((id: string) => {
    setSelectedForDeletion((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVisibleSelection = useCallback((visibleIds: string[]) => {
    setSelectedForDeletion((current) => {
      const next = new Set(current)
      if (visibleIds.every((id) => next.has(id))) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }, [])

  return {
    bulkEditMode,
    editRows,
    changedIds,
    selectedForDeletion,
    bulkSaving,
    enter,
    cancel,
    updateRow,
    save,
    remove,
    toggleDeletion,
    toggleVisibleSelection,
  }
}

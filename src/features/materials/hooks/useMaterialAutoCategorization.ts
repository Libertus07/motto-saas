import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState } from 'react'

import { bulkUpdateMaterials } from '../services/material-service'
import type { AutoCategoryResponse, AutoCatSuggestion, Material } from '../types'
import { createAutoCategorySuggestions, createMaterialBulkPlan, createMaterialEditRows } from '../workspace-utils'

type ShowAlert = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => Promise<void>

export function useMaterialAutoCategorization({
  supabase,
  organizationId,
  materials,
  categories,
  refresh,
  showAlert,
}: {
  supabase: SupabaseClient
  organizationId?: string
  materials: Material[]
  categories: string[]
  refresh: () => Promise<void>
  showAlert: ShowAlert
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<AutoCatSuggestion[]>([])

  const analyze = useCallback(async () => {
    setLoading(true)
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
      setIsOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
      await showAlert(`Kategoriler analiz edilemedi: ${message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [categories, materials, showAlert])

  const apply = useCallback(
    async (approved: { id: string; suggested: string }[]) => {
      if (!organizationId || approved.length === 0) return
      const approvedById = new Map(approved.map((item) => [item.id, item.suggested]))
      const rows = createMaterialEditRows(materials)
      const ids = new Set<string>()
      for (const material of materials) {
        const category = approvedById.get(material.id)
        if (!category) continue
        rows[material.id].category = category
        ids.add(material.id)
      }
      const plan = createMaterialBulkPlan(materials, rows, ids)
      if (!plan || plan.updates.length === 0) return

      setSaving(true)
      try {
        await bulkUpdateMaterials(
          supabase,
          organizationId,
          plan.updates,
          `${plan.updates.length} hammaddenin kategorisi yapay zeka ile güncellendi.`,
          { kaynak: 'ai_auto_categorize', hammaddeler: approved },
        )
        setIsOpen(false)
        setSuggestions([])
        await refresh()
        await showAlert('Kategori önerileri başarıyla uygulandı.', 'success')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
        await showAlert(`Kategoriler güncellenemedi: ${message}`, 'error')
      } finally {
        setSaving(false)
      }
    },
    [materials, organizationId, refresh, showAlert, supabase],
  )

  return {
    loading,
    saving,
    isOpen,
    suggestions,
    analyze,
    apply,
    close: () => setIsOpen(false),
    removeSuggestion: (index: number) =>
      setSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index)),
  }
}

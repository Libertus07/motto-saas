import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState } from 'react'

import { saveMaterial } from '../services/material-service'
import type { Material, MaterialFormValues } from '../types'
import { EMPTY_MATERIAL_FORM } from '../workspace-utils'

type ShowAlert = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => Promise<void>

export function useMaterialForm({
  supabase,
  organizationId,
  categories,
  refresh,
  showAlert,
}: {
  supabase: SupabaseClient
  organizationId?: string
  categories: string[]
  refresh: () => Promise<void>
  showAlert: ShowAlert
}) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MaterialFormValues>(EMPTY_MATERIAL_FORM)
  const [packageMultiplier, setPackageMultiplier] = useState(12)
  const [saving, setSaving] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    setEditingId(null)
    setForm(EMPTY_MATERIAL_FORM)
    setPackageMultiplier(12)
  }, [])

  const create = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_MATERIAL_FORM)
    setPackageMultiplier(12)
    setOpen(true)
  }, [])

  const edit = useCallback((material: Material) => {
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
    setOpen(true)
  }, [])

  const submit = useCallback(async () => {
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
      close()
      await refresh()
      await showAlert(`Hammadde başarıyla ${editingId ? 'güncellendi' : 'eklendi'}.`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.'
      await showAlert(`Hammadde kaydedilemedi: ${message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [close, editingId, form, organizationId, refresh, showAlert, supabase])

  return {
    open,
    editingId,
    form,
    setForm,
    categories,
    packageMultiplier,
    setPackageMultiplier,
    saving,
    close,
    create,
    edit,
    submit,
    dismiss: () => setOpen(false),
  }
}

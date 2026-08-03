import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { Material, Movement, MovementFormState, InlineFormState } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { applyStockCount, recordStockMovement } from '../services/inventory-service'

export function useInventoryData(
  showAlert: (msg: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => Promise<void>,
  showConfirm: (msg: string, title: string) => Promise<boolean>,
) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)
  const { activeOrg } = useOrganization()

  // Sayım Takip State
  const [inventoryCountDay, setInventoryCountDay] = useState<number>(1)
  const [lastCountDate, setLastCountDate] = useState<Date | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const fetchData = useCallback(async () => {
    if (!activeOrg) return
    const [{ data: mats }, { data: movs }, { data: settingsData }] = await Promise.all([
      supabase.from('materials').select('*').eq('organization_id', activeOrg.id).order('name'),
      supabase
        .from('stock_movements')
        .select('*, materials(name, unit)')
        .eq('organization_id', activeOrg.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('settings')
        .select('key, value')
        .eq('organization_id', activeOrg.id)
        .in('key', ['inventory_count_day', 'last_inventory_count_date']),
    ])
    setMaterials(mats || [])
    setMovements(movs || [])

    if (settingsData) {
      const countDay = settingsData.find((s) => s.key === 'inventory_count_day')
      if (countDay) setInventoryCountDay(parseInt(countDay.value) || 1)

      const lastDate = settingsData.find((s) => s.key === 'last_inventory_count_date')
      if (lastDate && lastDate.value) setLastCountDate(new Date(lastDate.value))
    }
    setLoading(false)
  }, [activeOrg, supabase])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(async () => {
      if (active) await fetchData()
    })
    return () => {
      active = false
    }
  }, [fetchData])

  const handleMovement = async (form: MovementFormState, onSuccess: () => void) => {
    if (!activeOrg) return
    if (!form.material_id || !form.quantity) return

    const material = materials.find((i) => i.id === form.material_id)
    if (!material) return

    const quantity = parseFloat(form.quantity)
    const currentStock = material.stock_quantity || 0
    const isOutgoing = form.movement_type === 'cikis' || form.movement_type === 'fire'

    if (!Number.isFinite(quantity) || quantity <= 0) {
      await showAlert('Lütfen 0’dan büyük geçerli bir miktar girin.', 'warning')
      return
    }

    if (isOutgoing && quantity > currentStock) {
      await showAlert(
        `${material.name} için ${quantity} ${material.unit} çıkış yapılamaz. Mevcut stok ${currentStock} ${material.unit}.`,
        'warning',
        'Yetersiz Stok ⚠️',
      )
      return
    }

    const unitPrice = form.unit_price ? parseFloat(form.unit_price) : material.price_per_unit
    try {
      await recordStockMovement(supabase, activeOrg.id, {
        materialId: form.material_id,
        movementType: form.movement_type,
        quantity,
        unitPrice,
        note: form.note || null,
      })
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Stok hareketi kaydedilirken hata oluştu.', 'error')
      return
    }

    await fetchData()
    await showAlert(`${material.name} için stok hareketi başarıyla kaydedildi.`, 'success')
    onSuccess()
  }

  const handleInlineSubmit = async (
    inlineMovementMatId: string,
    inlineMovementType: 'giris' | 'cikis',
    inlineForm: InlineFormState,
    onSuccess: () => void,
  ) => {
    if (!activeOrg) return
    if (!inlineMovementMatId || !inlineForm.quantity) return

    const material = materials.find((i) => i.id === inlineMovementMatId)
    if (!material) return

    const quantity = parseFloat(inlineForm.quantity)
    const currentStock = material.stock_quantity || 0

    if (!Number.isFinite(quantity) || quantity <= 0) {
      await showAlert('Lütfen 0’dan büyük geçerli bir miktar girin.', 'warning')
      return
    }

    if (inlineMovementType === 'cikis' && quantity > currentStock) {
      await showAlert(
        `${material.name} için ${quantity} ${material.unit} hızlı çıkış yapılamaz. Mevcut stok ${currentStock} ${material.unit}.`,
        'warning',
        'Yetersiz Stok ⚠️',
      )
      return
    }

    const unitPrice = inlineForm.unit_price ? parseFloat(inlineForm.unit_price) : material.price_per_unit
    try {
      await recordStockMovement(supabase, activeOrg.id, {
        materialId: inlineMovementMatId,
        movementType: inlineMovementType,
        quantity,
        unitPrice,
        note: inlineForm.note || (inlineMovementType === 'giris' ? 'Hızlı Giriş' : 'Hızlı Çıkış'),
      })
    } catch (error) {
      await showAlert(
        error instanceof Error ? error.message : 'Hızlı stok hareketi kaydedilirken hata oluştu.',
        'error',
      )
      return
    }

    await fetchData()
    await showAlert(`${material.name} için hızlı stok işlemi kaydedildi.`, 'success')
    onSuccess()
  }

  const handleSayim = async (sayimData: { [key: string]: string }, onSuccess: () => void) => {
    if (!activeOrg) return
    const pendingAdjustments = Object.entries(sayimData)
      .map(([materialId, quantity]) => {
        const material = materials.find((i) => i.id === materialId)
        const sayimQty = parseFloat(quantity)

        if (!material || !quantity || !Number.isFinite(sayimQty) || sayimQty < 0) {
          return null
        }

        const currentStock = material.stock_quantity || 0
        const diff = sayimQty - currentStock

        if (diff === 0) return null

        return {
          material,
          materialId,
          sayimQty,
          currentStock,
          diff,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (pendingAdjustments.length === 0) {
      await showAlert('Kaydedilecek bir sayım farkı bulunamadı.', 'info')
      return
    }

    const confirmLines = pendingAdjustments
      .slice(0, 8)
      .map((item) => `• ${item.material.name}: ${item.currentStock} → ${item.sayimQty} ${item.material.unit}`)

    if (pendingAdjustments.length > 8) {
      confirmLines.push(`• ... ve ${pendingAdjustments.length - 8} ürün daha`)
    }

    const confirmed = await showConfirm(
      `${pendingAdjustments.length} ürün için sayım düzeltmesi uygulanacak.\n\n${confirmLines.join('\n')}\n\nOnaylarsanız bu farklar "Sayım Düzeltmesi" hareketi olarak kaydedilecek.`,
      'Sayımı Onayla 📦',
    )
    if (!confirmed) return

    let updatedCount: number
    try {
      updatedCount = await applyStockCount(
        supabase,
        activeOrg.id,
        pendingAdjustments.map((item) => ({
          material_id: item.materialId,
          counted_quantity: item.sayimQty,
        })),
      )
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Sayım işlemi uygulanırken hata oluştu.', 'error')
      return
    }

    await fetchData()
    await showAlert(`Sayım tamamlandı! ${updatedCount} ürün için sayım düzeltmesi kaydedildi.`, 'success')
    onSuccess()
  }

  return {
    materials,
    movements,
    loading,
    inventoryCountDay,
    lastCountDate,
    fetchData,
    handleMovement,
    handleInlineSubmit,
    handleSayim,
  }
}

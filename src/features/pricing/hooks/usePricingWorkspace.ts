import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useNotification } from '@/components/NotificationProvider'
import { useOrganization } from '@/context/OrganizationContext'
import { getPricingMetrics } from '../pricing-metrics'
import { savePricingCalculations } from '../services/pricing-service'
import { usePricingCalculator } from './usePricingCalculator'
import { usePricingData } from './usePricingData'

export type PricingTab = 'sales' | 'results' | 'reports'

export function usePricingWorkspace() {
  const [activeTab, setActiveTab] = useState<PricingTab>('sales')
  const [saving, setSaving] = useState(false)
  const { showAlert } = useNotification()
  const { activeOrg } = useOrganization()
  const data = usePricingData()
  const calculator = usePricingCalculator(data.products, data.expenses, data.realSalesMeta, data.settings)
  const metrics = useMemo(
    () =>
      getPricingMetrics({
        products: data.products,
        productSales: calculator.productSales,
        calculations: calculator.calculations,
        expenses: data.expenses,
        realSalesMeta: data.realSalesMeta,
      }),
    [calculator.calculations, calculator.productSales, data.expenses, data.products, data.realSalesMeta],
  )

  const saveCosts = async () => {
    if (!activeOrg?.id) {
      await showAlert('Fiyatları kaydetmek için aktif bir organizasyon gereklidir.', 'warning')
      return
    }
    if (calculator.calculations.length === 0) {
      await showAlert('Kaydedilecek ürün maliyeti bulunamadı.', 'warning')
      return
    }

    setSaving(true)
    try {
      const updates = calculator.calculations.map((calculation) => ({
        id: calculation.product.id,
        total_cost: calculation.totalCost,
      }))
      await savePricingCalculations(createClient(), activeOrg.id, updates, data.settings.targetMargin)

      const costsByProductId = new Map(updates.map((update) => [update.id, update.total_cost]))
      data.setProducts((products) =>
        products.map((product) => {
          const calculatedCost = costsByProductId.get(product.id)
          return calculatedCost === undefined ? product : { ...product, calculated_cost: calculatedCost }
        }),
      )
      await showAlert('Birim maliyetler ürün kartlarına güvenli biçimde kaydedildi.', 'success')
    } catch (error: unknown) {
      console.error('Fiyat motoru kaydetme hatası:', error)
      await showAlert('Kaydetme işlemi başarısız oldu. Mevcut veriler değiştirilmedi.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return { activeTab, setActiveTab, saving, saveCosts, data, calculator, metrics }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, Expense, RealSalesMeta, PricingSettings } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { DEFAULT_PRICING_SETTINGS, fetchPricingWorkspace } from '../services/pricing-service'

export function usePricingData() {
  const [products, setProducts] = useState<Product[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [realSalesMeta, setRealSalesMeta] = useState<RealSalesMeta | null>(null)
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_PRICING_SETTINGS)

  const { activeOrg } = useOrganization()
  const organizationId = activeOrg?.id
  const supabase = useMemo(() => createClient(), [])
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!organizationId) {
      setProducts([])
      setExpenses([])
      setRealSalesMeta(null)
      setSettings(DEFAULT_PRICING_SETTINGS)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const workspace = await fetchPricingWorkspace(supabase, organizationId)
      if (requestId !== requestIdRef.current) return
      setProducts(workspace.products)
      setExpenses(workspace.expenses)
      setRealSalesMeta(workspace.realSalesMeta)
      setSettings(workspace.settings)
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) return
      setError(
        `Fiyat motoru verileri yüklenemedi: ${fetchError instanceof Error ? fetchError.message : 'Bilinmeyen hata'}`,
      )
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [organizationId, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchData(), 0)
    return () => {
      window.clearTimeout(timeoutId)
      requestIdRef.current += 1
    }
  }, [fetchData])

  return {
    products,
    setProducts,
    expenses,
    loading,
    error,
    realSalesMeta,
    settings,
    setSettings,
    refetch: fetchData,
  }
}

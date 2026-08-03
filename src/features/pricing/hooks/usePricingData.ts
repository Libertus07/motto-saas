import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, Expense, RealSalesMeta, PricingSettings } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { buildPricingProducts } from '../services/pricing-service'

const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  targetMargin: 60,
  taxRate: 10,
}

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

    const results = await Promise.all([
      supabase
        .from('products')
        .select('id, name, category, sale_price, estimated_monthly_sales')
        .eq('organization_id', organizationId)
        .order('name'),
      supabase.from('expenses').select('amount, period, category, expense_date').eq('organization_id', organizationId),
      supabase.from('sales').select('product_id, quantity, sale_date').eq('organization_id', organizationId),
      supabase.from('settings').select('key, value').eq('organization_id', organizationId),
      supabase.from('materials').select('id, price_per_unit').eq('organization_id', organizationId),
      supabase.from('sub_recipes').select('id, yield_quantity, wastage_percent').eq('organization_id', organizationId),
      supabase
        .from('sub_recipe_ingredients')
        .select('sub_recipe_id, material_id, quantity')
        .eq('organization_id', organizationId),
      supabase
        .from('product_ingredients')
        .select('product_id, material_id, sub_recipe_id, quantity')
        .eq('organization_id', organizationId),
    ])

    if (requestId !== requestIdRef.current) return

    const queryError = results.find((result) => result.error)?.error
    if (queryError) {
      setError(`Fiyat motoru verileri yüklenemedi: ${queryError.message}`)
      setLoading(false)
      return
    }

    const [
      productsResult,
      expensesResult,
      salesResult,
      settingsResult,
      materialsResult,
      recipesResult,
      recipeIngredientsResult,
      productIngredientsResult,
    ] = results
    const productRows = productsResult.data ?? []
    const expenseRows = expensesResult.data ?? []
    const salesRows = salesResult.data ?? []
    const settingsRows = settingsResult.data ?? []
    const materialRows = materialsResult.data ?? []
    const recipeRows = recipesResult.data ?? []
    const recipeIngredientRows = recipeIngredientsResult.data ?? []
    const productIngredientRows = productIngredientsResult.data ?? []

    const targetMargin = Number(settingsRows.find((row) => row.key === 'target_margin')?.value)
    const taxRate = Number(settingsRows.find((row) => row.key === 'default_vat')?.value)
    setSettings({
      targetMargin: Number.isFinite(targetMargin) ? targetMargin : DEFAULT_PRICING_SETTINGS.targetMargin,
      taxRate: Number.isFinite(taxRate) ? taxRate : DEFAULT_PRICING_SETTINGS.taxRate,
    })

    const uniqueDays = new Set(salesRows.map((sale) => sale.sale_date)).size
    const salesByProduct: Record<string, number> = {}
    for (const sale of salesRows) {
      salesByProduct[sale.product_id] = (salesByProduct[sale.product_id] ?? 0) + Number(sale.quantity)
    }
    setRealSalesMeta({ activeDays: Math.max(1, uniqueDays), salesByProduct })

    const productsWithCost = buildPricingProducts({
      products: productRows,
      materials: materialRows,
      recipes: recipeRows,
      recipeIngredients: recipeIngredientRows,
      productIngredients: productIngredientRows,
    })

    setProducts(productsWithCost)
    setExpenses(expenseRows)
    setLoading(false)
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

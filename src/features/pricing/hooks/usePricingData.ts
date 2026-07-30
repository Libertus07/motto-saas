import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Product, Expense, RealSalesMeta, PricingSettings } from '../types'
import { useOrganization } from '@/context/OrganizationContext'

export function usePricingData() {
  const [products, setProducts] = useState<Product[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [realSalesMeta, setRealSalesMeta] = useState<RealSalesMeta | null>(null)
  const [settings, setSettings] = useState<PricingSettings>({
    targetMargin: 60,
    taxRate: 10
  })

  const { activeOrg } = useOrganization()
  const supabase = createClient()

  const fetchData = async () => {
    if (!activeOrg) return;
    setLoading(true)
    const [{ data: prods }, { data: exps }, { data: salesData }, { data: settingsData }] = await Promise.all([
      supabase.from('products').select('*').eq('organization_id', activeOrg.id).order('name'),
      supabase.from('expenses').select('amount, period, category, expense_date').eq('organization_id', activeOrg.id),
      supabase.from('sales').select('product_id, quantity, sale_date').eq('organization_id', activeOrg.id),
      supabase.from('settings').select('*').eq('organization_id', activeOrg.id)
    ])

    if (settingsData) {
      const marginSetting = settingsData.find(s => s.key === 'target_margin')?.value
      if (marginSetting) {
        setSettings(prev => ({ ...prev, targetMargin: Number(marginSetting) }))
      }
    }
    
    if (salesData) {
      const uniqueDays = new Set(salesData.map(s => s.sale_date)).size
      const activeDays = uniqueDays > 0 ? uniqueDays : 1
      const salesByProduct: Record<string, number> = {}
      salesData.forEach(s => {
        if (!salesByProduct[s.product_id]) salesByProduct[s.product_id] = 0
        salesByProduct[s.product_id] += s.quantity
      })
      setRealSalesMeta({ activeDays, salesByProduct })
    }

    const { data: mats } = await supabase.from('materials').select('*').eq('organization_id', activeOrg.id)
    const { data: s_recipes } = await supabase.from('sub_recipes').select('*').eq('organization_id', activeOrg.id)
    const { data: s_recipe_ings } = await supabase.from('sub_recipe_ingredients').select('*').eq('organization_id', activeOrg.id)
    const { data: prod_ings } = await supabase.from('product_ingredients').select('*').eq('organization_id', activeOrg.id)

    const processedSubRecipes = (s_recipes || []).map(r => {
      const myIngs = (s_recipe_ings || []).filter(i => i.sub_recipe_id === r.id)
      let totalCost = 0
      myIngs.forEach(ing => {
        const mat = (mats || []).find(m => m.id === ing.material_id)
        if (mat) totalCost += mat.price_per_unit * ing.quantity
      })
      const finalCostWithWastage = totalCost * (1 + r.wastage_percent / 100)
      const costPerYield = r.yield_quantity > 0 ? finalCostWithWastage / r.yield_quantity : 0
      return { ...r, cost_per_yield: costPerYield }
    })

    const productsWithCost = (prods || []).map(p => {
      const myIngs = (prod_ings || []).filter(i => i.product_id === p.id)
      let cost = 0
      myIngs.forEach(ing => {
        if (ing.material_id) {
          const mat = (mats || []).find(m => m.id === ing.material_id)
          if (mat) cost += mat.price_per_unit * ing.quantity
        } else if (ing.sub_recipe_id) {
          const sr = processedSubRecipes.find(s => s.id === ing.sub_recipe_id)
          if (sr && sr.cost_per_yield) cost += sr.cost_per_yield * ing.quantity
        }
      })
      return { ...p, calculated_cost: cost }
    })

    setProducts(productsWithCost)
    setExpenses(exps || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id])

  return {
    products,
    setProducts,
    expenses,
    loading,
    realSalesMeta,
    settings,
    setSettings,
    refetch: fetchData
  }
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useAppTour } from '@/hooks/useAppTour'
import { formatCurrency } from '@/lib/format'
import { useNotification } from '@/components/NotificationProvider'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts'

type Product = {
  id: string
  name: string
  category: string
  sale_price: number
  estimated_monthly_sales: number
  calculated_cost?: number
}

type Expense = {
  amount: number
  period: string
  category: string
  expense_date?: string
}

type ProductSales = {
  [key: string]: {
    dailySales: number
    isRealData?: boolean
  }
}

type Calculation = {
  product: Product
  rawCost: number
  revenueShare: number
  expenseShare: number
  totalCost: number
  suggestedPrice: number
  currentMargin: number
  dailyRevenue: number
  dailyProfit: number
}

export default function FiyatMotoru() {
  const [products, setProducts] = useState<Product[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calculations, setCalculations] = useState<Calculation[]>([])
  const [productSales, setProductSales] = useState<ProductSales>({})
  const [settings, setSettings] = useState({
    targetMargin: 60,
    taxRate: 10
  })
  const [activeTab, setActiveTab] = useState<'sales' | 'results' | 'reports'>('sales')
  const [targetMargin, setTargetMargin] = useState(35)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')
  const [analysisFilter, setAnalysisFilter] = useState<'tumu' | 'artirilmali' | 'ideal' | 'indirim'>(
    'tumu'
  )

  const supabase = createClient()
  const router = useRouter()
  const { showAlert } = useNotification()

  useEffect(() => {
    fetchData()
  }, [])

  const [realSalesMeta, setRealSalesMeta] = useState<{
    activeDays: number
    salesByProduct: Record<string, number>
  } | null>(null)

  useEffect(() => {
    if (products.length > 0) {
      const initial: ProductSales = {}
      products.forEach(p => {
        if (!productSales[p.id]) {
          if (realSalesMeta && realSalesMeta.salesByProduct[p.id] !== undefined) {
            const realDaily = Math.round(realSalesMeta.salesByProduct[p.id] / realSalesMeta.activeDays)
            initial[p.id] = { dailySales: realDaily, isRealData: true }
          } else {
            const daily = p.estimated_monthly_sales ? Math.round(p.estimated_monthly_sales / 30) : 0
            initial[p.id] = { dailySales: daily, isRealData: false }
          }
        }
      })
      if (Object.keys(initial).length > 0) {
        setProductSales(prev => ({ ...initial, ...prev }))
      }
    }
  }, [products, realSalesMeta])

  useEffect(() => {
    if (products.length > 0) calculate()
  }, [products, expenses, productSales, settings])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: prods }, { data: exps }, { data: salesData }, { data: settingsData }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('expenses').select('amount, period, category, expense_date'),
      supabase.from('sales').select('product_id, quantity, sale_date'),
      supabase.from('settings').select('*')
    ])

    if (settingsData) {
      const marginSetting = settingsData.find(s => s.key === 'target_margin')?.value
      if (marginSetting) setTargetMargin(Number(marginSetting))
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

    const { data: mats } = await supabase.from('materials').select('*')
    const { data: s_recipes } = await supabase.from('sub_recipes').select('*')
    const { data: s_recipe_ings } = await supabase.from('sub_recipe_ingredients').select('*')
    const { data: prod_ings } = await supabase.from('product_ingredients').select('*')

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

  const saveCalculatedCosts = async () => {
    setSaving(true)
    try {
      const { data: dbProducts } = await supabase.from('products').select('id, calculated_cost')
      const updates = products.filter(
        p => p.calculated_cost !== (dbProducts?.find(db => db.id === p.id)?.calculated_cost || 0)
      )

      if (updates.length > 0) {
        await Promise.all(
          updates.map(p =>
            supabase.from('products').update({ calculated_cost: p.calculated_cost }).eq('id', p.id)
          )
        )
        logActivity('Fiyat Motoru', 'GUNCELLEME', `${updates.length} ürünün hesaplanan maliyeti güncellendi.`)
        showAlert(`${updates.length} ürünün maliyeti veritabanına kaydedildi!`, 'success')
      } else {
        showAlert('Tüm maliyetler zaten güncel.', 'info')
      }
    } catch (error) {
      console.error(error)
      showAlert('Maliyetler kaydedilirken bir hata oluştu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const calculate = () => {
    const fixedMonthlyExpenses = expenses.reduce((t, e) => {
      if (e.period === 'daily' || e.period === 'one_time') return t
      return t + (e.period === 'yearly' ? e.amount / 12 : e.amount)
    }, 0)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentDailyExpensesTotal = expenses.reduce((t, e) => {
      if (e.period === 'daily' || e.period === 'one_time') {
        const expDate = e.expense_date ? new Date(e.expense_date) : null
        if (!expDate || expDate >= thirtyDaysAgo) {
          return t + Number(e.amount)
        }
      }
      return t
    }, 0)

    const dailyFixed = fixedMonthlyExpenses / 30
    const activeExpenseDays = realSalesMeta && realSalesMeta.activeDays > 0 ? realSalesMeta.activeDays : 30
    const dailyVariable = recentDailyExpensesTotal / activeExpenseDays

    const dailyExpenses = dailyFixed + dailyVariable

    const totalDailyRevenue = products.reduce((t, p) => {
      const sales = productSales[p.id]?.dailySales || 0
      return t + (p.sale_price || 0) * sales
    }, 0)

    const calcs = products.map(product => {
      const sales = productSales[product.id]?.dailySales || 0
      const sale_price = product.sale_price || 0
      const dailyRevenue = sale_price * sales
      const rawCost = product.calculated_cost || 0

      const revenueShare =
        totalDailyRevenue > 0 ? dailyRevenue / totalDailyRevenue : 1 / products.length

      const totalExpenseForProduct = dailyExpenses * revenueShare
      const expenseShare = sales > 0 ? totalExpenseForProduct / sales : totalExpenseForProduct

      const totalCost = rawCost + expenseShare
      const taxRate = settings.taxRate / 100
      const marginRate = settings.targetMargin / 100

      const preTax = totalCost / (1 - marginRate)
      const suggestedPrice = preTax * (1 + taxRate)

      const priceExTax = sale_price / (1 + taxRate)
      const currentMargin = priceExTax > 0 ? ((priceExTax - totalCost) / priceExTax) * 100 : 0

      const dailyProfit = sales > 0 ? (priceExTax - totalCost) * sales : 0

      return {
        product,
        rawCost,
        revenueShare: revenueShare * 100,
        expenseShare,
        totalCost,
        suggestedPrice,
        currentMargin,
        dailyRevenue,
        dailyProfit
      }
    })

    setCalculations(calcs)
  }

  const updateSales = (productId: string, field: 'dailySales', value: number) => {
    setProductSales(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: Math.max(0, value), isRealData: false }
    }))
  }

  const adjustSalesByDelta = (productId: string, delta: number) => {
    const current = productSales[productId]?.dailySales || 0
    updateSales(productId, 'dailySales', current + delta)
  }

  const totalDailyRevenue = calculations.reduce((t, c) => t + c.dailyRevenue, 0)
  const totalDailyProfit = calculations.reduce((t, c) => t + c.dailyProfit, 0)
  const monthlyExpenses = expenses.reduce(
    (t, e) => t + (e.period === 'yearly' ? e.amount / 12 : e.amount),
    0
  )
  const dailyExpenses = monthlyExpenses / 30

  // Chart data
  const chartData = calculations
    .map(c => ({
      name: c.product.name,
      sales: productSales[c.product.id]?.dailySales || 0,
      dailyProfit: Number(c.dailyProfit.toFixed(0)),
      currentMargin: Number(c.currentMargin.toFixed(1))
    }))
    .sort((a, b) => b.dailyProfit - a.dailyProfit)

  const totalRawCost = calculations.reduce((t, c) => {
    const sales = productSales[c.product.id]?.dailySales || 0
    return t + c.rawCost * sales
  }, 0)

  const pieData = [
    { name: 'Hammadde (COGS)', value: Number(totalRawCost.toFixed(0)), color: '#f59e0b' },
    { name: 'Genel Giderler', value: Number(dailyExpenses.toFixed(0)), color: '#ef4444' },
    { name: 'Net Kâr', value: totalDailyProfit > 0 ? Number(totalDailyProfit.toFixed(0)) : 0, color: '#10b981' }
  ].filter(d => d.value > 0)

  const getMarginColor = (margin: number) => {
    if (margin >= targetMargin + 20) return 'text-emerald-400 font-bold'
    if (margin >= targetMargin) return 'text-amber-400 font-bold'
    return 'text-rose-400 font-bold'
  }

  const getPriceDiff = (current: number, suggested: number) => {
    const diff = current - suggested
    if (Math.abs(diff) < 2) return null
    return diff
  }

  // Categories list
  const categoriesList = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Diğer'))
    return ['Tümü', ...Array.from(cats)]
  }, [products])

  const filteredProducts = useMemo(() => {
    let list = [...products]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
    }
    if (selectedCategory !== 'Tümü') {
      list = list.filter(p => (p.category || 'Diğer') === selectedCategory)
    }
    return list
  }, [products, search, selectedCategory])

  // Pricing Analysis Counts & Filtered Calculations
  const analysisStats = useMemo(() => {
    let ideal = 0
    let artirilmali = 0
    let indirim = 0

    calculations.forEach(c => {
      const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
      if (diff === null) ideal++
      else if (diff < 0) artirilmali++
      else indirim++
    })

    return { ideal, artirilmali, indirim }
  }, [calculations])

  const filteredCalculations = useMemo(() => {
    let list = [...calculations]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        c => c.product.name.toLowerCase().includes(q) || (c.product.category || '').toLowerCase().includes(q)
      )
    }

    if (analysisFilter === 'artirilmali') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff !== null && diff < 0
      })
    } else if (analysisFilter === 'ideal') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff === null
      })
    } else if (analysisFilter === 'indirim') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff !== null && diff > 0
      })
    }

    return list
  }, [calculations, search, analysisFilter])

  useAppTour(
    'fiyat_motoru',
    [
      {
        element: '#tour-fm-params',
        popover: {
          title: 'Hesaplama Parametreleri ⚙️',
          description: 'Kar marjı ve vergi oranlarınıza göre sistem tüm matematiksel hesaplamaları otomatik yapacaktır.',
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: '#tour-fm-tabs',
        popover: {
          title: 'Veri Girişi & Sonuçlar 📊',
          description: 'Önce günlük satış tahminlerinizi (ya da gerçek Z-Raporunu) girin, ardından "Fiyat Analizi" veya "Görsel Raporlar" sekmesinden sonuçları inceleyin.',
          side: 'top',
          align: 'center'
        }
      },
      {
        element: '#tour-fm-save',
        popover: {
          title: 'Maliyetleri Kaydedin 💾',
          description: 'Bulunan en doğru birim maliyetlerini (Hammadde + Gider) sisteme kaydetmek için son olarak buraya tıklamanız yeterli.',
          side: 'bottom',
          align: 'end'
        }
      }
    ],
    800
  )

  const tabs = [
    { key: 'sales', label: '1. Satış Adetleri Gir', icon: '📝' },
    { key: 'results', label: '2. Fiyat Analizi', icon: '⚖️' },
    { key: 'reports', label: '3. Görsel Raporlar', icon: '📊' }
  ]

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              🧠
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Fiyat Motoru</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Ciro Ağırlıklı Maliyet Algoritması
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Hammadde + Gider payı dağıtarak ideal satış fiyatı ve net kar marjı hesaplama.
              </p>
            </div>
          </div>

          <button
            id="tour-fm-save"
            onClick={saveCalculatedCosts}
            disabled={saving || loading}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <span>💾</span>
                <span>Maliyetleri DB'ye Kaydet</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE KPI METRIC CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Hesaplanan Ürün</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                🧠
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{products.length} Ürün</div>
            <div className="text-stone-400 text-[11px] mt-1">Sistemdeki Aktif Menü</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Günlük Ciro</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                💰
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">
              {formatCurrency(totalDailyRevenue)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Tahmini / Z-Raporu Cirosu</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Günlük Toplam Gider</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-base">
                🔴
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-400">{formatCurrency(dailyExpenses)}</div>
            <div className="text-stone-400 text-[11px] mt-1">Sabit & Değişken Gider Yükü</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Günlük Net Kâr</span>
              <span
                className={`p-2 rounded-xl text-base ${
                  totalDailyProfit > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                🟢
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black ${
                totalDailyProfit > 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatCurrency(totalDailyProfit)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">
              Aylık Tahmini: <strong className="text-white">{formatCurrency(totalDailyProfit * 30)}</strong>
            </div>
          </div>
        </div>

        {/* ──────────────── CALCULATION PARAMETERS CARD ──────────────── */}
        <div
          id="tour-fm-params"
          className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            <h3 className="font-extrabold text-amber-400 text-sm sm:text-base">Hesaplama Parametreleri</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-stone-300 text-xs font-semibold mb-1 block">Hedef Kâr Marjı (%)</label>
              <input
                type="number"
                value={settings.targetMargin}
                onChange={e => setSettings({ ...settings, targetMargin: parseFloat(e.target.value) || 0 })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-amber-400 font-bold text-sm focus:outline-none focus:border-amber-500/50"
              />
              <p className="text-stone-500 text-[11px] mt-1">Kafe & Restoran sektörü ideal hedefi: %55-65</p>
            </div>

            <div>
              <label className="text-stone-300 text-xs font-semibold mb-1 block font-semibold">KDV Oranı (%)</label>
              <input
                type="number"
                value={settings.taxRate}
                onChange={e => setSettings({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>
          </div>
        </div>

        {/* ──────────────── TAB NAVIGATION BAR ──────────────── */}
        <div
          id="tour-fm-tabs"
          className="flex items-center gap-2 overflow-x-auto pb-1 bg-stone-900/60 p-2 rounded-2xl border border-stone-800/80 backdrop-blur-md scrollbar-none"
        >
          {tabs.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                    : 'bg-stone-950/60 text-stone-400 hover:text-white hover:bg-stone-800/60 border border-stone-800/60'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ──────────────── TAB CONTENTS ──────────────── */}
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">🧠</div>
            <p className="text-sm font-medium">Fiyat Motoru Verileri Hesaplanıyor...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-500 backdrop-blur-md">
            <div className="text-5xl mb-3">🧠</div>
            <h3 className="text-lg font-bold text-stone-300 mb-1">Hesaplanacak Ürün Bulunamadı</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Fiyat Motorunun çalışabilmesi için önce Menü (Ürünler) sayfasından ürün eklemeniz gerekmektedir.
            </p>
          </div>
        ) : activeTab === 'sales' ? (
          /* ──────────────── TAB 1: SATIŞ ADETLERİ GİRİŞİ ──────────────── */
          <div className="space-y-4">
            {/* Informational Banner Card */}
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                  📝
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-sm sm:text-base">Günlük Satış Tahminleri & Z-Raporu</h4>
                  <p className="text-stone-400 text-xs mt-0.5">
                    Adetleri değiştirdiğinizde, ciro ağırlıklı gider payı dağıtımı ve fiyat önerileri otomatik yenilenir.
                  </p>
                </div>
              </div>

              {realSalesMeta && realSalesMeta.activeDays > 0 && (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold whitespace-nowrap self-start md:self-auto">
                  ✓ {realSalesMeta.activeDays} Günlük Z-Raporu Otomatik Aktif
                </span>
              )}
            </div>

            {/* Search and Category Filter Bar */}
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Ürün adı ile arayın..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      selectedCategory === cat
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Products Table & Cards */}
            <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5">Ürün Adı</th>
                      <th className="px-4 py-3.5">Kategori</th>
                      <th className="px-4 py-3.5 text-right">Satış Fiyatı (₺)</th>
                      <th className="px-4 py-3.5 text-center w-56">Günlük Satış Adedi</th>
                      <th className="px-4 py-3.5 text-right">Ciro Payı (%)</th>
                      <th className="px-5 py-3.5 text-right">Günlük Ciro (₺)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                    {filteredProducts.map(product => {
                      const salesData = productSales[product.id]
                      const sales = salesData?.dailySales || 0
                      const isReal = salesData?.isRealData
                      const productRev = (product.sale_price || 0) * sales
                      const revenuePercent = totalDailyRevenue > 0 ? (productRev / totalDailyRevenue) * 100 : 0

                      return (
                        <tr key={product.id} className="hover:bg-stone-800/30 transition-colors">
                          <td className="px-5 py-3.5 font-bold text-stone-100 flex items-center gap-2">
                            <span>{product.name}</span>
                            {isReal ? (
                              <span
                                className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold"
                                title="Gerçek Z-Raporu Verisi"
                              >
                                ✓ Z-Raporu
                              </span>
                            ) : (
                              <span
                                className="text-[10px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full border border-stone-700 font-semibold"
                                title="Tahmini/Manuel Veri"
                              >
                                ~ Tahmin
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-stone-400 font-medium">{product.category}</td>
                          <td className="px-4 py-3.5 text-right font-extrabold text-amber-400">
                            ₺{product.sale_price || 0}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => adjustSalesByDelta(product.id, -5)}
                                className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                                title="-5 Adet"
                              >
                                -5
                              </button>
                              <button
                                onClick={() => adjustSalesByDelta(product.id, -1)}
                                className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                                title="-1 Adet"
                              >
                                -1
                              </button>
                              <input
                                type="number"
                                value={sales || ''}
                                onChange={e =>
                                  updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)
                                }
                                className={`w-16 bg-stone-950 border ${
                                  isReal ? 'border-emerald-500/50' : 'border-stone-700'
                                } rounded-lg px-2 py-1 text-white text-center text-xs font-bold focus:outline-none focus:border-amber-500`}
                                placeholder="0"
                              />
                              <button
                                onClick={() => adjustSalesByDelta(product.id, 1)}
                                className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                                title="+1 Adet"
                              >
                                +1
                              </button>
                              <button
                                onClick={() => adjustSalesByDelta(product.id, 5)}
                                className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                                title="+5 Adet"
                              >
                                +5
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-stone-400">
                            <div className="flex items-center justify-end gap-2">
                              <span>%{revenuePercent.toFixed(1)}</span>
                              <div className="w-12 bg-stone-950 h-1.5 rounded-full overflow-hidden border border-stone-800">
                                <div
                                  className="bg-amber-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, revenuePercent)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right font-extrabold text-stone-100">
                            {formatCurrency(productRev)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-950/80 border-t border-stone-800 text-xs font-bold">
                      <td colSpan={3} className="px-5 py-3.5 text-stone-300">
                        Toplam
                      </td>
                      <td className="px-4 py-3.5 text-center font-black text-white">
                        {Object.values(productSales).reduce((t, s) => t + (s.dailySales || 0), 0)} adet
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-stone-400">%100</td>
                      <td className="px-5 py-3.5 text-right font-black text-amber-400 text-sm">
                        {formatCurrency(totalDailyRevenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden divide-y divide-stone-800/60">
                {filteredProducts.map(product => {
                  const salesData = productSales[product.id]
                  const sales = salesData?.dailySales || 0
                  const isReal = salesData?.isRealData

                  return (
                    <div key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white text-sm flex items-center gap-2">
                          <span>{product.name}</span>
                          {isReal ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                              ✓ Real
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-semibold">
                              ~ Tahmin
                            </span>
                          )}
                        </h4>
                        <span className="text-amber-400 font-extrabold text-sm">
                          ₺{product.sale_price || 0}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                        <span className="text-stone-400 font-medium">Günlük Adet:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => adjustSalesByDelta(product.id, -1)}
                            className="w-7 h-7 bg-stone-800 text-white rounded-lg font-bold border border-stone-700 flex items-center justify-center active:scale-95"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={sales || ''}
                            onChange={e =>
                              updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)
                            }
                            className="w-16 bg-stone-900 border border-stone-700 rounded-lg px-2 py-1 text-white font-bold text-center text-xs"
                          />
                          <button
                            onClick={() => adjustSalesByDelta(product.id, 1)}
                            className="w-7 h-7 bg-stone-800 text-white rounded-lg font-bold border border-stone-700 flex items-center justify-center active:scale-95"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : activeTab === 'results' ? (
          /* ──────────────── TAB 2: FİYAT ANALİZİ ──────────────── */
          <div className="space-y-4">
            {/* Analysis Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div
                onClick={() => setAnalysisFilter('ideal')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
                  analysisFilter === 'ideal'
                    ? 'bg-emerald-500/20 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                    : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-emerald-400 text-xs font-bold uppercase">✓ İdeal Fiyatlananlar</span>
                  <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">🟢</span>
                </div>
                <div className="text-2xl font-black text-emerald-400">{analysisStats.ideal} Ürün</div>
                <p className="text-stone-400 text-[11px] mt-0.5">Hedef marjı yakalayan uygun fiyatlar</p>
              </div>

              <div
                onClick={() => setAnalysisFilter('artirilmali')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
                  analysisFilter === 'artirilmali'
                    ? 'bg-rose-500/20 border-rose-500/40 shadow-lg shadow-rose-500/10'
                    : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-rose-400 text-xs font-bold uppercase">🚨 Fiyat Artırılmalı</span>
                  <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs">▲</span>
                </div>
                <div className="text-2xl font-black text-rose-400">{analysisStats.artirilmali} Ürün</div>
                <p className="text-stone-400 text-[11px] mt-0.5">Düşük marjlı veya maliyet altı kalanlar</p>
              </div>

              <div
                onClick={() => setAnalysisFilter('indirim')}
                className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
                  analysisFilter === 'indirim'
                    ? 'bg-amber-500/20 border-amber-500/40 shadow-lg shadow-amber-500/10'
                    : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-amber-400 text-xs font-bold uppercase">🟡 İndirim Yapılabilir</span>
                  <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs">▼</span>
                </div>
                <div className="text-2xl font-black text-amber-400">{analysisStats.indirim} Ürün</div>
                <p className="text-stone-400 text-[11px] mt-0.5">Piyasa marjının üstünde yüksek fiyatlılar</p>
              </div>
            </div>

            {/* Search and Analysis Filter Bar */}
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Fiyat analizinde ürün ara..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => setAnalysisFilter('tumu')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    analysisFilter === 'tumu'
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                      : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  Tümü ({calculations.length})
                </button>
                <button
                  onClick={() => setAnalysisFilter('artirilmali')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    analysisFilter === 'artirilmali'
                      ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                      : 'bg-stone-950 text-rose-400/80 hover:text-rose-400 border border-stone-800'
                  }`}
                >
                  🚨 Fiyat Artırılmalı ({analysisStats.artirilmali})
                </button>
                <button
                  onClick={() => setAnalysisFilter('ideal')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    analysisFilter === 'ideal'
                      ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                      : 'bg-stone-950 text-emerald-400/80 hover:text-emerald-400 border border-stone-800'
                  }`}
                >
                  ✓ İdeal ({analysisStats.ideal})
                </button>
              </div>
            </div>

            {/* Analysis Table & Cards */}
            <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5">Ürün Adı</th>
                      <th className="px-4 py-3.5 text-right">Ham Maliyet</th>
                      <th className="px-4 py-3.5 text-right">Gider Payı</th>
                      <th className="px-4 py-3.5 text-right">Toplam Maliyet</th>
                      <th className="px-4 py-3.5 text-right">Mevcut Fiyat</th>
                      <th className="px-4 py-3.5 text-right">Önerilen Fiyat</th>
                      <th className="px-4 py-3.5 text-right">Mevcut Marj</th>
                      <th className="px-5 py-3.5 text-right">Öneri Durumu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                    {filteredCalculations
                      .sort((a, b) => a.currentMargin - b.currentMargin)
                      .map(({ product, rawCost, expenseShare, totalCost, suggestedPrice, currentMargin }) => {
                        const diff = getPriceDiff(product.sale_price || 0, suggestedPrice)
                        return (
                          <tr key={product.id} className="hover:bg-stone-800/30 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-stone-100">{product.name}</td>
                            <td className="px-4 py-3.5 text-right text-stone-400">₺{rawCost.toFixed(2)}</td>
                            <td className="px-4 py-3.5 text-right text-stone-400">₺{expenseShare.toFixed(2)}</td>
                            <td className="px-4 py-3.5 text-right font-semibold text-stone-200">
                              ₺{totalCost.toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-white">
                              ₺{(product.sale_price || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black text-amber-400 text-sm">
                              ₺{suggestedPrice.toFixed(2)}
                            </td>
                            <td className={`px-4 py-3.5 text-right font-bold ${getMarginColor(currentMargin)}`}>
                              %{currentMargin.toFixed(1)}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {diff === null ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                                  ✓ Uygun Fiyat
                                </span>
                              ) : diff > 0 ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold">
                                  ▼ ₺{Math.abs(diff).toFixed(0)} düşür
                                </span>
                              ) : (
                                <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold animate-pulse">
                                  ▲ ₺{Math.abs(diff).toFixed(0)} artır
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden divide-y divide-stone-800/60">
                {filteredCalculations
                  .sort((a, b) => a.currentMargin - b.currentMargin)
                  .map(({ product, rawCost, expenseShare, totalCost, suggestedPrice, currentMargin }) => {
                    const diff = getPriceDiff(product.sale_price || 0, suggestedPrice)
                    return (
                      <div key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-white text-sm">{product.name}</h4>
                          <span className={getMarginColor(currentMargin)}>%{currentMargin.toFixed(1)} Marj</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                          <div>
                            <span className="text-stone-400 block text-[10px]">Mevcut Fiyat</span>
                            <span className="font-bold text-white">₺{(product.sale_price || 0).toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">Önerilen Fiyat</span>
                            <span className="font-black text-amber-400">₺{suggestedPrice.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">Toplam Maliyet</span>
                            <span className="font-semibold text-stone-300">₺{totalCost.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-stone-400 block text-[10px]">Öneri Durumu</span>
                            {diff === null ? (
                              <span className="text-emerald-400 font-bold">✓ Uygun</span>
                            ) : diff > 0 ? (
                              <span className="text-amber-400 font-bold">▼ ₺{Math.abs(diff).toFixed(0)} düşür</span>
                            ) : (
                              <span className="text-rose-400 font-bold">▲ ₺{Math.abs(diff).toFixed(0)} artır</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        ) : (
          /* ──────────────── TAB 3: GÖRSEL RAPORLAR (RECHARTS) ──────────────── */
          <div className="space-y-6">
            {/* Nakit Katkı Grafiği */}
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
              <div>
                <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
                  <span>💰</span>
                  <span>Satış Karması ve Nakit Katkısı (Contribution Margin)</span>
                </h3>
                <p className="text-stone-400 text-xs mt-0.5">
                  Hangi ürünlerin kâr marjı yüksek, hangileri işletme kasasına en çok sıcak parayı bırakıyor?
                </p>
              </div>

              <div className="h-80 w-full text-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid stroke="#292524" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#a8a29e" angle={-45} textAnchor="end" height={60} />
                    <YAxis yAxisId="left" stroke="#10b981" orientation="left" />
                    <YAxis yAxisId="right" stroke="#3b82f6" orientation="right" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend />
                    <Bar
                      yAxisId="left"
                      dataKey="dailyProfit"
                      name="Günlük Net Kâr (TL)"
                      fill="#10b981"
                      radius={[6, 6, 0, 0]}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="currentMargin"
                      name="Kâr Marjı (%)"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Maliyet Dağılımı (Pie Chart) */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <div>
                  <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
                    <span>🍕</span>
                    <span>Maliyet Dağılımı (Prime Cost vs Overhead)</span>
                  </h3>
                  <p className="text-stone-400 text-xs mt-0.5">
                    Cironun ne kadarı hammaddeye, ne kadarı sabit giderlere, ne kadarı net kâra gidiyor?
                  </p>
                </div>

                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                        formatter={(value: any) => formatCurrency(Number(value) || 0)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* BCG Matrisi (Quad Card View) */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <div>
                  <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
                    <span>⭐</span>
                    <span>Yıldızlar ve Köpekler (BCG Matrisi)</span>
                  </h3>
                  <p className="text-stone-400 text-xs mt-0.5">
                    Sağ üst köşe: Çok satan, çok kâr ettiren (Yıldız). Sol alt: Az satan, az kâr ettiren (Köpek).
                  </p>
                </div>

                {/* Legend Guide Cards */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl text-emerald-400 flex items-center gap-1.5 font-bold">
                    <span>⭐</span>
                    <span>Yıldızlar (Yüksek Marj + Yüksek Satış)</span>
                  </div>
                  <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl text-rose-400 flex items-center gap-1.5 font-bold">
                    <span>🚨</span>
                    <span>Risk Grubu (Düşük Marj + Düşük Satış)</span>
                  </div>
                </div>

                <div className="h-64 w-full text-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid stroke="#292524" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="sales" name="Satış Adedi" stroke="#a8a29e" />
                      <YAxis type="number" dataKey="currentMargin" name="Kâr Marjı (%)" stroke="#a8a29e" />
                      <ZAxis type="number" range={[100, 100]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3' }}
                        contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                        formatter={(value: any, name: any) => [
                          name === 'Satış Adedi' ? `${value} adet` : `%${value}`,
                          name
                        ]}
                        labelFormatter={() => ''}
                      />
                      <Scatter name="Ürünler" data={chartData} fill="#f59e0b">
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.currentMargin > settings.targetMargin ? '#10b981' : '#ef4444'}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
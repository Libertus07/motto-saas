'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { formatCurrency } from "@/lib/format";

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
  const [calculations, setCalculations] = useState<Calculation[]>([])
  const [productSales, setProductSales] = useState<ProductSales>({})
  const [settings, setSettings] = useState({
    targetMargin: 60,
    taxRate: 10,
  })
  const [activeTab, setActiveTab] = useState<'sales' | 'results'>('sales')
  const [targetMargin, setTargetMargin] = useState(35)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchData() }, [])

  const [realSalesMeta, setRealSalesMeta] = useState<{ activeDays: number, salesByProduct: Record<string, number> } | null>(null)

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
    
    // Hammaddeleri çek
    const { data: mats } = await supabase.from('materials').select('*')
    // Üretim reçetelerini ve maliyetlerini çek
    const { data: s_recipes } = await supabase.from('sub_recipes').select('*')
    const { data: s_recipe_ings } = await supabase.from('sub_recipe_ingredients').select('*')
    // Ürün içeriklerini çek
    const { data: prod_ings } = await supabase.from('product_ingredients').select('*')
    
    // Üretim reçetesi maliyetlerini hesapla
    const processedSubRecipes = (s_recipes || []).map(r => {
      const myIngs = (s_recipe_ings || []).filter(i => i.sub_recipe_id === r.id)
      let totalCost = 0
      myIngs.forEach(ing => {
        const mat = (mats || []).find(m => m.id === ing.material_id)
        if (mat) totalCost += mat.price_per_unit * ing.quantity
      })
      const finalCostWithWastage = totalCost * (1 + (r.wastage_percent / 100))
      const costPerYield = r.yield_quantity > 0 ? finalCostWithWastage / r.yield_quantity : 0
      return { ...r, cost_per_yield: costPerYield }
    })

    // Ürünlerin maliyetini hesapla
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

    // Veritabanındaki calculated_cost değeri ile eşleşmeyenleri güncelle
    const updates = productsWithCost.filter(p => p.calculated_cost !== (prods?.find(db => db.id === p.id)?.calculated_cost || 0))
    if (updates.length > 0) {
      await Promise.all(updates.map(p => 
        supabase.from('products').update({ calculated_cost: p.calculated_cost }).eq('id', p.id)
      ))
    }

    setProducts(productsWithCost)
    setExpenses(exps || [])
    setLoading(false)
  }

  const calculate = () => {
    // Sabit aylık giderler (Aylık girilenlerin tamamı, yıllık olanların 12'de 1'i)
    const fixedMonthlyExpenses = expenses.reduce((t, e) => {
      if (e.period === 'Günlük' || e.period === 'daily' || e.period === 'tek_seferlik') return t;
      return t + (e.period === 'yearly' ? e.amount / 12 : e.amount)
    }, 0)
    
    // Günlük değişken giderlerin son 30 gündeki toplamı
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentDailyExpensesTotal = expenses.reduce((t, e) => {
      if (e.period === 'Günlük' || e.period === 'daily' || e.period === 'tek_seferlik') {
        const expDate = e.expense_date ? new Date(e.expense_date) : null;
        if (!expDate || expDate >= thirtyDaysAgo) {
          return t + Number(e.amount);
        }
      }
      return t;
    }, 0)

    // Günlük Sabit Giderler
    const dailyFixed = fixedMonthlyExpenses / 30;
    // Günlük Değişken Giderler (son 30 gündeki toplamın aktif gün sayısına bölünmesi)
    const activeExpenseDays = realSalesMeta && realSalesMeta.activeDays > 0 ? realSalesMeta.activeDays : 30;
    const dailyVariable = recentDailyExpensesTotal / activeExpenseDays;

    const dailyExpenses = dailyFixed + dailyVariable;

    // Toplam günlük ciro
    const totalDailyRevenue = products.reduce((t, p) => {
      const sales = productSales[p.id]?.dailySales || 0
      return t + ((p.sale_price || 0) * sales)
    }, 0)

    const calcs = products.map(product => {
      const sales = productSales[product.id]?.dailySales || 0
      const sale_price = product.sale_price || 0
      const dailyRevenue = sale_price * sales
      const rawCost = product.calculated_cost || 0

      // Ciro ağırlıklı gider payı
      const revenueShare = totalDailyRevenue > 0
        ? dailyRevenue / totalDailyRevenue
        : 1 / products.length

      const totalExpenseForProduct = dailyExpenses * revenueShare
      const expenseShare = sales > 0 ? totalExpenseForProduct / sales : totalExpenseForProduct

      const totalCost = rawCost + expenseShare
      const taxRate = settings.taxRate / 100
      const marginRate = settings.targetMargin / 100

      // Fiyat = Toplam Maliyet / (1 - Hedef Marj) × (1 + KDV)
      const preTax = totalCost / (1 - marginRate)
      const suggestedPrice = preTax * (1 + taxRate)

      // Mevcut kar marjı (KDV hariç)
      const priceExTax = sale_price / (1 + taxRate)
      const currentMargin = priceExTax > 0
        ? ((priceExTax - totalCost) / priceExTax) * 100
        : 0

      const dailyProfit = sales > 0
        ? (priceExTax - totalCost) * sales
        : 0

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
      [productId]: { ...prev[productId], [field]: value, isRealData: false } // Kullanıcı manuel değiştirirse tahmini olur
    }))
  }

  const totalDailyRevenue = calculations.reduce((t, c) => t + c.dailyRevenue, 0)
  const totalDailyProfit = calculations.reduce((t, c) => t + c.dailyProfit, 0)
  const monthlyExpenses = expenses.reduce((t, e) =>
    t + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)
  const dailyExpenses = monthlyExpenses / 30

  const getMarginColor = (margin: number) => {
    if (margin >= targetMargin + 20) return 'text-green-400'
    if (margin >= targetMargin) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getPriceDiff = (current: number, suggested: number) => {
    const diff = current - suggested
    if (Math.abs(diff) < 2) return null
    return diff
  }

  return (
    <div className="min-h-full bg-stone-950 text-white">

      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <h1 className="font-bold text-amber-400">Fiyat Motoru</h1>
          <span className="text-xs bg-amber-500 text-stone-950 px-2 py-0.5 rounded-full font-bold">Ciro Ağırlıklı</span>
        </div>
      </header>

      <main className="p-6">

        {/* Ayarlar */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 mb-6">
          <h3 className="font-bold mb-4 text-amber-400">⚙️ Hesaplama Parametreleri</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-stone-400 text-sm mb-1 block">Hedef Kar Marjı (%)</label>
              <input
                type="number"
                value={settings.targetMargin}
                onChange={e => setSettings({ ...settings, targetMargin: parseFloat(e.target.value) })}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
              <p className="text-stone-500 text-xs mt-1">Kafe sektörü ortalaması: %55-65</p>
            </div>
            <div>
              <label className="text-stone-400 text-sm mb-1 block">KDV Oranı (%)</label>
              <input
                type="number"
                value={settings.taxRate}
                onChange={e => setSettings({ ...settings, taxRate: parseFloat(e.target.value) })}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Özet Kartlar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Ciro</p>
            <p className="text-xl font-bold text-amber-400">{formatCurrency(totalDailyRevenue)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Gider</p>
            <p className="text-xl font-bold text-red-400">{formatCurrency(dailyExpenses)}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Net Kar</p>
            <p className={`text-xl font-bold ${totalDailyProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totalDailyProfit)}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Aylık Tahmini Kar</p>
            <p className={`text-xl font-bold ${totalDailyProfit * 30 > 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency((totalDailyProfit * 30))}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'sales' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
          >
            1. Satış Adetleri Gir
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'results' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
          >
            2. Fiyat Analizi
          </button>
        </div>

        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">🧠</div>
            <p>Önce ürün ekleyin.</p>
          </div>
        ) : activeTab === 'sales' ? (

          /* Satış Adetleri Girişi */
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-800 bg-stone-800 flex justify-between items-center">
              <p className="text-stone-300 text-sm">Satış adetleri Z-Raporundan (varsa) otomatik hesaplandı. Dilerseniz manuel değiştirebilirsiniz.</p>
              {realSalesMeta && realSalesMeta.activeDays > 0 && (
                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30">
                  {realSalesMeta.activeDays} Günlük Z-Raporu Baz Alındı
                </span>
              )}
            </div>
            <div className="overflow-x-auto w-full">
<table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Ürün</th>
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Kategori</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Satış Fiyatı</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm w-36">Günlük Satış Adedi</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Günlük Ciro</th>
                </tr>
              </thead>
              <tbody>
                {products.map(product => {
                  const salesData = productSales[product.id]
                  const sales = salesData?.dailySales || 0
                  const isReal = salesData?.isRealData

                  return (
                    <tr key={product.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                      <td className="px-4 py-2 font-medium">
                        {product.name}
                        {isReal && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30" title="Gerçek Z-Raporu Verisi">✓ Gerçek</span>}
                        {!isReal && <span className="ml-2 text-[10px] bg-stone-500/20 text-stone-400 px-1.5 py-0.5 rounded border border-stone-500/30" title="Tahmini/Manuel Veri">~ Tahmin</span>}
                      </td>
                      <td className="px-4 py-2 text-stone-400 text-sm">{product.category}</td>
                      <td className="px-4 py-2 text-right text-amber-400">₺{product.sale_price || 0}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          value={sales || ''}
                          onChange={e => updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)}
                          className={`w-24 bg-stone-700 border ${isReal ? 'border-green-600/50' : 'border-stone-600'} rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-amber-400`}
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-stone-300">{formatCurrency(((product.sale_price || 0) * sales))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-800">
                  <td colSpan={3} className="px-4 py-3 font-bold text-stone-300">Toplam</td>
                  <td className="px-4 py-3 text-right font-bold text-white">
                    {Object.values(productSales).reduce((t, s) => t + (s.dailySales || 0), 0)} adet
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-amber-400">{formatCurrency(totalDailyRevenue)}
                  </td>
                </tr>
              </tfoot>
            </table>
</div>
          </div>

        ) : (

          /* Fiyat Analizi */
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Ürün</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Ham Maliyet</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Gider Payı</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Toplam Maliyet</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Mevcut Fiyat</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Önerilen Fiyat</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Mevcut Marj</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Durum</th>
                </tr>
              </thead>
              <tbody>
                {calculations
                  .sort((a, b) => a.currentMargin - b.currentMargin)
                  .map(({ product, rawCost, expenseShare, totalCost, suggestedPrice, currentMargin }) => {
                    const diff = getPriceDiff(product.sale_price || 0, suggestedPrice)
                    return (
                      <tr key={product.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                        <td className="px-4 py-3 font-medium">{product.name}</td>
                        <td className="px-4 py-3 text-right text-stone-400">₺{rawCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">₺{expenseShare.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">₺{totalCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">₺{(product.sale_price || 0).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-amber-400 font-bold">₺{suggestedPrice.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${getMarginColor(currentMargin)}`}>
                          %{currentMargin.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {diff === null ? (
                            <span className="text-green-400 text-sm">✓ Uygun</span>
                          ) : diff > 0 ? (
                            <span className="text-orange-400 text-sm">▼ ₺{Math.abs(diff).toFixed(0)} düşür</span>
                          ) : (
                            <span className="text-red-400 text-sm">▲ ₺{Math.abs(diff).toFixed(0)} artır</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
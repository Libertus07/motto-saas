'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  category: string
  selling_price: number
  calculated_cost: number
}

type Expense = {
  amount: number
  period: string
  category: string
}

type ProductSales = {
  [key: string]: {
    dailySales: number
    prepTime: number
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
  const [activeTab, setActiveTab] = useState<'results' | 'sales'>('sales')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (products.length > 0) {
      // Ürünler yüklenince varsayılan satış verisi oluştur
      const initial: ProductSales = {}
      products.forEach(p => {
        if (!productSales[p.id]) {
          initial[p.id] = { dailySales: 0, prepTime: 3 }
        }
      })
      if (Object.keys(initial).length > 0) {
        setProductSales(prev => ({ ...initial, ...prev }))
      }
    }
  }, [products])

  useEffect(() => {
    if (products.length > 0 && expenses.length > 0) calculate()
  }, [products, expenses, productSales, settings])

  const fetchData = async () => {
    const [{ data: prods }, { data: exps }] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('expenses').select('amount, period, category')
    ])
    setProducts(prods || [])
    setExpenses(exps || [])
    setLoading(false)
  }

  const calculate = () => {
    // Aylık & günlük gider
    const monthlyExpenses = expenses.reduce((t, e) =>
      t + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)
    const dailyExpenses = monthlyExpenses / 30

    // Toplam günlük ciro
    const totalDailyRevenue = products.reduce((t, p) => {
      const sales = productSales[p.id]?.dailySales || 0
      return t + (p.selling_price * sales)
    }, 0)

    const calcs = products.map(product => {
      const sales = productSales[product.id]?.dailySales || 0
      const dailyRevenue = product.selling_price * sales
      const rawCost = product.calculated_cost

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
      const priceExTax = product.selling_price / (1 + taxRate)
      const currentMargin = priceExTax > 0
        ? ((priceExTax - totalCost) / priceExTax) * 100
        : 0

      const dailyProfit = sales > 0
        ? (product.selling_price / (1 + taxRate) - totalCost) * sales
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

  const updateSales = (productId: string, field: 'dailySales' | 'prepTime', value: number) => {
    setProductSales(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value }
    }))
  }

  const totalDailyRevenue = calculations.reduce((t, c) => t + c.dailyRevenue, 0)
  const totalDailyProfit = calculations.reduce((t, c) => t + c.dailyProfit, 0)
  const monthlyExpenses = expenses.reduce((t, e) =>
    t + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)
  const dailyExpenses = monthlyExpenses / 30

  const getMarginColor = (margin: number) => {
    if (margin >= 55) return 'text-green-400'
    if (margin >= 35) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getPriceDiff = (current: number, suggested: number) => {
    const diff = current - suggested
    if (Math.abs(diff) < 2) return null
    return diff
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">

      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-stone-400 hover:text-white">← Geri</button>
          <span className="text-stone-600">|</span>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Ciro</p>
            <p className="text-xl font-bold text-amber-400">₺{totalDailyRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Gider</p>
            <p className="text-xl font-bold text-red-400">₺{dailyExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Günlük Net Kar</p>
            <p className={`text-xl font-bold ${totalDailyProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₺{totalDailyProfit.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Aylık Tahmini Kar</p>
            <p className={`text-xl font-bold ${totalDailyProfit * 30 > 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₺{(totalDailyProfit * 30).toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
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
            <div className="px-4 py-3 border-b border-stone-800 bg-stone-800">
              <p className="text-stone-300 text-sm">Z raporunuzdaki günlük satış adetlerini girin. Ne kadar doğru girerseniz hesaplama o kadar isabetli olur.</p>
            </div>
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
                  const sales = productSales[product.id]?.dailySales || 0
                  return (
                    <tr key={product.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                      <td className="px-4 py-2 font-medium">{product.name}</td>
                      <td className="px-4 py-2 text-stone-400 text-sm">{product.category}</td>
                      <td className="px-4 py-2 text-right text-amber-400">₺{product.selling_price}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          value={sales || ''}
                          onChange={e => updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)}
                          className="w-24 bg-stone-700 border border-stone-600 rounded px-2 py-1 text-white text-right text-sm focus:outline-none focus:border-amber-400"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-4 py-2 text-right text-stone-300">
                        ₺{(product.selling_price * sales).toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
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
                  <td className="px-4 py-3 text-right font-bold text-amber-400">
                    ₺{totalDailyRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
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
                  .map(({ product, rawCost, expenseShare, totalCost, suggestedPrice, currentMargin, dailyProfit }) => {
                    const diff = getPriceDiff(product.selling_price, suggestedPrice)
                    return (
                      <tr key={product.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                        <td className="px-4 py-3 font-medium">{product.name}</td>
                        <td className="px-4 py-3 text-right text-stone-400">₺{rawCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-stone-400">₺{expenseShare.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">₺{totalCost.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">₺{product.selling_price.toFixed(2)}</td>
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
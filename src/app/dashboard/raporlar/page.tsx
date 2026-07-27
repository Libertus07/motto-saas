'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/NotificationProvider'
import { devLog, devError } from '@/lib/debug'
import { formatCurrency } from '@/lib/format'

type Product = {
  id: string
  name: string
  category: string
  sale_price: number
  calculated_cost: number
}

type Expense = {
  amount: number
  period: string
  category: string
  expense_date: string
}

export default function Raporlar() {
  const { showAlert } = useNotification()
  const [products, setProducts] = useState<Product[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [targetMargin, setTargetMargin] = useState(35)
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({
    kira: 'Kira',
    personel: 'Personel',
    elektrik: 'Elektrik',
    su: 'Su',
    dogalgaz: 'Doğalgaz',
    internet: 'İnternet',
    muhasebe: 'Muhasebe',
    sigorta: 'Sigorta',
    pazarlama: 'Pazarlama',
    diger: 'Diğer'
  })

  // AI States
  const [aiLoading, setAiLoading] = useState(false)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiReport, setAiReport] = useState<{ summary: string; recommendations: any[] } | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const [{ data: prods }, { data: exps }, { data: salesData }, { data: settings }] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('expenses').select('amount, period, category, expense_date'),
      supabase.from('sales').select('product_id, quantity, total_price'),
      supabase.from('settings').select('*')
    ])
    setProducts(prods || [])
    setExpenses(exps || [])
    setSales(salesData || [])

    if (settings) {
      const marginSetting = settings.find(s => s.key === 'target_margin')?.value
      if (marginSetting) setTargetMargin(Number(marginSetting))

      const expenseCatSetting = settings.find(s => s.key === 'expense_categories')?.value
      if (expenseCatSetting)
        setCategoryLabels(
          typeof expenseCatSetting === 'string' ? JSON.parse(expenseCatSetting) : expenseCatSetting
        )
    }

    setLoading(false)
  }

  const handleAiAnalyze = async () => {
    setAiLoading(true)
    setAiModalOpen(true)
    setAiReport(null)
    try {
      const response = await fetch('/api/ai-menu-engineer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products })
      })
      const data = await response.json()
      if (!data.error) {
        setAiReport(data)
      } else {
        await showAlert(data.error, 'error')
        setAiModalOpen(false)
      }
    } catch (e) {
      devError(e)
      await showAlert('Yapay zeka ile bağlantı kurulamadı.', 'error')
      setAiModalOpen(false)
    }
    setAiLoading(false)
  }

  // Computations
  const monthlyExpenses = useMemo(() => {
    return expenses.reduce((t, e) => t + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)
  }, [expenses])

  const productsWithMargin = useMemo(() => {
    return products
      .filter(p => p.sale_price > 0)
      .map(p => ({
        ...p,
        margin: ((p.sale_price - (p.calculated_cost || 0)) / p.sale_price) * 100,
        profit: p.sale_price - (p.calculated_cost || 0)
      }))
  }, [products])

  const productSalesStats = useMemo(() => {
    return sales.reduce((acc, sale) => {
      if (!acc[sale.product_id]) acc[sale.product_id] = { revenue: 0, quantity: 0 }
      acc[sale.product_id].revenue += Number(sale.total_price) || 0
      acc[sale.product_id].quantity += sale.quantity || 0
      return acc
    }, {} as Record<string, { revenue: number; quantity: number }>)
  }, [sales])

  const productsWithStats = useMemo(() => {
    return productsWithMargin.map(p => ({
      ...p,
      totalRevenue: productSalesStats[p.id]?.revenue || 0,
      totalQuantity: productSalesStats[p.id]?.quantity || 0,
      totalProfit: (productSalesStats[p.id]?.quantity || 0) * p.profit
    }))
  }, [productsWithMargin, productSalesStats])

  const topByRevenue = useMemo(() => {
    return [...productsWithStats].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5)
  }, [productsWithStats])

  const topByTotalProfit = useMemo(() => {
    return [...productsWithStats].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5)
  }, [productsWithStats])

  const avgMargin = useMemo(() => {
    return productsWithMargin.length > 0
      ? productsWithMargin.reduce((t, p) => t + p.margin, 0) / productsWithMargin.length
      : 0
  }, [productsWithMargin])

  const categoryStats = useMemo(() => {
    const statsObj = products.reduce((acc, p) => {
      if (!acc[p.category]) acc[p.category] = { count: 0, avgCost: 0, totalCost: 0 }
      acc[p.category].count++
      acc[p.category].totalCost += p.calculated_cost || 0
      return acc
    }, {} as Record<string, { count: number; avgCost: number; totalCost: number }>)

    Object.keys(statsObj).forEach(cat => {
      statsObj[cat].avgCost = statsObj[cat].totalCost / statsObj[cat].count
    })

    return statsObj
  }, [products])

  const expenseCategories = useMemo(() => {
    return expenses.reduce((acc, e) => {
      const monthlyAmount = e.period === 'yearly' ? e.amount / 12 : e.amount
      acc[e.category] = (acc[e.category] || 0) + monthlyAmount
      return acc
    }, {} as Record<string, number>)
  }, [expenses])

  const lowMarginCount = useMemo(() => {
    return productsWithMargin.filter(p => p.margin < targetMargin).length
  }, [productsWithMargin, targetMargin])

  const getMarginColor = (margin: number) => {
    if (margin >= targetMargin + 20) return 'text-emerald-400 font-bold'
    if (margin >= targetMargin) return 'text-amber-400 font-bold'
    return 'text-rose-400 font-bold'
  }

  const actionCards = [
    {
      title: 'Hammadde Faturası Yükle',
      desc: 'Yapay zeka ile tedarikçi fişlerinden fiyat ve stokları otomatik güncelle.',
      icon: '🧾',
      color: 'amber',
      path: '/dashboard/hammaddeler/fis-yukle'
    },
    {
      title: 'Gün Sonu Z Raporu Yükle',
      desc: 'Z raporunun fotoğrafını çek, gün sonu satışlarını ve stok düşümlerini yap.',
      icon: '📸',
      color: 'blue',
      path: '/dashboard/raporlar/z-raporu'
    },
    {
      title: 'Yatırım Fişi Yükle',
      desc: 'Altın, döviz veya varlık fişlerinizi okutarak portföyünüze ekleyin.',
      icon: '💰',
      color: 'purple',
      path: '/dashboard/raporlar/yatirim-fisi'
    },
    {
      title: 'Geçmiş Fişler',
      desc: 'Geçmiş tedarikçi ve hammadde faturalarını detaylıca incele.',
      icon: '📂',
      color: 'amber',
      path: '/dashboard/raporlar/tedarikci-gecmisi'
    },
    {
      title: 'Geçmiş Z Raporları',
      desc: 'Daha önce işlenen gün sonu satış raporlarını ve detaylarını gör.',
      icon: '📅',
      color: 'blue',
      path: '/dashboard/raporlar/gecmis'
    },
    {
      title: 'Geçmiş Yatırım Fişleri',
      desc: 'Yüklediğiniz tüm yatırım ve dekont arşivine göz atın.',
      icon: '🗂️',
      color: 'purple',
      path: '/dashboard/raporlar/yatirim-gecmisi'
    }
  ]

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              📊
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                  Raporlar ve Finansal Analiz
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Performans & Karlılık
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Menü mühendisliği, ciro şampiyonları, gider dağılımı ve yapay zeka analiz raporu.
              </p>
            </div>
          </div>

          <button
            onClick={handleAiAnalyze}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>🧠</span>
            <span>Yapay Zeka Menü Mühendisi</span>
          </button>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">📊</div>
            <p className="text-sm font-medium">Finansal Raporlar Hesaplanıyor...</p>
          </div>
        ) : (
          <>
            {/* EXECUTIVE KPI METRIC CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-stone-400 text-xs font-semibold">Toplam Ürün</span>
                  <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                    📦
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-white">{products.length} Ürün</div>
                <div className="text-stone-400 text-[11px] mt-1">Sistemdeki Aktif Menü</div>
              </div>

              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-stone-400 text-xs font-semibold">Ortalama Kâr Marjı</span>
                  <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
                    📈
                  </span>
                </div>
                <div className={`text-xl sm:text-2xl font-black ${getMarginColor(avgMargin)}`}>
                  %{avgMargin.toFixed(1)}
                </div>
                <div className="text-stone-400 text-[11px] mt-1">Hedef Marj: %{targetMargin}</div>
              </div>

              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-stone-400 text-xs font-semibold">Aylık Toplam Gider</span>
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                    💸
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black text-amber-400">
                  {formatCurrency(monthlyExpenses)}
                </div>
                <div className="text-stone-400 text-[11px] mt-1">İşletme Sabit & Değişken Gideri</div>
              </div>

              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-stone-400 text-xs font-semibold">Düşük Marjlı Ürün</span>
                  <span
                    className={`p-2 rounded-xl text-base ${
                      lowMarginCount > 0
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    🚨
                  </span>
                </div>
                <div
                  className={`text-xl sm:text-2xl font-black ${
                    lowMarginCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {lowMarginCount} Ürün
                </div>
                <div className="text-stone-400 text-[11px] mt-1">Maliyeti Kurtarmayanlar</div>
              </div>
            </div>

            {/* ──────────────── SMART RECEIPT & ARCHIVE CARDS ──────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {actionCards.map((card, idx) => (
                <div
                  key={idx}
                  onClick={() => router.push(card.path)}
                  className="bg-stone-900/80 border border-stone-800/80 hover:border-amber-500/40 rounded-2xl p-5 cursor-pointer transition-all hover:bg-stone-800/50 backdrop-blur-md shadow-xl flex items-start gap-4 group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-2xl bg-stone-950 border border-stone-800 flex items-center justify-center text-2xl shrink-0 group-hover:scale-110 transition-transform shadow-inner">
                    {card.icon}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-white text-sm sm:text-base group-hover:text-amber-400 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-stone-400 text-xs mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ──────────────── LEADERBOARDS (CIRO & KAR ŞAMPİYONLARI) ──────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Ciro Şampiyonları */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-blue-400 text-sm sm:text-base flex items-center gap-2">
                    <span>🔥</span>
                    <span>Ciro Şampiyonları (En Çok Para Getirenler)</span>
                  </h3>
                  <span className="text-[10px] text-stone-400 uppercase font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                    Top 5
                  </span>
                </div>

                {topByRevenue.length === 0 || topByRevenue[0].totalRevenue === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-6">Henüz satış verisi bulunmuyor.</p>
                ) : (
                  <div className="space-y-2.5">
                    {topByRevenue.map((p, index) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-stone-950/60 p-3 rounded-xl border border-stone-800/60 hover:bg-stone-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-black text-xs flex items-center justify-center">
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-bold text-white text-xs sm:text-sm">{p.name}</p>
                            <p className="text-stone-400 text-[11px]">{p.totalQuantity} adet satıldı</p>
                          </div>
                        </div>
                        <span className="text-blue-400 font-black text-xs sm:text-sm">
                          {formatCurrency(p.totalRevenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Kâr Şampiyonları */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-emerald-400 text-sm sm:text-base flex items-center gap-2">
                    <span>💰</span>
                    <span>Kâr Şampiyonları (En Çok Net Kâr Bırakanlar)</span>
                  </h3>
                  <span className="text-[10px] text-stone-400 uppercase font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    Top 5
                  </span>
                </div>

                {topByTotalProfit.length === 0 || topByTotalProfit[0].totalProfit === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-6">Henüz satış kâr verisi bulunmuyor.</p>
                ) : (
                  <div className="space-y-2.5">
                    {topByTotalProfit.map((p, index) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between bg-stone-950/60 p-3 rounded-xl border border-stone-800/60 hover:bg-stone-800/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center">
                            #{index + 1}
                          </span>
                          <div>
                            <p className="font-bold text-white text-xs sm:text-sm">{p.name}</p>
                            <p className="text-stone-400 text-[11px]">Kâr Marjı: %{p.margin.toFixed(1)}</p>
                          </div>
                        </div>
                        <span className="text-emerald-400 font-black text-xs sm:text-sm">
                          {formatCurrency(p.totalProfit)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ──────────────── BREAKDOWNS (KATEGORİ VE GİDER DAĞILIMI) ──────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Kategori Bazlı Ortalama Maliyet */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <h3 className="font-extrabold text-stone-200 text-sm sm:text-base flex items-center gap-2">
                  <span>📦</span>
                  <span>Kategori Bazlı Ortalama Maliyet</span>
                </h3>

                {Object.keys(categoryStats).length === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-6">Kategori verisi bulunmuyor.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(categoryStats).map(([cat, stat]) => (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-stone-300">{cat}</span>
                          <span className="text-amber-400 font-extrabold">₺{stat.avgCost.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-stone-950 rounded-full h-2 overflow-hidden border border-stone-800">
                          <div
                            className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-full"
                            style={{ width: `${Math.min((stat.avgCost / 50) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Gider Kategori Dağılımı */}
              <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
                <h3 className="font-extrabold text-stone-200 text-sm sm:text-base flex items-center gap-2">
                  <span>💸</span>
                  <span>Gider Kategori Dağılımı (Aylık)</span>
                </h3>

                {Object.keys(expenseCategories).length === 0 ? (
                  <p className="text-stone-500 text-xs text-center py-6">Gider kaydı bulunmuyor.</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(expenseCategories)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amount]) => {
                        const percent = monthlyExpenses > 0 ? (amount / monthlyExpenses) * 100 : 0
                        return (
                          <div key={cat} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-stone-300">{categoryLabels[cat] || cat}</span>
                              <span className="text-rose-400 font-extrabold">
                                {formatCurrency(amount)} (%{percent.toFixed(0)})
                              </span>
                            </div>
                            <div className="w-full bg-stone-950 rounded-full h-2 overflow-hidden border border-stone-800">
                              <div
                                className="bg-gradient-to-r from-rose-500 to-rose-600 h-full rounded-full"
                                style={{ width: `${Math.min(100, percent)}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* ──────────────── DETAYLI KARLILIK TABLOSU ──────────────── */}
            <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
              <div className="px-6 py-4 border-b border-stone-800/80 bg-stone-950/60 flex items-center justify-between">
                <h3 className="font-extrabold text-white text-sm sm:text-base flex items-center gap-2">
                  <span>📊</span>
                  <span>Tüm Ürünler — Detaylı Kârlılık Dökümü</span>
                </h3>
                <span className="text-xs text-stone-400 font-bold bg-stone-900 px-2.5 py-0.5 rounded-full border border-stone-800">
                  {productsWithMargin.length} ürün
                </span>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="px-5 py-3.5">Ürün Adı</th>
                      <th className="px-4 py-3.5">Kategori</th>
                      <th className="px-4 py-3.5 text-right">Birim Maliyet</th>
                      <th className="px-4 py-3.5 text-right">Satış Fiyatı</th>
                      <th className="px-4 py-3.5 text-right">Net Kâr</th>
                      <th className="px-5 py-3.5 text-right">Kâr Marjı (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                    {productsWithMargin.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-stone-500">
                          Henüz menü ürünü eklenmemiş.
                        </td>
                      </tr>
                    ) : (
                      productsWithMargin
                        .sort((a, b) => a.margin - b.margin)
                        .map(p => (
                          <tr key={p.id} className="hover:bg-stone-800/30 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-stone-100">{p.name}</td>
                            <td className="px-4 py-3.5 text-stone-400 font-medium">{p.category}</td>
                            <td className="px-4 py-3.5 text-right text-stone-400 font-medium">
                              ₺{(p.calculated_cost || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-white">
                              ₺{p.sale_price.toFixed(2)}
                            </td>
                            <td
                              className={`px-4 py-3.5 text-right font-black ${
                                p.profit > 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              ₺{p.profit.toFixed(2)}
                            </td>
                            <td className={`px-5 py-3.5 text-right font-black ${getMarginColor(p.margin)}`}>
                              %{p.margin.toFixed(1)}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden divide-y divide-stone-800/60">
                {productsWithMargin
                  .sort((a, b) => a.margin - b.margin)
                  .map(p => (
                    <div key={p.id} className="p-4 space-y-2 hover:bg-stone-800/20 transition-colors">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-white text-sm">{p.name}</h4>
                        <span className={getMarginColor(p.margin)}>%{p.margin.toFixed(1)} Marj</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                        <div>
                          <span className="text-stone-400 block text-[10px]">Maliyet</span>
                          <span className="font-medium text-stone-300">₺{(p.calculated_cost || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Fiyat</span>
                          <span className="font-bold text-white">₺{p.sale_price.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-stone-400 block text-[10px]">Net Kâr</span>
                          <span className={`font-black ${p.profit > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ₺{p.profit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </main>

      {/* ──────────────── AI MENU ENGINEER MODAL ──────────────── */}
      {aiModalOpen && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setAiModalOpen(false)}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden relative my-auto max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  🧠
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Yapay Zeka Menü Mühendisi</h3>
                  <p className="text-stone-400 text-xs">Finansal Analiz & Stratejik Menü Önerileri</p>
                </div>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {aiLoading ? (
                <div className="py-16 text-center space-y-4">
                  <div className="text-6xl animate-pulse">🤖</div>
                  <h4 className="font-extrabold text-amber-400 text-base">Menünüz İnceleniyor...</h4>
                  <p className="text-stone-400 text-xs max-w-sm mx-auto">
                    Kâr marjları, hammadde maliyetleri ve ciro katkıları yapay zeka ile analiz ediliyor.
                  </p>
                </div>
              ) : aiReport ? (
                <div className="space-y-5">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-1.5">
                    <h4 className="font-extrabold text-amber-400 text-xs uppercase tracking-wider">
                      Genel Durum Özeti
                    </h4>
                    <p className="text-stone-200 text-xs sm:text-sm leading-relaxed">{aiReport.summary}</p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-extrabold text-white text-xs uppercase tracking-wider">
                      Aksiyon Bekleyen Ürünler & Strateji
                    </h4>
                    <div className="space-y-3">
                      {aiReport.recommendations?.map((rec, i) => (
                        <div
                          key={i}
                          className="bg-stone-950 p-4 rounded-2xl border border-stone-800 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="font-extrabold text-white text-sm">{rec.product_name}</h5>
                            <span className="bg-stone-900 text-[10px] text-amber-400 px-2.5 py-0.5 rounded-full border border-stone-800 font-bold">
                              Öneri #{i + 1}
                            </span>
                          </div>

                          <div className="space-y-2 text-xs">
                            <div className="bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                              <span className="text-rose-400 font-extrabold text-[10px] uppercase block mb-0.5">
                                Tespit Edilen Sorun
                              </span>
                              <p className="text-stone-300">{rec.issue}</p>
                            </div>

                            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
                              <span className="text-emerald-400 font-extrabold text-[10px] uppercase block mb-0.5">
                                Çözüm Aksiyonu
                              </span>
                              <p className="text-stone-200 font-semibold">{rec.action}</p>
                            </div>

                            <div className="bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                              <span className="text-amber-400 font-extrabold text-[10px] uppercase block mb-0.5">
                                Beklenen Etki
                              </span>
                              <p className="text-amber-200">{rec.impact}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-stone-400 text-center py-12 text-xs">
                  Analiz oluşturulurken bir hata oluştu. Lütfen tekrar deneyin.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end">
              <button
                onClick={() => setAiModalOpen(false)}
                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
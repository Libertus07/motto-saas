'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalIngredients: 0,
    criticalStockCount: 0,
    monthlyExpenses: 0,
    lowMarginProducts: 0,
    totalStockValue: 0,
    grossRevenue: 0,
    totalCogs: 0,
    netProfit: 0,
    targetMargin: 35,
    criticalItems: [] as any[]
  })

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    const [
      { data: products },
      { data: materials },
      { data: expenses },
      { data: sales },
      { data: settings }
    ] = await Promise.all([
      supabase.from('products').select('id, sale_price, calculated_cost'),
      supabase.from('materials').select('id, name, stock_quantity, unit, critical_stock_level, price_per_unit'),
      supabase.from('expenses').select('amount, period, expense_date'),
      supabase.from('sales').select('quantity, total_price, sale_date, products(calculated_cost)'),
      supabase.from('settings').select('*')
    ])

    const criticalItems = (materials || []).filter(
      i => (i.stock_quantity || 0) <= (i.critical_stock_level || 0) && (i.critical_stock_level || 0) > 0
    )
    const criticalStockCount = criticalItems.length

    // Net Kâr hesaplaması (Son 30 gün)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSales = (sales || []).filter(s => {
      const d = new Date(s.sale_date);
      return d >= thirtyDaysAgo;
    });

    const recentExpenses = (expenses || []).filter(e => {
      if (e.period === 'Günlük' || e.period === 'daily' || e.period === 'tek_seferlik') {
        const d = e.expense_date ? new Date(e.expense_date) : null;
        return d && d >= thirtyDaysAgo;
      }
      return true; // Aylık/yıllık giderleri doğrudan alacağız
    });

    const grossRevenue = recentSales.reduce((t, s) => t + Number(s.total_price), 0);
    const totalCogs = recentSales.reduce((t, s) => {
      // products() join result is array or object depending on relation, usually object for many-to-one
      const cost = s.products ? Number((s.products as any).calculated_cost || 0) : 0;
      return t + (cost * Number(s.quantity));
    }, 0);

    const monthlyExpenses = recentExpenses.reduce((t, e) => {
      if (e.period === 'Günlük' || e.period === 'daily' || e.period === 'tek_seferlik') return t + Number(e.amount);
      return t + (e.period === 'yearly' ? e.amount / 12 : e.amount)
    }, 0);

    const netProfit = grossRevenue - totalCogs - monthlyExpenses;

    const targetMarginSetting = (settings || []).find(s => s.key === 'target_margin')?.value
    const targetMargin = targetMarginSetting ? Number(targetMarginSetting) : 35

    const lowMarginProducts = (products || []).filter(p => {
      if (!p.sale_price || !p.calculated_cost) return false
      const margin = ((p.sale_price - p.calculated_cost) / p.sale_price) * 100
      return margin < targetMargin
    }).length

    const totalStockValue = (materials || []).reduce((t, i) =>
      t + (i.stock_quantity || 0) * i.price_per_unit, 0)

    setStats({
      totalProducts: products?.length || 0,
      totalIngredients: materials?.length || 0,
      criticalStockCount,
      monthlyExpenses,
      lowMarginProducts,
      totalStockValue,
      grossRevenue,
      totalCogs,
      netProfit,
      targetMargin,
      criticalItems
    })
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const modules = [
    { icon: '🧪', title: 'Hammaddeler', desc: 'Malzeme listesi ve fiyatlar', path: '/dashboard/hammaddeler' },
    { icon: '🥣', title: 'Yarı Mamuller', desc: 'Kendi üretiminiz pastalar/tepsiler', path: '/dashboard/yari-mamuller' },
    { icon: '📋', title: 'Ürünler & Reçeteler', desc: 'Menü ve maliyet hesabı', path: '/dashboard/urunler' },
    { icon: '💰', title: 'Giderler', desc: 'Kira, personel, faturalar', path: '/dashboard/giderler' },
    { icon: '📦', title: 'Stok Takibi', desc: 'Giriş, çıkış, sayım', path: '/dashboard/stok' },
    { icon: '🧠', title: 'Fiyat Motoru', desc: 'Olması gereken fiyat hesabı', path: '/dashboard/fiyat-motoru' },
    { icon: '🏢', title: 'Tedarikçiler', desc: 'Toptancılar ve cari (borç) takibi', path: '/dashboard/tedarikciler' },
    { icon: '📊', title: 'Raporlar', desc: 'Karlılık ve veri girişi', path: '/dashboard/raporlar' },
  ]

  return (
    <div className="min-h-full text-white">
      <main className="p-0">
        <h2 className="text-xl font-bold mb-6">Hoş geldiniz 👋</h2>

        {/* Uyarılar ve Alışveriş Listesi */}
        {!loading && (stats.criticalStockCount > 0 || stats.lowMarginProducts > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {stats.criticalStockCount > 0 && (
              <div className="bg-red-950/40 border border-red-900 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-start gap-3 mb-4">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h3 className="font-bold text-red-500">Kritik Stok Uyarısı</h3>
                    <p className="text-stone-300 text-sm mt-1">
                      {stats.criticalStockCount} adet hammaddenin stoğu kritik seviyenin altında!
                    </p>
                    <ul className="mt-2 text-xs text-red-200 list-disc list-inside">
                      {stats.criticalItems.slice(0, 5).map(item => (
                        <li key={item.id}>{item.name} ({item.stock_quantity} {item.unit} kaldı)</li>
                      ))}
                      {stats.criticalStockCount > 5 && <li>...ve {stats.criticalStockCount - 5} ürün daha.</li>}
                    </ul>
                  </div>
                </div>
                <a 
                  href={`https://wa.me/?text=${encodeURIComponent(`*Acil Sipariş Listesi*\n\n${stats.criticalItems.map(i => `- ${i.name} (Kalan: ${i.stock_quantity} ${i.unit})`).join('\n')}`)}`}
                  target="_blank"
                  className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg text-sm text-center transition-colors flex items-center justify-center gap-2"
                >
                  <span>📱</span> WhatsApp ile Toptancıya Gönder
                </a>
              </div>
            )}

            {stats.lowMarginProducts > 0 && (
              <div className="bg-orange-950/40 border border-orange-900 rounded-xl p-4 flex items-start gap-3">
                <span className="text-2xl">📉</span>
                <div>
                  <h3 className="font-bold text-orange-500">Düşük Kar Marjı</h3>
                  <p className="text-stone-300 text-sm mt-1">
                    {stats.lowMarginProducts} adet ürünün kar marjı hedeflenen %{stats.targetMargin}'in altında. 
                    Fiyatları güncellemeyi düşünebilirsiniz.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Özet Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          
          <div className={`col-span-1 md:col-span-4 bg-stone-900 border ${stats.netProfit >= 0 ? 'border-green-900/50' : 'border-red-900/50'} rounded-xl p-6 relative overflow-hidden`}>
            <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl opacity-20 ${stats.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <h3 className="text-stone-400 text-sm font-medium mb-4">Son 30 Günlük Net Kâr Performansı</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10">
              <div>
                <div className="text-stone-500 text-xs mb-1">Brüt Ciro (Satışlar)</div>
                <div className="text-xl font-bold text-white">₺{stats.grossRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-stone-500 text-xs mb-1">- Satılan Malın Maliyeti</div>
                <div className="text-xl font-bold text-red-300">₺{stats.totalCogs.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div>
                <div className="text-stone-500 text-xs mb-1">- Genel Giderler</div>
                <div className="text-xl font-bold text-red-300">₺{stats.monthlyExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="pl-4 border-l border-stone-800">
                <div className="text-stone-500 text-xs mb-1">NET KÂR</div>
                <div className={`text-3xl font-black ${stats.netProfit >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                  ₺{stats.netProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Toplam Ürün</p>
            <p className="text-2xl font-bold text-white">{loading ? '...' : stats.totalProducts}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Hammadde Çeşidi</p>
            <p className="text-2xl font-bold text-white">{loading ? '...' : stats.totalIngredients}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Aylık Gider</p>
            <p className="text-2xl font-bold text-amber-400">
              {loading ? '...' : `₺${stats.monthlyExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}`}
            </p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <p className="text-stone-400 text-xs mb-1">Stok Değeri</p>
            <p className="text-2xl font-bold text-green-400">
              {loading ? '...' : `₺${stats.totalStockValue.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}`}
            </p>
          </div>
        </div>

        {/* Modül Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {modules.map(mod => (
            <div
              key={mod.path}
              onClick={() => router.push(mod.path)}
              className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
            >
              <div className="text-3xl mb-3">{mod.icon}</div>
              <h3 className="font-bold text-lg">{mod.title}</h3>
              <p className="text-stone-400 text-sm mt-1">{mod.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
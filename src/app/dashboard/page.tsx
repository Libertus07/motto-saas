'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency } from "@/lib/format";

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [showCriticalModal, setShowCriticalModal] = useState(false)
    const [stats, setStats] = useState({
    totalProducts: 0,
    totalIngredients: 0,
    criticalStockCount: 0,
    monthlyExpenses: 0,
    lowMarginProducts: 0,
    totalStockValue: 0,
    grossRevenue: 0,
    totalDiscounts: 0,
    netRevenue: 0,
    totalCogs: 0,
    netProfit: 0,
    targetMargin: 35,
    criticalItems: [] as any[],
    totalCash: 0,
    totalBank: 0,
    totalInvestments: 0
  })

  useEffect(() => { fetchStats() }, [])

  const fetchStats = async () => {
    const [
      { data: products },
      { data: materials },
      { data: expenses },
      { data: sales },
      { data: settings },
      { data: accounts },
      { data: investments }
    ] = await Promise.all([
      supabase.from('products').select('id, sale_price, calculated_cost'),
      supabase.from('materials').select('id, name, stock_quantity, unit, critical_stock_level, price_per_unit'),
      supabase.from('expenses').select('amount, period, expense_date, category'),
      supabase.from('sales').select('quantity, total_price, sale_date, product_id'),
      supabase.from('settings').select('*'),
      supabase.from('accounts').select('type, balance'),
      supabase.from('investments').select('asset_type, quantity, average_cost')
    ])

    // Canlı Kurlar
    let rates: any = null
    try {
      const res = await fetch('/api/exchange-rates')
      const data = await res.json()
      if (data.success) rates = data.rates
    } catch (e) { devError('Kurlar çekilemedi', e) }

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
      const d = e.expense_date ? new Date(e.expense_date) : null;
      return d && d >= thirtyDaysAgo;
    });

    const grossRevenue = recentSales.reduce((t, s) => t + Number(s.total_price), 0);
    const totalCogs = recentSales.reduce((t, s) => {
      const product = (products || []).find(p => p.id === s.product_id);
      const cost = product ? Number(product.calculated_cost || 0) : 0;
      return t + (cost * Number(s.quantity));
    }, 0);

    const totalDiscounts = recentExpenses.filter(e => e.category === 'indirim-ikram').reduce((t, e) => t + Number(e.amount), 0);
    const monthlyExpenses = recentExpenses.filter(e => e.category !== 'indirim-ikram').reduce((t, e) => t + Number(e.amount), 0);

    const netRevenue = grossRevenue - totalDiscounts;
    const netProfit = netRevenue - totalCogs - monthlyExpenses;

    const targetMarginSetting = (settings || []).find(s => s.key === 'target_margin')?.value
    const targetMargin = targetMarginSetting ? Number(targetMarginSetting) : 35

    const lowMarginProducts = (products || []).filter(p => {
      if (!p.sale_price || !p.calculated_cost) return false
      const margin = ((p.sale_price - p.calculated_cost) / p.sale_price) * 100
      return margin < targetMargin
    }).length

    const totalStockValue = (materials || []).reduce((t, i) =>
      t + (i.stock_quantity || 0) * i.price_per_unit, 0)

    const totalCash = (accounts || []).filter(a => a.type === 'cash').reduce((t, a) => t + Number(a.balance), 0)
    const totalBank = (accounts || []).filter(a => a.type === 'bank').reduce((t, a) => t + Number(a.balance), 0)
    const totalInvestments = (investments || []).reduce((t, inv) => {
        const rate = rates ? rates[inv.asset_type] : inv.average_cost
        return t + (Number(inv.quantity) * rate)
    }, 0)

    setStats({
      totalProducts: products?.length || 0,
      totalIngredients: materials?.length || 0,
      criticalStockCount,
      monthlyExpenses,
      lowMarginProducts,
      totalStockValue,
      grossRevenue,
      totalDiscounts,
      netRevenue,
      totalCogs,
      netProfit,
      targetMargin,
      criticalItems,
      totalCash,
      totalBank,
      totalInvestments
    })
    setLoading(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const modules = [
    { icon: '🧪', title: 'Hammaddeler', desc: 'Malzeme listesi ve fiyatlar', path: '/dashboard/hammaddeler' },
    { icon: '🥣', title: 'Üretim Reçeteleri', desc: 'Kendi üretiminiz pastalar/tepsiler', path: '/dashboard/yari-mamuller' },
    { icon: '📋', title: 'Ürünler & Reçeteler', desc: 'Menü ve maliyet hesabı', path: '/dashboard/urunler' },
    { icon: '💰', title: 'Giderler', desc: 'Kira, personel, faturalar', path: '/dashboard/giderler' },
    { icon: '📦', title: 'Stok Takibi', desc: 'Giriş, çıkış, sayım', path: '/dashboard/stok' },
    { icon: '🧠', title: 'Fiyat Motoru', desc: 'Olması gereken fiyat hesabı', path: '/dashboard/fiyat-motoru' },
    { icon: '💳', title: 'Finans & Kasa', desc: 'Nakit ve banka hesapları', path: '/dashboard/finans' },
    { icon: '📈', title: 'Yatırımlar', desc: 'Altın ve döviz portföyü', path: '/dashboard/yatirimlar' },
    { icon: '🏢', title: 'Tedarikçiler', desc: 'Toptancılar ve cari (borç) takibi', path: '/dashboard/tedarikciler' },
    { icon: '📊', title: 'Raporlar', desc: 'Karlılık ve veri girişi', path: '/dashboard/raporlar' },
    { icon: '🕵️‍♂️', title: 'İşlem Geçmişi', desc: 'Tüm sistem aktiviteleri', path: '/dashboard/islem-gecmisi' },
    { icon: '⚙️', title: 'Ayarlar', desc: 'Sistem ve hesap yapılandırması', path: '/dashboard/ayarlar' },
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

        {/* Varlıklarım (Finans Özeti) */}
        <h3 className="text-lg font-bold mb-4 text-amber-500 flex items-center gap-2"><span>💼</span> Varlıklarım (Finans Özeti)</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 relative overflow-hidden">
             <div className="absolute -right-4 -top-4 text-7xl opacity-5">💵</div>
             <p className="text-stone-400 text-sm mb-1 font-bold">Nakit Kasa</p>
             <h2 className="text-2xl font-bold text-white">₺{formatCurrency(stats.totalCash)}</h2>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 relative overflow-hidden">
             <div className="absolute -right-4 -top-4 text-7xl opacity-5">🏦</div>
             <p className="text-stone-400 text-sm mb-1 font-bold">Banka Hesapları</p>
             <h2 className="text-2xl font-bold text-white">₺{formatCurrency(stats.totalBank)}</h2>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 relative overflow-hidden cursor-pointer hover:border-amber-500/50 transition-colors" onClick={() => router.push('/dashboard/yatirimlar')}>
             <div className="absolute -right-4 -top-4 text-7xl opacity-5">📈</div>
             <p className="text-stone-400 text-sm mb-1 font-bold">Yatırımlar Değeri (Canlı)</p>
             <h2 className="text-2xl font-bold text-amber-500">₺{formatCurrency(stats.totalInvestments)}</h2>
          </div>
          <div className="bg-stone-800 border border-amber-500/30 rounded-xl p-6 relative overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.1)]">
             <div className="absolute -right-4 -top-4 text-7xl opacity-5">👑</div>
             <p className="text-amber-400/80 text-sm mb-1 font-bold">TOPLAM NET VARLIK</p>
             <h2 className="text-3xl font-black text-amber-500">₺{formatCurrency((stats.totalCash + stats.totalBank + stats.totalInvestments))}</h2>
          </div>
        </div>

        {/* Operasyonel Metrikler */}
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-stone-300 flex items-center gap-2"><span>📊</span> Operasyonel Metrikler</h3>
            <span className="text-xs bg-stone-800 text-stone-400 px-3 py-1 rounded-full border border-stone-700">Son 30 Gün</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* P&L (Kâr/Zarar) Tablosu - 2 Sütun */}
          <div className="lg:col-span-2 bg-stone-900/50 backdrop-blur-md border border-stone-800 rounded-2xl p-6 relative overflow-hidden group">
             <div className={`absolute -top-24 -right-24 w-48 h-48 blur-[80px] opacity-30 transition-all duration-700 group-hover:opacity-50 ${stats.netProfit >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
             
             <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stats.netProfit >= 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                Net Kâr Analizi
             </h4>
             
             <div className="space-y-3 relative z-10">
                <div className="flex justify-between items-center p-3 rounded-xl bg-stone-800/30 hover:bg-stone-800/50 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">📈</div>
                      <div>
                         <p className="text-stone-400 text-xs">Brüt Satışlar (Liste Fiyatı)</p>
                         <p className="font-bold text-white text-lg">₺{formatCurrency(stats.grossRevenue)}</p>
                      </div>
                   </div>
                </div>

                <div className="w-px h-3 bg-stone-800 mx-auto"></div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-stone-800/30 hover:bg-stone-800/50 transition-colors border-l-2 border-red-500/50">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">✂️</div>
                      <div>
                         <p className="text-stone-400 text-xs">- İndirim ve İkramlar</p>
                         <p className="font-bold text-red-400 text-lg">₺{formatCurrency(stats.totalDiscounts)}</p>
                      </div>
                   </div>
                   <div className="text-right hidden sm:block">
                      <span className="text-xs text-stone-500">İndirim Oranı</span>
                      <p className="text-sm text-red-400/80 font-medium">%{stats.grossRevenue > 0 ? ((stats.totalDiscounts / stats.grossRevenue) * 100).toFixed(1) : '0.0'}</p>
                   </div>
                </div>

                <div className="w-px h-3 bg-stone-800 mx-auto"></div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-stone-800/30 hover:bg-stone-800/50 transition-colors bg-blue-900/10">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">💵</div>
                      <div>
                         <p className="text-emerald-400/80 text-xs font-bold">NET SATIŞ (KASAYA GİREN)</p>
                         <p className="font-bold text-emerald-400 text-xl">₺{formatCurrency(stats.netRevenue)}</p>
                      </div>
                   </div>
                </div>

                <div className="w-px h-3 bg-stone-800 mx-auto"></div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-stone-800/30 hover:bg-stone-800/50 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">📦</div>
                      <div>
                         <p className="text-stone-400 text-xs">- Satılan Malın Maliyeti (SMM)</p>
                         <p className="font-bold text-red-300 text-lg">₺{formatCurrency(stats.totalCogs)}</p>
                      </div>
                   </div>
                   <div className="text-right hidden sm:block">
                      <span className="text-xs text-stone-500">Ciroya Oranı</span>
                      <p className="text-sm text-stone-400 font-medium">%{stats.grossRevenue > 0 ? ((stats.totalCogs / stats.grossRevenue) * 100).toFixed(1) : '0.0'}</p>
                   </div>
                </div>

                <div className="w-px h-3 bg-stone-800 mx-auto"></div>

                <div className="flex justify-between items-center p-3 rounded-xl bg-stone-800/30 hover:bg-stone-800/50 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">💸</div>
                      <div>
                         <p className="text-stone-400 text-xs">- Operasyonel Giderler</p>
                         <p className="font-bold text-red-300 text-lg">₺{formatCurrency(stats.monthlyExpenses)}</p>
                      </div>
                   </div>
                   <div className="text-right hidden sm:block">
                      <span className="text-xs text-stone-500">Ciroya Oranı</span>
                      <p className="text-sm text-stone-400 font-medium">%{stats.grossRevenue > 0 ? ((stats.monthlyExpenses / stats.grossRevenue) * 100).toFixed(1) : '0.0'}</p>
                   </div>
                </div>
                
                <div className="pt-5 mt-2 border-t border-stone-800/80">
                   <div className="flex justify-between items-end">
                      <div>
                        <p className="text-stone-500 text-[10px] uppercase tracking-wider mb-1">Dönem Sonu</p>
                        <p className="text-stone-300 text-sm font-bold">NET KÂR / ZARAR</p>
                      </div>
                      <div className="text-right">
                         <h2 className={`text-4xl font-black tracking-tight ${stats.netProfit >= 0 ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.2)]' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.2)]'}`}>
                           {stats.netProfit >= 0 ? '+' : ''}₺{formatCurrency(stats.netProfit)}
                         </h2>
                         <p className={`text-xs mt-1 font-medium ${stats.netProfit >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                           Net Kâr Marjı: %{stats.grossRevenue > 0 ? ((stats.netProfit / stats.grossRevenue) * 100).toFixed(1) : '0.0'}
                         </p>
                      </div>
                   </div>
                </div>
             </div>
          </div>

          {/* Sağ Taraftaki KPI Grid (2x2 Dörtlü Düzen) */}
          <div className="lg:col-span-1 grid grid-cols-2 gap-4 h-full">
             <div className="bg-stone-900 border border-stone-800 hover:border-stone-700 transition-all duration-300 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden group shadow-lg">
                <div className="absolute -bottom-6 -right-6 text-6xl opacity-5 group-hover:scale-110 transition-transform">🍔</div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">📝</div>
                <p className="text-stone-400 text-[11px] uppercase tracking-wider mb-1 font-bold">Kayıtlı Ürün</p>
                <p className="text-3xl font-black text-white">{loading ? '...' : stats.totalProducts}</p>
             </div>
             
             <div className="bg-stone-900 border border-stone-800 hover:border-stone-700 transition-all duration-300 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden group shadow-lg">
                <div className="absolute -bottom-6 -right-6 text-6xl opacity-5 group-hover:scale-110 transition-transform">🧪</div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(59,130,246,0.15)]">⚖️</div>
                <p className="text-stone-400 text-[11px] uppercase tracking-wider mb-1 font-bold">Hammadde</p>
                <p className="text-3xl font-black text-white">{loading ? '...' : stats.totalIngredients}</p>
             </div>

             <div 
                onClick={() => stats.criticalStockCount > 0 && setShowCriticalModal(true)}
                className={`bg-stone-900 border ${stats.criticalStockCount > 0 ? 'border-red-900/50 hover:border-red-500/50 cursor-pointer' : 'border-stone-800'} transition-all duration-300 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden group shadow-lg`}>
                <div className="absolute -bottom-6 -right-6 text-6xl opacity-5 group-hover:scale-110 transition-transform">⚠️</div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stats.criticalStockCount > 0 ? 'bg-red-500/10 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse' : 'bg-stone-800 text-stone-500'}`}>🔔</div>
                <p className="text-stone-400 text-[11px] uppercase tracking-wider mb-1 font-bold">Kritik Stok</p>
                <p className={`text-3xl font-black ${stats.criticalStockCount > 0 ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'text-stone-300'}`}>{loading ? '...' : stats.criticalStockCount}</p>
             </div>

             <div className="bg-stone-900 border border-emerald-900/30 hover:border-emerald-500/50 transition-all duration-300 rounded-2xl p-5 flex flex-col justify-center relative overflow-hidden group shadow-lg">
                <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>
                <div className="absolute -bottom-6 -right-6 text-6xl opacity-5 group-hover:scale-110 transition-transform">💎</div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(16,185,129,0.15)]">💰</div>
                <p className="text-stone-400 text-[11px] uppercase tracking-wider mb-1 font-bold relative z-10">Stok Değeri</p>
                <p className="text-2xl font-black text-emerald-400 tracking-tight truncate relative z-10">
                  {loading ? '...' : `₺${formatCurrency(stats.totalStockValue)}`}
                </p>
             </div>
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

        {/* Kritik Stok Modalı */}
        {showCriticalModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-stone-800 flex justify-between items-center bg-red-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center text-xl animate-pulse">
                    ⚠️
                  </div>
                  <div>
                    <h2 className="font-bold text-lg text-white">Kritik Stok Uyarıları</h2>
                    <p className="text-stone-400 text-sm">Stoğu tükenmek üzere olan veya tükenen hammaddeler</p>
                  </div>
                </div>
                <button onClick={() => setShowCriticalModal(false)} className="text-stone-500 hover:text-white transition-colors">
                  ✕
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                {stats.criticalItems.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-4 rounded-xl bg-stone-800/50 border border-stone-800 hover:border-red-900/50 transition-colors">
                    <div>
                      <p className="font-bold text-white">{item.name}</p>
                      <p className="text-stone-400 text-xs mt-1">
                        Kritik Seviye: <span className="text-stone-300">{item.critical_stock_level} {item.unit}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-stone-500 mb-1">Mevcut Stok</p>
                      <p className={`font-bold text-lg ${item.stock_quantity <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                        {item.stock_quantity} {item.unit}
                      </p>
                    </div>
                  </div>
                ))}
                {stats.criticalItems.length === 0 && (
                  <div className="text-center p-6 text-stone-500">
                    Şu an kritik seviyede stok bulunmuyor.
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-stone-800 bg-stone-900/50 flex justify-end">
                <button 
                  onClick={() => router.push('/dashboard/hammaddeler')}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  Hammaddelere Git
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
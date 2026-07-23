'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency } from "@/lib/format";
import { useAppTour } from '@/hooks/useAppTour'

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
    try {
      // 1. Veritabanından sunucu bazlı hesaplanmış verileri çek (Çok Hızlı)
      const { data, error } = await supabase.rpc('get_dashboard_stats', { days_ago: 30 })
      
      if (error) {
        devError('RPC Hatası detayları:', error.message, error.details, error.hint)
        throw error
      }

      const rpcStats = data as any;

      // 2. Canlı Kurlar (Sadece Dolar/Altın vs. hesaplaması için)
      let rates: any = null
      try {
        const res = await fetch('/api/exchange-rates')
        const rateData = await res.json()
        if (rateData.success) rates = rateData.rates
      } catch (e) { devError('Kurlar çekilemedi', e) }

      // 3. Yatırımların canlı kurla çarpılması
      const totalInvestments = (rpcStats.investmentsList || []).reduce((t: number, inv: any) => {
          const rate = rates ? rates[inv.asset_type] : inv.average_cost
          return t + (Number(inv.quantity) * rate)
      }, 0)

      const netRev = Number(rpcStats.grossRevenue) - Number(rpcStats.totalDiscounts)

      setStats({
        totalProducts: Number(rpcStats.totalProducts) || 0,
        totalIngredients: Number(rpcStats.totalIngredients) || 0,
        criticalStockCount: Number(rpcStats.criticalStockCount) || 0,
        monthlyExpenses: Number(rpcStats.monthlyExpenses) || 0,
        lowMarginProducts: Number(rpcStats.lowMarginProducts) || 0,
        totalStockValue: Number(rpcStats.totalStockValue) || 0,
        grossRevenue: Number(rpcStats.grossRevenue) || 0,
        totalDiscounts: Number(rpcStats.totalDiscounts) || 0,
        netRevenue: netRev,
        totalCogs: Number(rpcStats.totalCogs) || 0,
        netProfit: netRev - Number(rpcStats.totalCogs) - Number(rpcStats.monthlyExpenses),
        targetMargin: Number(rpcStats.targetMargin) || 35,
        criticalItems: rpcStats.criticalItems || [],
        totalCash: Number(rpcStats.totalCash) || 0,
        totalBank: Number(rpcStats.totalBank) || 0,
        totalInvestments
      })
    } catch (err) {
      devError('Dashboard verileri çekilirken hata oluştu:', err)
    } finally {
      setLoading(false)
    }
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

  useAppTour('dashboard_main', [
    {
      element: '#tour-dash-alerts',
      popover: {
        title: 'Akıllı Uyarılar 🚨',
        description: 'Stoklarınız azaldığında veya kârlılığınız düştüğünde sistem sizi burada uyarır.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '#tour-dash-financials',
      popover: {
        title: 'Finansal Özet 💼',
        description: 'Tüm nakit, banka ve yatırım varlıklarınızı tek ekrandan anlık takip edin.',
        side: 'top',
        align: 'start'
      }
    },
    {
      element: '#tour-dash-pnl',
      popover: {
        title: 'Kâr / Zarar Şelalesi 📊',
        description: 'Satışlardan kasaya giren net paraya, oradan da aylık kârınıza kadar paranın yolculuğunu görün.',
        side: 'top',
        align: 'center'
      }
    }
  ], 1200);

  return (
    <div className="min-h-screen bg-stone-950 text-white p-4 md:p-8 overflow-y-auto">
      
      {/* 🌟 Header Section */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-amber-400 tracking-tight flex items-center gap-3">
            <span className="text-4xl">👋</span> Hoş Geldiniz, CEO
          </h1>
          <p className="text-stone-400 mt-1">İşletmenizin finansal ve operasyonel durumu parmaklarınızın ucunda.</p>
        </div>
      </header>

      {/* ⚡ Smart Alerts (Kritik Stok & Düşük Kâr) */}
      {!loading && (stats.criticalStockCount > 0 || stats.lowMarginProducts > 0) && (
        <div id="tour-dash-alerts" className="flex flex-col gap-4 mb-8">
          {stats.criticalStockCount > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-md rounded-3xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[0_0_30px_rgba(239,68,68,0.1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-bl-full -z-10" />
              <div className="flex items-start md:items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center text-red-500 text-2xl animate-pulse shadow-inner">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-xl font-bold text-red-400">Kritik Stok Uyarısı</h3>
                  <p className="text-red-300/80 text-sm mt-1">
                    <span className="font-bold text-white">{stats.criticalStockCount} adet</span> hammaddenin stoğu kritik seviyenin altında!
                  </p>
                </div>
              </div>
              <a 
                href={`https://wa.me/?text=${encodeURIComponent(`*Acil Sipariş Listesi*\n\n${stats.criticalItems.map(i => `- ${i.name} (Kalan: ${i.stock_quantity} ${i.unit})`).join('\n')}`)}`}
                target="_blank"
                className="bg-red-500 hover:bg-red-400 text-stone-950 font-black py-3 px-6 rounded-2xl text-sm transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:-translate-y-1 whitespace-nowrap flex items-center gap-2"
              >
                <span>📱</span> Toptancıya Gönder
              </a>
            </div>
          )}

          {stats.lowMarginProducts > 0 && (
            <div className="bg-orange-500/10 border border-orange-500/20 backdrop-blur-md rounded-3xl p-6 flex flex-col md:flex-row items-center gap-4 shadow-[0_0_30px_rgba(249,115,22,0.1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-bl-full -z-10" />
              <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center text-orange-500 text-2xl shadow-inner">
                📉
              </div>
              <div>
                <h3 className="text-xl font-bold text-orange-400">Düşük Kar Marjı</h3>
                <p className="text-orange-300/80 text-sm mt-1">
                  <span className="font-bold text-white">{stats.lowMarginProducts} adet</span> ürünün kar marjı hedeflenen %{stats.targetMargin}'in altında. Fiyat motorunu kontrol edin.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 💼 Varlıklarım (Financials) */}
      <h3 className="text-lg font-bold mb-6 text-stone-300 flex items-center gap-2 uppercase tracking-wider"><span>💼</span> Finansal Özet</h3>
      <div id="tour-dash-financials" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-all shadow-xl">
           <div className="absolute -right-4 -bottom-4 text-8xl opacity-[0.03] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">💵</div>
           <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-xl border border-emerald-500/20 mb-4">💵</div>
           <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Nakit Kasa</p>
           <h2 className="text-2xl font-black text-white">{formatCurrency(stats.totalCash)}</h2>
        </div>
        <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 relative overflow-hidden group hover:border-blue-500/30 transition-all shadow-xl">
           <div className="absolute -right-4 -bottom-4 text-8xl opacity-[0.03] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">🏦</div>
           <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 text-xl border border-blue-500/20 mb-4">🏦</div>
           <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Banka Hesapları</p>
           <h2 className="text-2xl font-black text-white">{formatCurrency(stats.totalBank)}</h2>
        </div>
        <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 relative overflow-hidden group hover:border-purple-500/30 transition-all shadow-xl cursor-pointer" onClick={() => router.push('/dashboard/yatirimlar')}>
           <div className="absolute -right-4 -bottom-4 text-8xl opacity-[0.03] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">📈</div>
           <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500 text-xl border border-purple-500/20 mb-4">📈</div>
           <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Yatırımlar Değeri</p>
           <h2 className="text-2xl font-black text-purple-400">{formatCurrency(stats.totalInvestments)}</h2>
        </div>
        <div className="bg-gradient-to-br from-stone-900 to-amber-950/20 border border-amber-500/30 rounded-3xl p-6 relative overflow-hidden group shadow-[0_0_30px_rgba(245,158,11,0.1)]">
           <div className="absolute -right-4 -bottom-4 text-8xl opacity-10 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500">👑</div>
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0 opacity-50"></div>
           <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-500 text-xl border border-amber-500/30 mb-4 shadow-inner">👑</div>
           <p className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-1">Toplam Net Varlık</p>
           <h2 className="text-3xl font-black text-amber-400 tracking-tight drop-shadow-md">{formatCurrency((stats.totalCash + stats.totalBank + stats.totalInvestments))}</h2>
        </div>
      </div>

      {/* 📊 Operasyonel Metrikler */}
      <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-stone-300 flex items-center gap-2 uppercase tracking-wider"><span>📊</span> Operasyonel Analiz</h3>
          <span className="text-xs font-bold bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full border border-amber-500/20">Son 30 Gün</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {/* P&L (Kâr/Zarar) Tablosu - 2 Sütun */}
        <div id="tour-dash-pnl" className="lg:col-span-2 bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-8 relative overflow-hidden shadow-2xl">
            <div className={`absolute -top-32 -right-32 w-64 h-64 blur-[100px] opacity-20 transition-all duration-1000 ${stats.netProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            
            <h4 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-8 flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${stats.netProfit >= 0 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse' : 'bg-red-500'}`}></div>
              Net Kâr / Zarar Şelalesi
            </h4>
            
            <div className="space-y-4 relative z-10">
              <div className="flex justify-between items-center p-4 rounded-2xl bg-stone-950 border border-stone-800/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 text-xl border border-blue-500/20">📈</div>
                    <div>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">Brüt Satışlar</p>
                        <p className="font-black text-white text-xl">{formatCurrency(stats.grossRevenue)}</p>
                    </div>
                  </div>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-stone-950 border border-stone-800/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 text-xl border border-red-500/20">✂️</div>
                    <div>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">- İndirim ve İkramlar</p>
                        <p className="font-black text-red-400 text-xl">{formatCurrency(stats.totalDiscounts)}</p>
                    </div>
                  </div>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/20">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl border border-emerald-500/30">💵</div>
                    <div>
                        <p className="text-emerald-400/80 text-xs font-bold uppercase tracking-wider">NET SATIŞ (KASAYA GİREN)</p>
                        <p className="font-black text-emerald-400 text-xl">{formatCurrency(stats.netRevenue)}</p>
                    </div>
                  </div>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-stone-950 border border-stone-800/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-400 text-xl border border-orange-500/20">📦</div>
                    <div>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">- Satılan Malın Maliyeti (SMM)</p>
                        <p className="font-black text-orange-400 text-xl">{formatCurrency(stats.totalCogs)}</p>
                    </div>
                  </div>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-stone-950 border border-stone-800/50">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-400 text-xl border border-rose-500/20">💸</div>
                    <div>
                        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">- Operasyonel Giderler</p>
                        <p className="font-black text-rose-400 text-xl">{formatCurrency(stats.monthlyExpenses)}</p>
                    </div>
                  </div>
              </div>
              
              <div className="pt-6 mt-4 border-t border-stone-800">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-stone-500 text-[10px] font-bold uppercase tracking-wider mb-1">Dönem Sonu Sonuç</p>
                      <p className="text-stone-300 text-lg font-black tracking-tight">NET KÂR / ZARAR</p>
                    </div>
                    <div className="text-right">
                        <h2 className={`text-5xl font-black tracking-tight ${stats.netProfit >= 0 ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]' : 'text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]'}`}>
                          {stats.netProfit >= 0 ? '+' : ''}{formatCurrency(stats.netProfit)}
                        </h2>
                        <p className={`text-sm mt-2 font-bold bg-stone-950 inline-block px-3 py-1 rounded-full border ${stats.netProfit >= 0 ? 'text-emerald-500 border-emerald-500/20' : 'text-red-500 border-red-500/20'}`}>
                          Net Kâr Marjı: %{stats.grossRevenue > 0 ? ((stats.netProfit / stats.grossRevenue) * 100).toFixed(1) : '0.0'}
                        </p>
                    </div>
                  </div>
              </div>
            </div>
        </div>

        {/* Sağ Taraftaki KPI Grid (2x2 Dörtlü Düzen) */}
        <div className="lg:col-span-1 grid grid-cols-2 gap-4 h-full">
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden group shadow-xl">
              <div className="absolute -bottom-6 -right-6 text-7xl opacity-[0.03] group-hover:scale-110 transition-transform">🍔</div>
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl mb-4 border border-amber-500/20">📝</div>
              <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Kayıtlı Ürün</p>
              <p className="text-4xl font-black text-white">{loading ? '...' : stats.totalProducts}</p>
            </div>
            
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden group shadow-xl">
              <div className="absolute -bottom-6 -right-6 text-7xl opacity-[0.03] group-hover:scale-110 transition-transform">🧪</div>
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl mb-4 border border-blue-500/20">⚖️</div>
              <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Hammadde</p>
              <p className="text-4xl font-black text-white">{loading ? '...' : stats.totalIngredients}</p>
            </div>

            <div 
              onClick={() => stats.criticalStockCount > 0 && setShowCriticalModal(true)}
              className={`bg-gradient-to-br from-stone-900 to-stone-950 border ${stats.criticalStockCount > 0 ? 'border-red-500/30 cursor-pointer shadow-[0_0_20px_rgba(239,68,68,0.15)]' : 'border-stone-800 shadow-xl'} rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden group transition-all`}>
              <div className="absolute -bottom-6 -right-6 text-7xl opacity-[0.03] group-hover:scale-110 transition-transform">⚠️</div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4 border ${stats.criticalStockCount > 0 ? 'bg-red-500/20 text-red-500 border-red-500/30 animate-pulse' : 'bg-stone-800 text-stone-500 border-stone-700'}`}>🔔</div>
              <p className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1">Kritik Stok</p>
              <p className={`text-4xl font-black ${stats.criticalStockCount > 0 ? 'text-red-400' : 'text-stone-300'}`}>{loading ? '...' : stats.criticalStockCount}</p>
            </div>

            <div className="bg-gradient-to-br from-stone-900 to-emerald-950/10 border border-stone-800 hover:border-emerald-500/30 transition-all duration-300 rounded-3xl p-6 flex flex-col justify-center relative overflow-hidden group shadow-xl">
              <div className="absolute -bottom-6 -right-6 text-7xl opacity-[0.03] group-hover:scale-110 transition-transform">💎</div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl mb-4 border border-emerald-500/20">💰</div>
              <p className="text-stone-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 relative z-10">Stok Değeri</p>
              <p className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight truncate relative z-10">
                {loading ? '...' : `${formatCurrency(stats.totalStockValue)}`}
              </p>
            </div>
        </div>
      </div>

      {/* 🚀 Modül Navigasyonu (Uygulama Menüsü) */}
      <h3 className="text-lg font-bold mb-6 text-stone-300 flex items-center gap-2 uppercase tracking-wider"><span>🚀</span> Sistem Modülleri</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {modules.map(mod => (
          <div
            key={mod.path}
            onClick={() => router.push(mod.path)}
            className="group bg-stone-900 border border-stone-800 rounded-3xl p-6 hover:bg-stone-800/50 hover:border-amber-500/50 transition-all cursor-pointer shadow-lg hover:shadow-[0_10px_30px_rgba(245,158,11,0.1)] hover:-translate-y-1 relative overflow-hidden"
          >
            <div className="absolute -right-4 -bottom-4 text-7xl opacity-[0.02] group-hover:opacity-5 transition-opacity group-hover:scale-110">{mod.icon}</div>
            <div className="w-14 h-14 rounded-2xl bg-stone-950 border border-stone-800 group-hover:border-amber-500/30 flex items-center justify-center text-3xl mb-4 transition-colors">
              {mod.icon}
            </div>
            <h3 className="font-bold text-lg text-white group-hover:text-amber-400 transition-colors">{mod.title}</h3>
            <p className="text-stone-400 text-sm mt-2">{mod.desc}</p>
          </div>
        ))}
      </div>

      {/* Kritik Stok Modalı */}
      {showCriticalModal && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity">
          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setShowCriticalModal(false)} 
              className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-stone-800 hover:bg-red-500/20 hover:text-red-400 text-stone-400 transition-colors z-10"
            >
              ✕
            </button>
            <div className="p-8 pb-6 border-b border-stone-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center text-2xl border border-red-500/20 animate-pulse">
                  ⚠️
                </div>
                <div>
                  <h2 className="font-black text-xl text-white">Kritik Stok Uyarıları</h2>
                  <p className="text-stone-400 text-sm mt-1">Stoğu tükenmek üzere olan hammaddeler</p>
                </div>
              </div>
            </div>
            <div className="p-6 max-h-[50vh] overflow-y-auto space-y-4">
              {stats.criticalItems.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-4 rounded-2xl bg-stone-950 border border-stone-800 hover:border-red-500/30 transition-colors">
                  <div>
                    <p className="font-bold text-white text-lg">{item.name}</p>
                    <p className="text-stone-400 text-xs mt-1 font-bold uppercase tracking-wider">
                      Sınır: <span className="text-stone-300">{item.critical_stock_level} {item.unit}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mb-1">Mevcut</p>
                    <p className={`font-black text-2xl ${item.stock_quantity <= 0 ? 'text-red-500' : 'text-amber-500'}`}>
                      {item.stock_quantity} <span className="text-sm font-medium text-stone-400">{item.unit}</span>
                    </p>
                  </div>
                </div>
              ))}
              {stats.criticalItems.length === 0 && (
                <div className="text-center p-8 text-stone-500 font-medium">
                  Şu an kritik seviyede stok bulunmuyor.
                </div>
              )}
            </div>
            <div className="p-6 border-t border-stone-800 flex gap-4">
              <button 
                onClick={() => router.push('/dashboard/hammaddeler')}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:-translate-y-1"
              >
                HAMMADDELERE GİT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
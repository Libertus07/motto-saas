'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useNotification } from '@/components/NotificationProvider'
import { usePricingData } from '@/features/pricing/hooks/usePricingData'
import { usePricingCalculator } from '@/features/pricing/hooks/usePricingCalculator'
import { PricingHeader } from '@/features/pricing/components/PricingHeader'
import { PricingKpiMetrics } from '@/features/pricing/components/PricingKpiMetrics'
import { CalculationParameters } from '@/features/pricing/components/CalculationParameters'
import { SalesInputTab } from '@/features/pricing/components/tabs/SalesInputTab'
import { AnalysisTab } from '@/features/pricing/components/tabs/AnalysisTab'
import { ReportsTab } from '@/features/pricing/components/tabs/ReportsTab'
import { useAppTour } from '@/hooks/useAppTour'

export default function FiyatMotoruPage() {
  const [activeTab, setActiveTab] = useState<'sales' | 'results' | 'reports'>('sales')
  useAppTour('fiyat_motoru', [
    {
      element: '#tour-pricing-kpis',
      popover: { title: 'Günlük resmi görün', description: 'Ciro, gider ve tahmini kâr birlikte hesaplanır; önce bu özeti kontrol edin.' }
    },
    {
      element: '#tour-pricing-parameters',
      popover: { title: 'Hedef marjı belirleyin', description: 'Fiyat önerilerinin temelini oluşturan hedef ve maliyet parametrelerini buradan yönetin.' }
    },
    {
      element: '#tour-pricing-tabs',
      popover: { title: 'Üç adımlı karar akışı', description: 'Satış adetlerini girin, fiyat analizini inceleyin ve sonucu görsel raporlara taşıyın.' }
    }
  ])
  const [saving, setSaving] = useState(false)
  const { showAlert } = useNotification()

  const { products, setProducts, expenses, loading, realSalesMeta, settings, setSettings } = usePricingData()
  
  const { productSales, calculations, updateSales, adjustSalesByDelta } = usePricingCalculator(
    products,
    expenses,
    realSalesMeta,
    settings
  )

  const handleSaveCosts = async () => {
    setSaving(true)
    const supabase = createClient()
    try {
      for (const calc of calculations) {
        const { error } = await supabase
          .from('products')
          .update({ calculated_cost: calc.totalCost })
          .eq('id', calc.product.id)
        if (error) throw error
      }
      
      const { error: marginErr } = await supabase
        .from('settings')
        .upsert({ key: 'target_margin', value: settings.targetMargin.toString() })
      if (marginErr) throw marginErr

      setProducts(prev => prev.map(p => {
        const c = calculations.find(x => x.product.id === p.id)
        return c ? { ...p, calculated_cost: c.totalCost } : p
      }))
      
      showAlert('Birim maliyetler ürün kartlarına kaydedildi.', 'success')
    } catch (err: unknown) {
      console.error('Kaydetme hatası:', err)
      showAlert('Kaydetme işlemi başarısız oldu.', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <p className="text-stone-400 font-medium">Algoritma Hazırlanıyor...</p>
        </div>
      </div>
    )
  }

  const totalDailyRevenue = products.reduce((t, p) => t + (p.sale_price || 0) * (productSales[p.id]?.dailySales || 0), 0)
  
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

  const totalDailyProfit = calculations.reduce((t, c) => t + c.dailyProfit, 0)

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      <PricingHeader saving={saving} loading={loading} onSave={handleSaveCosts} />

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div id="tour-pricing-kpis">
          <PricingKpiMetrics
          productCount={products.length}
          totalDailyRevenue={totalDailyRevenue}
          dailyExpenses={dailyExpenses}
          totalDailyProfit={totalDailyProfit}
          />
        </div>

        <div id="tour-pricing-parameters">
          <CalculationParameters settings={settings} onSettingsChange={setSettings} />
        </div>

        <div id="tour-pricing-tabs" className="border-b border-stone-800 flex items-center overflow-x-auto scrollbar-none sticky top-[73px] z-20 bg-stone-950/80 backdrop-blur-xl">
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-4 sm:px-6 py-3.5 sm:py-4 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'sales'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            1. Satış Adetleri Gir
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 sm:px-6 py-3.5 sm:py-4 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'results'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            2. Fiyat Analizi
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 sm:px-6 py-3.5 sm:py-4 font-bold text-xs sm:text-sm border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            3. Görsel Raporlar
          </button>
        </div>

        {activeTab === 'sales' && (
          <SalesInputTab
            products={products}
            productSales={productSales}
            realSalesMeta={realSalesMeta}
            totalDailyRevenue={totalDailyRevenue}
            updateSales={updateSales}
            adjustSalesByDelta={adjustSalesByDelta}
          />
        )}

        {activeTab === 'results' && (
          <AnalysisTab calculations={calculations} />
        )}

        {activeTab === 'reports' && (
          <ReportsTab 
            calculations={calculations}
            productSales={productSales}
            totalDailyProfit={totalDailyProfit}
            dailyExpenses={dailyExpenses}
            settings={settings}
          />
        )}
      </main>
    </div>
  )
}

'use client'

import { useAppTour } from '@/hooks/useAppTour'
import { AnalysisTab } from '@/features/pricing/components/tabs/AnalysisTab'
import { ReportsTab } from '@/features/pricing/components/tabs/ReportsTab'
import { SalesInputTab } from '@/features/pricing/components/tabs/SalesInputTab'
import { CalculationParameters } from '@/features/pricing/components/CalculationParameters'
import { PricingHeader } from '@/features/pricing/components/PricingHeader'
import { PricingKpiMetrics } from '@/features/pricing/components/PricingKpiMetrics'
import { PricingErrorState, PricingLoadingState } from '@/features/pricing/components/PricingPageState'
import { PricingTabs } from '@/features/pricing/components/PricingTabs'
import { usePricingWorkspace } from '@/features/pricing/hooks/usePricingWorkspace'
import { PRICING_TOUR_STEPS } from '@/features/pricing/tour'

export default function FiyatMotoruPage() {
  useAppTour('fiyat_motoru', PRICING_TOUR_STEPS)
  const workspace = usePricingWorkspace()
  const { data, calculator, metrics } = workspace

  if (data.loading) return <PricingLoadingState />
  if (data.error) return <PricingErrorState error={data.error} onRetry={() => void data.refetch()} />

  return (
    <div className="min-h-screen bg-stone-950 pb-16 text-stone-100">
      <PricingHeader saving={workspace.saving} loading={data.loading} onSave={() => void workspace.saveCosts()} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-8 sm:py-8">
        <div id="tour-pricing-kpis">
          <PricingKpiMetrics
            productCount={data.products.length}
            totalDailyRevenue={metrics.totalDailyRevenue}
            dailyExpenses={metrics.dailyExpenses}
            totalDailyProfit={metrics.totalDailyProfit}
          />
        </div>
        <div id="tour-pricing-parameters">
          <CalculationParameters settings={data.settings} onSettingsChange={data.setSettings} />
        </div>
        <PricingTabs activeTab={workspace.activeTab} onChange={workspace.setActiveTab} />
        {workspace.activeTab === 'sales' && (
          <SalesInputTab
            products={data.products}
            productSales={calculator.productSales}
            realSalesMeta={data.realSalesMeta}
            totalDailyRevenue={metrics.totalDailyRevenue}
            updateSales={calculator.updateSales}
            adjustSalesByDelta={calculator.adjustSalesByDelta}
          />
        )}
        {workspace.activeTab === 'results' && <AnalysisTab calculations={calculator.calculations} />}
        {workspace.activeTab === 'reports' && (
          <ReportsTab
            calculations={calculator.calculations}
            productSales={calculator.productSales}
            totalDailyProfit={metrics.totalDailyProfit}
            dailyExpenses={metrics.dailyExpenses}
            settings={data.settings}
          />
        )}
      </main>
    </div>
  )
}

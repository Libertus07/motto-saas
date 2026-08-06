'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

import { useOrganization } from '@/context/OrganizationContext'
import { useAppTour } from '@/hooks/useAppTour'

import { useDashboardStats } from '../hooks/useDashboardStats'
import { CriticalStockDialog } from './CriticalStockDialog'
import { DashboardAlerts } from './DashboardAlerts'
import { DashboardHeader } from './DashboardHeader'
import { FinancialOverview } from './FinancialOverview'
import { ModuleGrid } from './ModuleGrid'
import { OperationsOverview } from './OperationsOverview'

export function DashboardWorkspace() {
  const { activeOrg } = useOrganization()
  const { error, loading, refresh, stats } = useDashboardStats()
  const [criticalStockOpen, setCriticalStockOpen] = useState(false)

  useAppTour(
    'dashboard_main',
    [
      {
        element: '#tour-dash-alerts',
        popover: {
          title: 'Akıllı uyarılar',
          description: 'Öncelikli stok ve kârlılık uyarılarını burada görebilirsiniz.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#tour-dash-financials',
        popover: {
          title: 'Finansal özet',
          description: 'Nakit, banka ve yatırım varlıklarınızı tek bakışta izleyin.',
          side: 'top',
          align: 'start',
        },
      },
      {
        element: '#tour-dash-pnl',
        popover: {
          title: 'Kâr ve zarar',
          description: 'Son 30 günlük gelirin ve maliyetlerin net sonuca etkisini inceleyin.',
          side: 'top',
          align: 'center',
        },
      },
    ],
    1200,
  )

  return (
    <div className="relative min-h-full bg-[#090807] text-stone-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.05),transparent_34%)]"
        aria-hidden="true"
      />
      <div className="relative mx-auto w-full max-w-[1720px] space-y-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <DashboardHeader organizationName={activeOrg?.name ?? 'Motto SaaS'} />

        {error ? (
          <div
            role="alert"
            className="flex flex-col gap-4 rounded-3xl border border-red-400/20 bg-red-400/[0.065] p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="max-w-2xl text-sm leading-6 font-medium text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:opacity-60"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              Tekrar dene
            </button>
          </div>
        ) : null}

        {!loading ? <DashboardAlerts stats={stats} onOpenCriticalStock={() => setCriticalStockOpen(true)} /> : null}
        <FinancialOverview loading={loading} stats={stats} />
        <OperationsOverview loading={loading} stats={stats} onOpenCriticalStock={() => setCriticalStockOpen(true)} />
        <ModuleGrid />
      </div>

      <CriticalStockDialog items={stats.criticalItems} open={criticalStockOpen} onOpenChange={setCriticalStockOpen} />
    </div>
  )
}

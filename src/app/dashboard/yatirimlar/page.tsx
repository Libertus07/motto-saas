'use client'

import { InvestmentMetrics } from '@/features/investments/components/InvestmentMetrics'
import { InvestmentModals } from '@/features/investments/components/InvestmentModals'
import { InvestmentPageHeader } from '@/features/investments/components/InvestmentPageHeader'
import { InvestmentsList } from '@/features/investments/components/InvestmentsList'
import { InvestmentToolbar } from '@/features/investments/components/InvestmentToolbar'
import { useInvestmentWorkspace } from '@/features/investments/hooks/useInvestmentWorkspace'

export default function YatirimlarPage() {
  const workspace = useInvestmentWorkspace()

  return (
    <div className="min-h-full bg-stone-950 pb-20 text-white">
      <InvestmentPageHeader {...workspace.header} />
      <main className="space-y-6 p-6 pt-0">
        <InvestmentMetrics {...workspace.metrics} />
        <InvestmentToolbar {...workspace.toolbar} />
        <InvestmentsList {...workspace.list} />
      </main>
      <InvestmentModals {...workspace.modals} />
    </div>
  )
}

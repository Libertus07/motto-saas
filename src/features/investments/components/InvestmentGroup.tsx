import { formatCurrency } from '@/lib/format'

import type { EnhancedInvestment, InvestmentListActions, InvestmentTransaction } from '../types'
import { getInvestmentGroupSummary, groupInvestmentsByPurchaseDate, type InvestmentGroupBy } from '../utils'
import { InvestmentCard } from './InvestmentCard'

type InvestmentGroupProps = InvestmentListActions & {
  name: string
  investments: EnhancedInvestment[]
  groupBy: InvestmentGroupBy
  transactionsByInvestmentId: Map<string, InvestmentTransaction[]>
  expandedInvestment: string | null
  setExpandedInvestment: (id: string | null) => void
  initiallyOpen: boolean
}

export function InvestmentGroup({
  name,
  investments,
  groupBy,
  transactionsByInvestmentId,
  expandedInvestment,
  setExpandedInvestment,
  initiallyOpen,
  ...actions
}: InvestmentGroupProps) {
  const summary = getInvestmentGroupSummary(investments)
  const dateGroups =
    groupBy === 'type' && name !== 'Gayrimenkul Mülkleri' ? groupInvestmentsByPurchaseDate(investments) : null
  const renderCards = (items: EnhancedInvestment[]) =>
    items.map((investment) => (
      <InvestmentCard
        key={investment.id}
        investment={investment}
        transactions={transactionsByInvestmentId.get(investment.id) ?? []}
        isExpanded={expandedInvestment === investment.id}
        onToggle={() => setExpandedInvestment(expandedInvestment === investment.id ? null : investment.id)}
        {...actions}
      />
    ))

  return (
    <details className="group overflow-hidden rounded-xl border border-stone-800 bg-stone-900" open={initiallyOpen}>
      <summary className="flex cursor-pointer list-none select-none flex-col items-start justify-between px-4 py-3 transition-colors hover:bg-stone-800/50 sm:flex-row sm:items-center">
        <span className="flex items-center gap-3">
          <span className="text-sm text-stone-500 transition-transform duration-300 group-open:rotate-90">▶</span>
          <span className="text-base font-bold text-amber-500">
            {name} <span className="ml-2 text-xs font-medium text-stone-500">({investments.length} kayıt)</span>
          </span>
        </span>
        <span className="mt-3 flex items-center gap-6 pl-7 text-sm sm:mt-0 sm:pl-0">
          <span>
            <span className="mr-2 font-medium text-stone-500">Toplam Değer:</span>
            <span className="font-bold text-white">{formatCurrency(summary.totalValue)}</span>
          </span>
          <span
            className={`rounded-md px-2 py-1 font-bold ${
              summary.isProfit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {summary.isProfit ? 'Kâr: +' : 'Zarar: '}
            {formatCurrency(summary.profit)}
          </span>
        </span>
      </summary>

      <div className="border-t border-stone-800/50 bg-stone-950/30 p-3 pt-0">
        {dateGroups ? (
          <div className="mt-3 flex flex-col gap-3">
            {Object.entries(dateGroups).map(([date, items]) => (
              <details
                key={date}
                className="group/date overflow-hidden rounded-lg border border-stone-800/50 bg-stone-900"
                open
              >
                <summary className="flex cursor-pointer list-none select-none items-center justify-between border-b border-stone-800/30 px-4 py-2 transition-colors hover:bg-stone-800/30">
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-stone-600 transition-transform group-open/date:rotate-90">▶</span>
                    <span className="text-sm font-bold text-stone-300">{date}</span>
                    <span className="text-xs text-stone-500">({items.length} kayıt)</span>
                  </span>
                </summary>
                <div className="flex flex-col gap-2 bg-stone-950/20 p-2">{renderCards(items)}</div>
              </details>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">{renderCards(investments)}</div>
        )}
      </div>
    </details>
  )
}

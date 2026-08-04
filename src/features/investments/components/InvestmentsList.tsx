import { useMemo } from 'react'

import type { EnhancedInvestment, InvestmentListActions, InvestmentTransaction } from '../types'
import type { InvestmentGroupBy } from '../utils'
import { InvestmentGroup } from './InvestmentGroup'

type InvestmentsListProps = InvestmentListActions & {
  loading: boolean
  groupedInvestments: Record<string, EnhancedInvestment[]>
  groupBy: InvestmentGroupBy
  transactions: InvestmentTransaction[]
  expandedInvestment: string | null
  setExpandedInvestment: (id: string | null) => void
}

export function InvestmentsList({
  loading,
  groupedInvestments,
  groupBy,
  transactions,
  expandedInvestment,
  setExpandedInvestment,
  ...actions
}: InvestmentsListProps) {
  const transactionsByInvestmentId = useMemo(() => {
    const index = new Map<string, InvestmentTransaction[]>()
    for (const transaction of transactions) {
      const current = index.get(transaction.investment_id) ?? []
      current.push(transaction)
      index.set(transaction.investment_id, current)
    }
    return index
  }, [transactions])

  if (loading) return <div className="py-10 text-center text-stone-500">Yükleniyor...</div>

  const groups = Object.entries(groupedInvestments)
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900 p-10 text-center text-stone-500">
        Henüz bir yatırımınız bulunmuyor. &quot;Yeni Yatırım Yap&quot; butonuyla ilk varlığınızı ekleyebilirsiniz.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(([name, investments], index) => (
        <InvestmentGroup
          key={name}
          name={name}
          investments={investments}
          groupBy={groupBy}
          transactionsByInvestmentId={transactionsByInvestmentId}
          expandedInvestment={expandedInvestment}
          setExpandedInvestment={setExpandedInvestment}
          initiallyOpen={index === 0}
          {...actions}
        />
      ))}
    </div>
  )
}

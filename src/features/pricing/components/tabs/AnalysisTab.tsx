import { useMemo, useState } from 'react'

import { filterPricingCalculations, getPricingAnalysisStats, type PricingAnalysisFilter } from '../../analysis-utils'
import type { Calculation } from '../../types'
import { AnalysisFilters } from '../analysis/AnalysisFilters'
import { AnalysisResults } from '../analysis/AnalysisResults'
import { AnalysisSummary } from '../analysis/AnalysisSummary'

export function AnalysisTab({ calculations }: { calculations: Calculation[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PricingAnalysisFilter>('tumu')
  const stats = useMemo(() => getPricingAnalysisStats(calculations), [calculations])
  const filteredCalculations = useMemo(
    () => filterPricingCalculations(calculations, search, filter),
    [calculations, filter, search],
  )

  return (
    <div className="space-y-4">
      <AnalysisSummary stats={stats} activeFilter={filter} onFilterChange={setFilter} />
      <AnalysisFilters
        search={search}
        filter={filter}
        counts={{ total: calculations.length, ...stats }}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
      />
      <AnalysisResults calculations={filteredCalculations} />
    </div>
  )
}

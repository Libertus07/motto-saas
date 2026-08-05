import { useMemo } from 'react'

import { buildLossAnalysis } from '../../loss-analysis'
import type { Movement, ZayiDateFilter, ZayiSortBy } from '../../types'
import { LossFilters } from '../loss/LossFilters'
import { LossMovementGroups } from '../loss/LossMovementGroups'
import { LossSummary } from '../loss/LossSummary'

type LossAnalysisTabProps = {
  movements: Movement[]
  searchTerm: string
  dateFilter: ZayiDateFilter
  sortBy: ZayiSortBy
  expandedDates: string[]
  onSearchChange: (value: string) => void
  onDateFilterChange: (value: ZayiDateFilter) => void
  onSortByChange: (value: ZayiSortBy) => void
  onToggleDate: (dateKey: string) => void
}

export function LossAnalysisTab(props: LossAnalysisTabProps) {
  const analysis = useMemo(
    () =>
      buildLossAnalysis(props.movements, {
        searchTerm: props.searchTerm,
        dateFilter: props.dateFilter,
        sortBy: props.sortBy,
      }),
    [props.movements, props.searchTerm, props.dateFilter, props.sortBy],
  )

  return (
    <div className="space-y-6">
      <LossSummary total={analysis.total} topProducts={analysis.topProducts} />
      <LossFilters {...props} />
      <LossMovementGroups
        groups={analysis.groups}
        expandedDates={props.expandedDates}
        onToggleDate={props.onToggleDate}
      />
    </div>
  )
}

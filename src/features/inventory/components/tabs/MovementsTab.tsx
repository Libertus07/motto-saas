import { useMemo } from 'react'

import {
  filterMovements,
  getActiveMovementFilters,
  groupMovementsByDate,
  summarizeMovements,
} from '../../movement-utils'
import type { Movement, MovementDateFilter, MovementTypeFilter } from '../../types'
import { MovementFilters } from '../movements/MovementFilters'
import { MovementGroupList } from '../movements/MovementGroupList'
import { MovementSummary } from '../movements/MovementSummary'

type MovementsTabProps = {
  movements: Movement[]
  searchTerm: string
  typeFilter: MovementTypeFilter
  dateFilter: MovementDateFilter
  startDate: string
  endDate: string
  page: number
  collapsedDates: Set<string>
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: MovementTypeFilter) => void
  onDateFilterChange: (value: MovementDateFilter) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onPageChange: (page: number) => void
  onClearFilters: () => void
  onToggleDate: (dateKey: string) => void
  onExpandAll: () => void
  onCollapseAll: (dateKeys: string[]) => void
}

const daysPerPage = 7

export function MovementsTab(props: MovementsTabProps) {
  const filteredMovements = useMemo(
    () =>
      filterMovements({
        movements: props.movements,
        searchTerm: props.searchTerm,
        typeFilter: props.typeFilter,
        dateFilter: props.dateFilter,
        startDate: props.startDate,
        endDate: props.endDate,
      }),
    [props.dateFilter, props.endDate, props.movements, props.searchTerm, props.startDate, props.typeFilter],
  )
  const groups = useMemo(() => groupMovementsByDate(filteredMovements), [filteredMovements])
  const summary = useMemo(() => summarizeMovements(filteredMovements), [filteredMovements])
  const activeFilters = useMemo(
    () =>
      getActiveMovementFilters({
        searchTerm: props.searchTerm,
        typeFilter: props.typeFilter,
        dateFilter: props.dateFilter,
        startDate: props.startDate,
        endDate: props.endDate,
      }),
    [props.dateFilter, props.endDate, props.searchTerm, props.startDate, props.typeFilter],
  )

  const totalPages = Math.max(1, Math.ceil(groups.length / daysPerPage))
  const safePage = Math.min(props.page, totalPages)
  const visibleGroups = groups.slice((safePage - 1) * daysPerPage, safePage * daysPerPage)

  return (
    <div className="space-y-6">
      <MovementFilters
        searchTerm={props.searchTerm}
        typeFilter={props.typeFilter}
        dateFilter={props.dateFilter}
        startDate={props.startDate}
        endDate={props.endDate}
        activeFilters={activeFilters}
        onSearchChange={props.onSearchChange}
        onTypeFilterChange={props.onTypeFilterChange}
        onDateFilterChange={props.onDateFilterChange}
        onStartDateChange={props.onStartDateChange}
        onEndDateChange={props.onEndDateChange}
        onClear={props.onClearFilters}
      />
      <MovementSummary
        summary={summary}
        onExpandAll={props.onExpandAll}
        onCollapseAll={() => props.onCollapseAll(groups.map((group) => group.dateKey))}
      />
      <MovementGroupList
        groups={visibleGroups}
        collapsedDates={props.collapsedDates}
        onToggleDate={props.onToggleDate}
      />
      {totalPages > 1 ? (
        <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-900 p-3">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => props.onPageChange(safePage - 1)}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Geri
          </button>
          <span className="text-sm text-stone-400">
            Sayfa {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() => props.onPageChange(safePage + 1)}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            İleri
          </button>
        </div>
      ) : null}
    </div>
  )
}

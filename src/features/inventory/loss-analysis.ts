import { formatDate } from '../../lib/format'

import type { Movement, ZayiDateFilter, ZayiSortBy } from './types'

export type LossProduct = { name: string; total: number }
export type LossMovementGroup = { dateKey: string; items: Movement[]; total: number }

type BuildLossAnalysisOptions = {
  searchTerm: string
  dateFilter: ZayiDateFilter
  sortBy: ZayiSortBy
  now?: Date
}

function movementLoss(movement: Movement) {
  return movement.quantity * (movement.unit_price || 0)
}

function isWithinDateFilter(createdAt: string, filter: ZayiDateFilter, now: Date) {
  if (filter === 'tumu') return true

  const movementDate = new Date(createdAt)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  if (filter === 'bugun') return movementDate >= today
  if (filter === 'bu_hafta') {
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)
    return movementDate >= lastWeek
  }

  return movementDate.getMonth() === today.getMonth() && movementDate.getFullYear() === today.getFullYear()
}

function sortLossMovements(movements: Movement[], sortBy: ZayiSortBy) {
  return [...movements].sort((left, right) => {
    if (sortBy === 'tarih_yeni') return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    if (sortBy === 'tarih_eski') return new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    if (sortBy === 'tutar_yuksek') return movementLoss(right) - movementLoss(left)
    return movementLoss(left) - movementLoss(right)
  })
}

export function buildLossAnalysis(movements: Movement[], options: BuildLossAnalysisOptions) {
  const now = options.now ?? new Date()
  const normalizedSearch = options.searchTerm.trim().toLocaleLowerCase('tr-TR')

  const filteredMovements = sortLossMovements(
    movements.filter((movement) => {
      if (movement.movement_type !== 'fire') return false
      const searchableText = `${movement.materials?.name ?? ''} ${movement.note ?? ''}`.toLocaleLowerCase('tr-TR')
      return (
        searchableText.includes(normalizedSearch) && isWithinDateFilter(movement.created_at, options.dateFilter, now)
      )
    }),
    options.sortBy,
  )

  const productTotals = new Map<string, number>()
  let total = 0

  for (const movement of filteredMovements) {
    const loss = movementLoss(movement)
    const name = movement.materials?.name || 'Bilinmeyen'
    total += loss
    productTotals.set(name, (productTotals.get(name) ?? 0) + loss)
  }

  const topProducts = [...productTotals.entries()]
    .map(([name, productTotal]) => ({ name, total: productTotal }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 3)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const grouped = new Map<string, Movement[]>()

  for (const movement of filteredMovements) {
    const date = new Date(movement.created_at)
    const dateKey =
      date.toDateString() === now.toDateString()
        ? 'Bugün'
        : date.toDateString() === yesterday.toDateString()
          ? 'Dün'
          : formatDate(date)
    grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), movement])
  }

  const groups: LossMovementGroup[] = [...grouped.entries()].map(([dateKey, items]) => ({
    dateKey,
    items,
    total: items.reduce((sum, movement) => sum + movementLoss(movement), 0),
  }))

  return { filteredMovements, total, topProducts, groups }
}

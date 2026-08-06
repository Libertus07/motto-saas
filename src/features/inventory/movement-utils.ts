import type { Movement, MovementDateFilter, MovementTypeFilter } from './types'

export type MovementGroup = { dateKey: string; dateLabel: string; items: Movement[] }

const toLocalDateKey = (date: Date) =>
  [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')

export function filterMovements({
  movements,
  searchTerm,
  typeFilter,
  dateFilter,
  startDate,
  endDate,
  now = new Date(),
}: {
  movements: Movement[]
  searchTerm: string
  typeFilter: MovementTypeFilter
  dateFilter: MovementDateFilter
  startDate: string
  endDate: string
  now?: Date
}) {
  const search = searchTerm.trim().toLocaleLowerCase('tr-TR')
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  return movements.filter((movement) => {
    const materialName = movement.materials?.name?.toLocaleLowerCase('tr-TR') || ''
    const note = movement.note?.toLocaleLowerCase('tr-TR') || ''
    if (search && !materialName.includes(search) && !note.includes(search)) return false
    if (typeFilter !== 'tumu' && movement.movement_type !== typeFilter) return false
    if (dateFilter === 'tumu') return true

    const movementDate = new Date(movement.created_at)
    if (dateFilter === 'bugun') return movementDate >= todayStart
    if (dateFilter === 'bu_hafta') return movementDate >= weekStart
    if (dateFilter === 'bu_ay') {
      return (
        movementDate.getMonth() === todayStart.getMonth() && movementDate.getFullYear() === todayStart.getFullYear()
      )
    }

    const dateKey = movement.created_at.split('T')[0]
    return (!startDate || dateKey >= startDate) && (!endDate || dateKey <= endDate)
  })
}

export function groupMovementsByDate(movements: Movement[], now = new Date()): MovementGroup[] {
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const todayKey = toLocalDateKey(now)
  const yesterdayKey = toLocalDateKey(yesterday)
  const groups = new Map<string, MovementGroup>()

  for (const movement of movements) {
    const date = new Date(movement.created_at)
    const dateKey = toLocalDateKey(date)
    const dateLabel =
      dateKey === todayKey
        ? 'Bugün'
        : dateKey === yesterdayKey
          ? 'Dün'
          : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
    const group = groups.get(dateKey)
    if (group) group.items.push(movement)
    else groups.set(dateKey, { dateKey, dateLabel, items: [movement] })
  }
  return [...groups.values()]
}

export function summarizeMovements(movements: Movement[]) {
  const summary = { total: movements.length, giris: 0, cikis: 0, fire: 0, sayim: 0, control: 0 }
  for (const movement of movements) {
    if (movement.movement_type === 'giris') summary.giris += 1
    else if (movement.movement_type === 'cikis') summary.cikis += 1
    else if (movement.movement_type === 'fire') summary.fire += 1
    else if (movement.movement_type === 'sayim') summary.sayim += 1
  }
  summary.control = summary.fire + summary.sayim
  return summary
}

export function getActiveMovementFilters({
  searchTerm,
  typeFilter,
  dateFilter,
  startDate,
  endDate,
}: {
  searchTerm: string
  typeFilter: MovementTypeFilter
  dateFilter: MovementDateFilter
  startDate: string
  endDate: string
}) {
  const filters: string[] = []
  if (searchTerm.trim()) filters.push(`Arama: "${searchTerm.trim()}"`)
  const typeLabels: Record<MovementTypeFilter, string> = {
    tumu: 'Tümü',
    giris: 'Giriş',
    cikis: 'Çıkış',
    fire: 'Fire',
    sayim: 'Sayım',
  }
  if (typeFilter !== 'tumu') filters.push(`Tür: ${typeLabels[typeFilter]}`)
  const dateLabels: Record<MovementDateFilter, string> = {
    bugun: 'Bugün',
    bu_hafta: 'Son 7 Gün',
    bu_ay: 'Bu Ay',
    tumu: 'Tüm Zamanlar',
    custom: 'Özel Aralık',
  }
  if (dateFilter === 'custom') filters.push(`Tarih: ${startDate || '...'} → ${endDate || '...'}`)
  else if (dateFilter !== 'tumu') filters.push(`Tarih: ${dateLabels[dateFilter]}`)
  return filters
}

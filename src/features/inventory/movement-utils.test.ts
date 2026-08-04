import { describe, expect, it } from 'vitest'

import type { Movement } from './types'
import { filterMovements, groupMovementsByDate, summarizeMovements } from './movement-utils'

const movements = [
  {
    id: '1',
    movement_type: 'giris',
    created_at: '2026-08-03T08:00:00',
    note: 'Sabah',
    materials: { name: 'Süt', unit: 'L' },
  },
  {
    id: '2',
    movement_type: 'fire',
    created_at: '2026-08-02T08:00:00',
    note: 'Bozuk',
    materials: { name: 'Krema', unit: 'L' },
  },
] as Movement[]

describe('inventory movement workspace rules', () => {
  it('filters by tenant-visible content, type and date', () => {
    expect(
      filterMovements({
        movements,
        searchTerm: 'süt',
        typeFilter: 'giris',
        dateFilter: 'bugun',
        startDate: '',
        endDate: '',
        now: new Date('2026-08-03T12:00:00'),
      }),
    ).toEqual([movements[0]])
  })

  it('groups dates and calculates summary in linear time', () => {
    const groups = groupMovementsByDate(movements, new Date('2026-08-03T12:00:00'))
    expect(groups.map((group) => group.dateLabel)).toEqual(['Bugün', 'Dün'])
    expect(summarizeMovements(movements)).toMatchObject({ total: 2, giris: 1, fire: 1, control: 1 })
  })
})

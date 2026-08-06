import { describe, expect, it } from 'vitest'

import { buildLossAnalysis } from './loss-analysis'
import type { Movement } from './types'

const movements: Movement[] = [
  {
    id: '1',
    material_id: 'a',
    movement_type: 'fire',
    quantity: 2,
    unit_price: 10,
    note: 'Kırık',
    created_at: '2026-08-06T10:00:00Z',
    materials: { name: 'Süt', unit: 'lt' },
  },
  {
    id: '2',
    material_id: 'b',
    movement_type: 'fire',
    quantity: 1,
    unit_price: 40,
    note: '',
    created_at: '2026-08-05T10:00:00Z',
    materials: { name: 'Kahve', unit: 'kg' },
  },
  {
    id: '3',
    material_id: 'a',
    movement_type: 'giris',
    quantity: 10,
    unit_price: 10,
    note: '',
    created_at: '2026-08-06T09:00:00Z',
    materials: { name: 'Süt', unit: 'lt' },
  },
]

describe('buildLossAnalysis', () => {
  it('yalnızca fire hareketlerini toplar ve maliyete göre sıralar', () => {
    const result = buildLossAnalysis(movements, {
      searchTerm: '',
      dateFilter: 'tumu',
      sortBy: 'tutar_yuksek',
      now: new Date('2026-08-06T12:00:00Z'),
    })
    expect(result.total).toBe(60)
    expect(result.filteredMovements.map((movement) => movement.id)).toEqual(['2', '1'])
    expect(result.topProducts[0]).toEqual({ name: 'Kahve', total: 40 })
  })

  it('arama ve gün filtresini birlikte uygular', () => {
    const result = buildLossAnalysis(movements, {
      searchTerm: 'süt',
      dateFilter: 'bugun',
      sortBy: 'tarih_yeni',
      now: new Date('2026-08-06T12:00:00Z'),
    })
    expect(result.filteredMovements.map((movement) => movement.id)).toEqual(['1'])
    expect(result.groups[0]?.dateKey).toBe('Bugün')
  })
})

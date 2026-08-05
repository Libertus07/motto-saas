import { describe, expect, it } from 'vitest'

import { mergeSettingsRows } from './settings-service'

describe('mergeSettingsRows', () => {
  it('veritabanı değerlerini güvenli ayar tiplerine dönüştürür', () => {
    const settings = mergeSettingsRows([
      { key: 'business_name', value: 'Motto Test' },
      { key: 'notify_critical_stock', value: 'false' },
      { key: 'material_categories', value: '["Kahve","Süt"]' },
    ])
    expect(settings.business_name).toBe('Motto Test')
    expect(settings.notify_critical_stock).toBe(false)
    expect(settings.material_categories).toEqual(['Kahve', 'Süt'])
  })

  it('bozuk kategori JSON değerinde güvenli varsayılanı kullanır', () => {
    expect(
      mergeSettingsRows([{ key: 'material_categories', value: '{bozuk' }]).material_categories.length,
    ).toBeGreaterThan(0)
  })
})

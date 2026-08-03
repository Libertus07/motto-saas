import { describe, expect, it } from 'vitest'

import { buildSettingsRows, getChangedSettings } from './settings-utils'
import { DEFAULT_SETTINGS } from './types'

describe('settings persistence rules', () => {
  it('keeps only actual changes, including material categories', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      target_margin: '42',
      material_categories: [...DEFAULT_SETTINGS.material_categories, 'Yeni Kategori'],
    }

    const changes = getChangedSettings(settings, DEFAULT_SETTINGS)

    expect(changes).toEqual([
      ['target_margin', '42'],
      ['material_categories', [...DEFAULT_SETTINGS.material_categories, 'Yeni Kategori']],
    ])
  })

  it('produces tenant- and user-scoped upsert rows', () => {
    const changes = getChangedSettings({ ...DEFAULT_SETTINGS, default_vat: '20' }, DEFAULT_SETTINGS)

    expect(buildSettingsRows(changes, 'user-1', 'org-1')).toEqual([
      {
        key: 'default_vat',
        value: '20',
        user_id: 'user-1',
        organization_id: 'org-1',
      },
    ])
  })

  it('returns no rows when settings are unchanged', () => {
    expect(getChangedSettings({ ...DEFAULT_SETTINGS }, DEFAULT_SETTINGS)).toEqual([])
  })
})

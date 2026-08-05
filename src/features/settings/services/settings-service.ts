import type { SupabaseClient } from '@supabase/supabase-js'

import { buildSettingsRows, type ChangedSetting } from '../settings-utils'
import { DEFAULT_SETTINGS, type Settings } from '../types'

type SettingRow = { key: string; value: unknown }

const BOOLEAN_KEYS = new Set<keyof Settings>([
  'notify_critical_stock',
  'notify_low_margin',
  'notify_daily_revenue',
  'notify_supplier_price',
])

function parseCategories(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value !== 'string') return DEFAULT_SETTINGS.material_categories
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : DEFAULT_SETTINGS.material_categories
  } catch {
    return DEFAULT_SETTINGS.material_categories
  }
}

export function mergeSettingsRows(rows: SettingRow[]): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS }

  for (const row of rows) {
    const key = row.key as keyof Settings
    if (!(key in merged)) continue
    if (key === 'material_categories') {
      merged.material_categories = parseCategories(row.value)
    } else if (BOOLEAN_KEYS.has(key)) {
      ;(merged as unknown as Record<string, unknown>)[key] = row.value === true || row.value === 'true'
    } else {
      ;(merged as unknown as Record<string, unknown>)[key] = String(row.value ?? '')
    }
  }

  return merged
}

export async function fetchSettingsWorkspace(supabase: SupabaseClient, organizationId: string): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('key, value').eq('organization_id', organizationId)
  if (error) throw new Error(error.message)
  return mergeSettingsRows((data ?? []) as SettingRow[])
}

export async function saveSettingsChanges(
  supabase: SupabaseClient,
  organizationId: string,
  changes: ChangedSetting[],
): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error(userError?.message || 'Oturum bilgisi bulunamadı.')

  const rows = buildSettingsRows(changes, userData.user.id, organizationId)
  const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'organization_id,key' })
  if (error) throw new Error(error.message)
}

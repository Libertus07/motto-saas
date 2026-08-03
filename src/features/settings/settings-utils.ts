import type { Settings } from './types'

export type ChangedSetting = [keyof Settings, Settings[keyof Settings]]

export function getChangedSettings(settings: Settings, initialSettings: Settings): ChangedSetting[] {
  return (Object.keys(settings) as (keyof Settings)[])
    .filter((key) => JSON.stringify(settings[key]) !== JSON.stringify(initialSettings[key]))
    .map((key) => [key, settings[key]])
}

export function buildSettingsRows(changes: ChangedSetting[], userId: string, organizationId: string) {
  return changes.map(([key, value]) => ({
    key,
    value,
    user_id: userId,
    organization_id: organizationId,
  }))
}

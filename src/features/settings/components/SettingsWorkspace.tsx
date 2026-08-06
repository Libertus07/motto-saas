'use client'

import { useEffect, useState } from 'react'

import { useSettings } from '../hooks/useSettings'
import type { Tab } from '../types'
import { SettingsContent } from './SettingsContent'
import { SettingsHeader } from './SettingsHeader'
import { SettingsMetrics } from './SettingsMetrics'
import { SETTINGS_TAB_IDS, SettingsNavigation } from './SettingsNavigation'

export function SettingsWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>('genel')
  const workspace = useSettings()

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab') as Tab | null
    if (!requestedTab || !SETTINGS_TAB_IDS.includes(requestedTab)) return
    const timer = window.setTimeout(() => setActiveTab(requestedTab), 0)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="min-h-screen bg-stone-950 pb-16 text-stone-100">
      <SettingsHeader />
      <main className="mx-auto max-w-4xl space-y-6 px-4 pt-6 sm:px-8">
        <SettingsMetrics
          settings={workspace.settings}
          categoryCount={workspace.categories.length}
          activeNotificationCount={workspace.activeNotificationCount}
        />
        <SettingsNavigation activeTab={activeTab} onChange={setActiveTab} />
        <SettingsContent activeTab={activeTab} {...workspace} onSave={workspace.handleSave} />
      </main>
    </div>
  )
}

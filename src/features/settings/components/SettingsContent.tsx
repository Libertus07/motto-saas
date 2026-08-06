import type { Dispatch, SetStateAction } from 'react'

import type { Settings, Tab } from '../types'
import { BildirimlerTab } from './tabs/BildirimlerTab'
import { EkipTab } from './tabs/EkipTab'
import { EntegrasyonlarTab } from './tabs/EntegrasyonlarTab'
import { FinansalTab } from './tabs/FinansalTab'
import { GenelTab } from './tabs/GenelTab'
import { ProfilTab } from './tabs/ProfilTab'

type SettingsContentProps = {
  activeTab: Tab
  loading: boolean
  saving: boolean
  settings: Settings
  categories: string[]
  setCategories: Dispatch<SetStateAction<string[]>>
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  onSave: (overrides?: Partial<Settings>) => Promise<boolean>
}

export function SettingsContent(props: SettingsContentProps) {
  if (props.loading) {
    return (
      <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-16 text-center text-stone-400 backdrop-blur-md">
        <div className="mb-3 animate-spin text-3xl text-amber-500">⚙️</div>
        <p className="text-sm font-medium">Ayarlar yükleniyor...</p>
      </div>
    )
  }

  if (props.activeTab === 'genel')
    return <GenelTab s={props.settings} set={props.setSetting} onSave={props.onSave} saving={props.saving} />
  if (props.activeTab === 'profil') return <ProfilTab />
  if (props.activeTab === 'finansal')
    return (
      <FinansalTab
        s={props.settings}
        set={props.setSetting}
        onSave={props.onSave}
        saving={props.saving}
        categories={props.categories}
        setCategories={props.setCategories}
      />
    )
  if (props.activeTab === 'bildirimler')
    return <BildirimlerTab s={props.settings} set={props.setSetting} onSave={props.onSave} saving={props.saving} />
  if (props.activeTab === 'ekip') return <EkipTab />
  return <EntegrasyonlarTab />
}

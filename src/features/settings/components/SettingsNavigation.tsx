import type { Tab } from '../types'

const SETTINGS_TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'genel', label: 'Genel', icon: '🏪' },
  { id: 'profil', label: 'Profilim', icon: '👤' },
  { id: 'finansal', label: 'Finansal', icon: '💰' },
  { id: 'bildirimler', label: 'Bildirimler', icon: '🔔' },
  { id: 'ekip', label: 'Ekip', icon: '👥' },
  { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: '🔗' },
]

export const SETTINGS_TAB_IDS = SETTINGS_TABS.map((tab) => tab.id)

export function SettingsNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Ayar bölümleri"
      className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-stone-800/80 bg-stone-900/60 p-2 pb-1 backdrop-blur-md"
    >
      {SETTINGS_TABS.map((tab) => (
        <button
          type="button"
          key={tab.id}
          onClick={() => onChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={`flex whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all active:scale-95 sm:text-sm ${activeTab === tab.id ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20' : 'border border-stone-800/60 bg-stone-950/60 text-stone-400 hover:bg-stone-800/60 hover:text-white'}`}
        >
          <span className="mr-2" aria-hidden>
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

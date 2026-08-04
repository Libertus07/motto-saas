import type { InventoryTab } from '../types'

type InventoryTabsProps = {
  activeTab: InventoryTab
  materialCount: number
  movementCount: number
  onChange: (tab: InventoryTab) => void
}

export function InventoryTabs({ activeTab, materialCount, movementCount, onChange }: InventoryTabsProps) {
  const tabs: Array<{ key: InventoryTab; label: string; icon: string; badge?: number }> = [
    { key: 'stok', label: 'Stok Durumu', icon: '📦', badge: materialCount },
    { key: 'hareket', label: 'Hareketler', icon: '📋', badge: movementCount },
    { key: 'sayim', label: 'Sayım Yap', icon: '🔢' },
    { key: 'zayi', label: 'Fire / Zayi (TL)', icon: '🔥' },
  ]
  return (
    <nav
      id="tour-stock-tabs"
      className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-stone-800/80 bg-stone-900/60 p-2 pb-1 backdrop-blur-md"
      aria-label="Stok çalışma alanları"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-bold transition-all active:scale-95 sm:text-sm ${
              isActive
                ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                : 'border border-stone-800/60 bg-stone-950/60 text-stone-400 hover:bg-stone-800/60 hover:text-white'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge != null ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${isActive ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-300'}`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}

import type { PricingTab } from '../hooks/usePricingWorkspace'

const TABS: { id: PricingTab; label: string; activeClass: string }[] = [
  { id: 'sales', label: '1. Satış Adetleri Gir', activeClass: 'border-amber-500 text-amber-400' },
  { id: 'results', label: '2. Fiyat Analizi', activeClass: 'border-emerald-500 text-emerald-400' },
  { id: 'reports', label: '3. Görsel Raporlar', activeClass: 'border-blue-500 text-blue-400' },
]

export function PricingTabs({ activeTab, onChange }: { activeTab: PricingTab; onChange: (tab: PricingTab) => void }) {
  return (
    <div
      id="tour-pricing-tabs"
      role="tablist"
      aria-label="Fiyat motoru adımları"
      className="scrollbar-none sticky top-[73px] z-20 flex items-center overflow-x-auto border-b border-stone-800 bg-stone-950/80 backdrop-blur-xl"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onChange(tab.id)}
          className={`whitespace-nowrap border-b-2 px-4 py-3.5 text-xs font-bold transition-colors sm:px-6 sm:py-4 sm:text-sm ${
            activeTab === tab.id ? tab.activeClass : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

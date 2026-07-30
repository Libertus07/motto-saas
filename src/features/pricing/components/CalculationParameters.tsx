import { Input } from '@/components/ui/input'
import { PricingSettings } from '../types'

type CalculationParametersProps = {
  settings: PricingSettings
  onSettingsChange: (settings: PricingSettings) => void
}

export function CalculationParameters({ settings, onSettingsChange }: CalculationParametersProps) {
  return (
    <div
      id="tour-fm-params"
      className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">⚙️</span>
        <h3 className="font-extrabold text-amber-400 text-sm sm:text-base">Hesaplama Parametreleri</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-stone-300 text-xs font-semibold mb-1 block">Hedef Kâr Marjı (%)</label>
          <Input
            type="number"
            value={settings.targetMargin}
            onChange={e => onSettingsChange({ ...settings, targetMargin: parseFloat(e.target.value) || 0 })}
            className="text-amber-400 font-bold"
          />
          <p className="text-stone-500 text-[11px] mt-1">Kafe & Restoran sektörü ideal hedefi: %55-65</p>
        </div>

        <div>
          <label className="text-stone-300 text-xs font-semibold mb-1 block">KDV Oranı (%)</label>
          <Input
            type="number"
            value={settings.taxRate}
            onChange={e => onSettingsChange({ ...settings, taxRate: parseFloat(e.target.value) || 0 })}
            className="font-bold"
          />
        </div>
      </div>
    </div>
  )
}

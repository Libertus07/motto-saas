import { Button } from '@/components/ui/button'

type PricingHeaderProps = {
  saving: boolean
  loading: boolean
  onSave: () => void
}

export function PricingHeader({ saving, loading, onSave }: PricingHeaderProps) {
  return (
    <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
            🧠
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Fiyat Motoru</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                Ciro Ağırlıklı Maliyet Algoritması
              </span>
            </div>
            <p className="text-stone-400 text-xs mt-0.5">
              Hammadde + Gider payı dağıtarak ideal satış fiyatı ve net kar marjı hesaplama.
            </p>
          </div>
        </div>

        <Button
          id="tour-fm-save"
          onClick={onSave}
          disabled={saving || loading}
          className="bg-emerald-500 hover:bg-emerald-600 text-stone-950 font-extrabold shadow-lg shadow-emerald-500/20"
        >
          {saving ? (
            <>
              <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin mr-2" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <span className="mr-2">💾</span>
              Maliyetleri DB'ye Kaydet
            </>
          )}
        </Button>
      </div>
    </header>
  )
}

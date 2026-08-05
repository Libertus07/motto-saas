import type { RealSalesMeta } from '../../types'

export function SalesInputBanner({ realSalesMeta }: { realSalesMeta: RealSalesMeta | null }) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-stone-800/80 bg-stone-900/80 p-4 shadow-xl backdrop-blur-md sm:p-5 md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-xl text-amber-400">
          📝
        </div>
        <div>
          <h4 className="text-sm font-extrabold text-white sm:text-base">Günlük Satış Tahminleri & Z-Raporu</h4>
          <p className="mt-0.5 text-xs text-stone-400">
            Adetleri değiştirdiğinizde gider dağıtımı ve fiyat önerileri otomatik yenilenir.
          </p>
        </div>
      </div>
      {realSalesMeta && realSalesMeta.activeDays > 0 ? (
        <span className="self-start whitespace-nowrap rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 md:self-auto">
          ✓ {realSalesMeta.activeDays} Günlük Z-Raporu Aktif
        </span>
      ) : null}
    </div>
  )
}

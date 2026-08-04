export function PricingLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950">
      <div className="flex flex-col items-center gap-4" role="status">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber-500/20 border-t-amber-500" />
        <p className="font-medium text-stone-400">Algoritma Hazırlanıyor...</p>
      </div>
    </div>
  )
}

export function PricingErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-stone-950 px-4 py-12 text-stone-100">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-center shadow-xl">
        <div className="mb-3 text-3xl" aria-hidden="true">⚠️</div>
        <h1 className="text-lg font-bold text-red-200">Fiyat motoru yüklenemedi</h1>
        <p className="mt-2 text-sm leading-6 text-stone-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 min-h-11 rounded-xl bg-amber-500 px-5 py-2.5 font-bold text-stone-950 transition-colors hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}

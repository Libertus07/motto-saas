export function InventoryHeader({ onAddMovement }: { onAddMovement: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-900/90 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-2xl text-amber-400 shadow-inner">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">Stok Takibi</h1>
              <span className="rounded-full border border-stone-700 bg-stone-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Depo & Envanter
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-400">
              Stok seviyeleri, hareketler, fiziksel sayım ve fire maliyet takibi.
            </p>
          </div>
        </div>
        <button
          id="tour-stock-movement"
          type="button"
          onClick={onAddMovement}
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-xs font-extrabold text-stone-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-95 sm:text-sm"
        >
          ➕ Stok Hareketi Ekle
        </button>
      </div>
    </header>
  )
}

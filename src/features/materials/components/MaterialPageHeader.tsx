type MaterialPageHeaderProps = {
  materialCount: number
  bulkEditMode: boolean
  changedCount: number
  selectedCount: number
  allVisibleSelected: boolean
  bulkSaving: boolean
  autoCatLoading: boolean
  onEnterBulkEdit: () => void
  onCancelBulkEdit: () => void
  onSaveBulk: () => void
  onDeleteSelected: () => void
  onToggleSelectAll: () => void
  onDeleteAll: () => void
  onAutoCategorize: () => void
  onCreate: () => void
}

export function MaterialPageHeader(props: MaterialPageHeaderProps) {
  return (
    <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">
            🧪
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Hammaddeler</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                Stok & Maliyet
              </span>
            </div>
            <p className="text-stone-400 text-xs mt-0.5">
              Stok, birim maliyet, kritik seviye ve fiyat geçmişi yönetimi.
            </p>
          </div>
        </div>

        {props.bulkEditMode ? (
          <div className="flex flex-wrap items-center gap-2 bg-stone-950 p-2 rounded-xl border border-amber-500/40">
            <span className="text-xs px-2 text-amber-400 font-bold">● {props.changedCount} satır değişti</span>
            <button
              onClick={props.onToggleSelectAll}
              className="bg-stone-800 hover:bg-stone-700 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-700"
            >
              {props.allVisibleSelected ? '☐ Görünenleri Temizle' : '☑️ Görünenleri Seç'}
            </button>
            <button
              onClick={props.onDeleteSelected}
              disabled={props.selectedCount === 0 || props.bulkSaving}
              className="bg-red-950/80 hover:bg-red-900 disabled:opacity-50 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold border border-red-900/50"
            >
              🗑️ Sil ({props.selectedCount})
            </button>
            <button
              onClick={props.onCancelBulkEdit}
              disabled={props.bulkSaving}
              className="bg-stone-800 hover:bg-stone-700 px-3 py-2 rounded-lg text-xs font-semibold border border-stone-700"
            >
              İptal
            </button>
            <button
              onClick={props.onSaveBulk}
              disabled={props.bulkSaving || props.changedCount === 0}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold px-4 py-2 rounded-lg text-xs"
            >
              {props.bulkSaving ? 'Kaydediliyor…' : '✓ Değişiklikleri Kaydet'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:flex gap-2">
            <button
              onClick={props.onDeleteAll}
              disabled={props.materialCount === 0}
              className="bg-red-950/60 hover:bg-red-900/80 disabled:opacity-50 text-red-400 px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-red-900/40"
            >
              🗑️ Tümünü Sil
            </button>
            <button
              id="tour-mat-bulk-edit"
              onClick={props.onEnterBulkEdit}
              disabled={props.materialCount === 0}
              className="bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-stone-200 px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-stone-800"
            >
              ✏️ Hızlı Düzenle
            </button>
            <button
              id="tour-mat-autocat"
              onClick={props.onAutoCategorize}
              disabled={props.autoCatLoading || props.materialCount === 0}
              className="bg-violet-950/60 hover:bg-violet-900/80 disabled:opacity-50 text-violet-300 px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-violet-800/40"
            >
              {props.autoCatLoading ? 'Analiz…' : '🤖 AI Kategorize'}
            </button>
            <button
              id="tour-mat-add"
              onClick={props.onCreate}
              className="bg-gradient-to-r from-amber-500 to-amber-600 text-stone-950 font-extrabold px-4 py-2 rounded-xl text-xs sm:text-sm shadow-lg shadow-amber-500/20"
            >
              ➕ Yeni Hammadde
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

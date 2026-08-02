import { Button } from '@/components/ui/button'

type ProductPageHeaderProps = {
  bulkEditMode: boolean
  changedCount: number
  bulkSaving: boolean
  autoCategorizeLoading: boolean
  onCancelBulkEdit: () => void
  onSaveBulkChanges: () => void
  onEnterBulkEdit: () => void
  onAutoCategorize: () => void
  onCreateProduct: () => void
}

export function ProductPageHeader({
  bulkEditMode,
  changedCount,
  bulkSaving,
  autoCategorizeLoading,
  onCancelBulkEdit,
  onSaveBulkChanges,
  onEnterBulkEdit,
  onAutoCategorize,
  onCreateProduct,
}: ProductPageHeaderProps) {
  return (
    <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
            ☕
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-extrabold text-xl sm:text-2xl text-white tracking-tight">Menü & Ürünler</h1>
              <span className="hidden sm:inline-flex text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                Reçete & Maliyet Engine
              </span>
            </div>
            <p className="hidden sm:block text-stone-400 text-xs mt-0.5">
              Reçeteli ürün maliyeti, kar marjı ve yapay zeka destekli fiyat yönetimi.
            </p>
          </div>
        </div>

        <div id="tour-products-create" className="w-full md:w-auto">
          {bulkEditMode ? (
            <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 bg-stone-950 p-1.5 rounded-xl border border-amber-500/40">
              <span className="col-span-2 sm:col-span-1 text-stone-300 text-xs px-2 py-1 font-medium text-center sm:text-left">
                {changedCount > 0 ? (
                  <span className="text-amber-400 font-bold">● {changedCount} satır düzenlendi</span>
                ) : (
                  'Değişiklik bekleniyor'
                )}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onCancelBulkEdit}
                className="w-full border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white"
              >
                İptal
              </Button>
              <Button
                size="sm"
                onClick={onSaveBulkChanges}
                disabled={bulkSaving || changedCount === 0}
                className="w-full bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold shadow-md shadow-amber-500/20"
              >
                {bulkSaving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin mr-2" />
                    Kaydediliyor...
                  </>
                ) : (
                  <>✓ Tümünü Kaydet</>
                )}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <Button
                variant="outline"
                onClick={onEnterBulkEdit}
                className="w-full bg-stone-900 border-stone-800 text-stone-200 hover:bg-stone-800 shadow-sm"
              >
                <span className="mr-2">✏️</span>
                Hızlı Düzenle
              </Button>
              <Button
                variant="outline"
                onClick={onAutoCategorize}
                disabled={autoCategorizeLoading}
                className="w-full bg-violet-950/60 border-violet-800/40 text-violet-300 hover:bg-violet-900/80 hover:text-violet-200 shadow-sm"
              >
                {autoCategorizeLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mr-2" />
                    Analiz...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🤖</span>
                    AI Kategorize
                  </>
                )}
              </Button>
              <Button
                onClick={onCreateProduct}
                className="col-span-2 w-full bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold shadow-lg shadow-amber-500/20"
              >
                <span className="mr-2">➕</span>
                Yeni Ürün Ekle
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

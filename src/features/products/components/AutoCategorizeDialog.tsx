import type { ProductCategorySuggestion } from '@/features/products/types'
import { useDialogLifecycle } from '@/hooks/useDialogLifecycle'

type AutoCategorizeDialogProps = {
  open: boolean
  suggestions: ProductCategorySuggestion[]
  saving: boolean
  onClose: () => void
  onDismissSuggestion: (id: string) => void
  onApply: () => void
}

export function AutoCategorizeDialog({
  open,
  suggestions,
  saving,
  onClose,
  onDismissSuggestion,
  onApply,
}: AutoCategorizeDialogProps) {
  const closeWhenIdle = () => {
    if (!saving) onClose()
  }

  useDialogLifecycle(open, closeWhenIdle)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-stone-950/90 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeWhenIdle()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="auto-categorize-title"
        className="bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl w-full max-w-xl max-h-[94dvh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-4 sm:px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 text-2xl">🤖</span>
            <div className="min-w-0">
              <h3 id="auto-categorize-title" className="truncate text-base font-bold text-white">
                Otomatik AI Kategorize Önerileri
              </h3>
              <p className="text-stone-400 text-xs">
                {suggestions.length === 0
                  ? 'Tüm ürünler doğru kategoride! ✨'
                  : `Yapay zeka ${suggestions.length} ürün için yeni kategori önerdi.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Kategori önerilerini kapat"
            className="shrink-0 min-h-10 min-w-10 text-stone-400 hover:text-white text-lg rounded-xl hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              <div className="text-4xl mb-2">🎉</div>
              <p className="text-xs">Tüm ürünler doğru kategorilere atanmış durumda!</p>
            </div>
          ) : (
            suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-center justify-between gap-3 bg-stone-950 p-3 rounded-xl border border-stone-800 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white font-semibold truncate">{suggestion.name}</p>
                  <div className="flex min-w-0 items-center gap-2 mt-0.5 text-[11px]">
                    <span className="truncate text-stone-500 line-through">{suggestion.current}</span>
                    <span className="shrink-0 text-stone-600">→</span>
                    <span className="truncate text-violet-400 font-bold">{suggestion.suggested}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onDismissSuggestion(suggestion.id)}
                  disabled={saving}
                  aria-label={`${suggestion.name} önerisini kaldır`}
                  title="Öneriyi Kaldır"
                  className="shrink-0 min-h-9 min-w-9 text-stone-500 hover:text-red-400 p-1.5 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {suggestions.length > 0 ? (
          <div className="px-4 sm:px-6 py-4 bg-stone-950 border-t border-stone-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span className="text-stone-500 text-[11px]">İstemediğin öneriyi ✕ ile listeden çıkarabilirsin.</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="min-h-10 bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-xl text-xs font-semibold border border-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={onApply}
                disabled={saving}
                className="min-h-10 justify-center bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-violet-600/20"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uygulanıyor...
                  </>
                ) : (
                  <>✓ Önerileri Uygula</>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

import type { AutoCatSuggestion } from "../types"

type MaterialAutoCatModalProps = {
  isOpen: boolean
  onClose: () => void
  suggestions: AutoCatSuggestion[]
  onRemoveSuggestion: (index: number) => void
  onApply: (suggestionsToApply: { id: string; suggested: string }[]) => void
  isSaving: boolean
}

export function MaterialAutoCatModal({
  isOpen,
  onClose,
  suggestions,
  onRemoveSuggestion,
  onApply,
  isSaving
}: MaterialAutoCatModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Modal Başlık */}
        <div className="px-6 py-5 border-b border-stone-800 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🤖</span>
              <h2 className="text-lg font-bold text-white">Otomatik Kategorize Önerileri</h2>
            </div>
            {suggestions.length === 0 ? (
              <p className="text-stone-400 text-sm">Tüm hammaddeler zaten doğru kategoride! ✨</p>
            ) : (
              <p className="text-stone-400 text-sm">
                Yapay zeka <span className="text-amber-400 font-bold">{suggestions.length} hammadde</span> için kategori önerisi üreetti.
                Onayla veya reddederek uygulayın.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-white text-xl mt-0.5 ml-4"
          >
            ✕
          </button>
        </div>

        {/* Öneri Listesi */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {suggestions.length === 0 ? (
            <div className="text-center py-12 text-stone-500">
              <div className="text-4xl mb-3">🎉</div>
              <p>Her şey zaten doğru sınıflandırılmış!</p>
            </div>
          ) : (
            suggestions.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between bg-stone-800 rounded-xl px-4 py-3 gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{s.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-stone-500 text-xs line-through">{s.current}</span>
                    <span className="text-stone-600 text-xs">→</span>
                    <span className="text-violet-400 text-xs font-semibold">{s.suggested}</span>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveSuggestion(i)}
                  className="text-stone-600 hover:text-red-400 text-xs transition-colors flex-shrink-0"
                  title="Bu öneriyi listeden çıkar"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Alt Butonlar */}
        {suggestions.length > 0 && (
          <div className="px-6 py-4 border-t border-stone-800 flex items-center justify-between gap-3">
            <p className="text-stone-500 text-xs">
              İstemediğin öneriyi listeden ✕ ile çıkarabilirsin.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
              >
                Vazgeç
              </button>
              <button
                onClick={() => onApply(suggestions.map(s => ({ id: s.id, suggested: s.suggested })))}
                disabled={isSaving}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uygulanıyor...</>
                ) : (
                  <>✓ {suggestions.length} Öneriyi Uygula</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

import { formatDate } from "@/lib/format"
import type { PriceHistory } from "../types"

type MaterialHistoryModalProps = {
  isOpen: boolean
  onClose: () => void
  selectedMatName: string
  priceHistory: PriceHistory[]
  loadingHistory: boolean
}

export function MaterialHistoryModal({
  isOpen,
  onClose,
  selectedMatName,
  priceHistory,
  loadingHistory
}: MaterialHistoryModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 w-full max-w-lg mx-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-amber-400">Fiyat Geçmişi</h2>
            <p className="text-stone-400 text-sm">{selectedMatName}</p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
        </div>

        {loadingHistory ? (
          <p className="text-stone-400 py-8 text-center">Geçmiş yükleniyor...</p>
        ) : priceHistory.length === 0 ? (
          <p className="text-stone-500 py-8 text-center">Bu hammadde için fiyat değişimi kaydedilmemiş.</p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
            {priceHistory.map(hist => {
              const isIncrease = hist.new_price > hist.old_price
              const diffPercent = hist.old_price > 0
                ? ((hist.new_price - hist.old_price) / hist.old_price) * 100
                : 0
              return (
                <div key={hist.id} className="bg-stone-800 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-stone-400 text-xs mb-1">
                      {formatDate(new Date(hist.created_at))}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-stone-500 line-through">₺{hist.old_price.toFixed(2)}</span>
                      <span className="text-stone-300">→</span>
                      <span className="text-white font-bold text-lg">₺{hist.new_price.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {hist.old_price > 0 && (
                      <div className={`font-bold text-sm ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>
                        {isIncrease ? '▲' : '▼'} %{Math.abs(diffPercent).toFixed(1)}
                      </div>
                    )}
                    <span className="text-stone-500 text-xs">
                      {hist.source === 'receipt_upload' ? '📸 Fiş Okuma' : '✏️ Manuel'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

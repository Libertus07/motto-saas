import type { Material } from '../types'

export function MaterialActions({
  material,
  onHistory,
  onEdit,
  onDelete,
}: {
  material: Material
  onHistory: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onHistory}
        className="rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs hover:bg-stone-700"
        aria-label={`${material.name} fiyat geçmişi`}
      >
        📈 <span className="md:hidden">Geçmiş</span>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs hover:bg-stone-700"
        aria-label={`${material.name} düzenle`}
      >
        ✏️ <span className="md:hidden">Düzenle</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-400 hover:bg-rose-500/20"
        aria-label={`${material.name} sil`}
      >
        🗑️ <span className="md:hidden">Sil</span>
      </button>
    </div>
  )
}

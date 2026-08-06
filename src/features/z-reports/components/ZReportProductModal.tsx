import type { ZReportWorkspace } from '../hooks/useZReportWorkspace'

export function ZReportProductModal({ workspace }: { workspace: ZReportWorkspace }) {
  const modal = workspace.newProductModal
  if (!modal?.isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-z-product-title"
    >
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-stone-700 bg-stone-900 p-5 sm:max-w-md sm:rounded-2xl sm:p-6">
        <h3 id="new-z-product-title" className="mb-4 text-xl font-bold text-amber-400">
          Yeni Ürün Ekle
        </h3>
        <p className="mb-6 text-sm text-stone-400">
          &quot;{modal.name}&quot; ürününü kataloğa ekleyip bu satışla eşleştirin.
        </p>
        <div className="space-y-4">
          <label className="block text-sm text-stone-400">
            Ürün Adı
            <input
              value={modal.name}
              onChange={(event) => workspace.setNewProductModal({ ...modal, name: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-white focus:border-amber-400 focus:outline-none"
            />
          </label>
          <label className="block text-sm text-stone-400">
            Kategori
            <input
              list="z-product-categories"
              value={modal.category}
              onChange={(event) => workspace.setNewProductModal({ ...modal, category: event.target.value })}
              className="mt-1 min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-white focus:border-amber-400 focus:outline-none"
            />
            <datalist id="z-product-categories">
              {workspace.allCategories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label className="block text-sm text-stone-400">
            Satış Fiyatı (₺)
            <input
              type="number"
              min="0"
              value={modal.price}
              onChange={(event) => workspace.setNewProductModal({ ...modal, price: Number(event.target.value) })}
              className="mt-1 min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-4 py-2 text-white focus:border-amber-400 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => void workspace.createProduct()}
            disabled={workspace.savingProduct || !modal.name.trim()}
            className="min-h-12 rounded-xl bg-amber-500 px-5 py-3 font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50"
          >
            {workspace.savingProduct ? 'Ekleniyor...' : 'Kaydet ve Eşleştir'}
          </button>
          <button
            type="button"
            onClick={() => workspace.setNewProductModal(null)}
            className="min-h-12 rounded-xl bg-stone-800 px-6 py-3 font-bold text-white hover:bg-stone-700"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}

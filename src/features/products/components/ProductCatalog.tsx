import type { Product, ProductBulkRow } from '@/features/products/types'

import { ProductCategorySection } from './ProductCategorySection'

export type ProductCategoryGroup = {
  cat: string
  items: Product[]
}

type ProductCatalogProps = {
  loading: boolean
  groups: ProductCategoryGroup[]
  openCategories: ReadonlySet<string>
  bulkEditMode: boolean
  bulkRows: Record<string, ProductBulkRow>
  changedIds: ReadonlySet<string>
  editingId: string | null
  onToggleCategory: (category: string) => void
  onBulkRowChange: (id: string, field: keyof ProductBulkRow, value: string) => void
  onEdit: (product: Product) => void
  onDelete: (id: string) => void
}

export function ProductCatalog({
  loading,
  groups,
  openCategories,
  bulkEditMode,
  bulkRows,
  changedIds,
  editingId,
  onToggleCategory,
  onBulkRowChange,
  onEdit,
  onDelete,
}: ProductCatalogProps) {
  if (loading) {
    return (
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
        <div className="animate-spin text-amber-500 text-3xl mb-3">⚙️</div>
        <p className="text-sm font-medium">Menü ve Reçeteler Yükleniyor...</p>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-500 backdrop-blur-md">
        <div className="text-5xl mb-3">📋</div>
        <h3 className="text-lg font-bold text-stone-300 mb-1">Aramanıza Uygun Ürün Bulunamadı</h3>
        <p className="text-xs text-stone-400 max-w-sm mx-auto">
          Arama filtrenizi temizleyerek veya &quot;+ Yeni Ürün Ekle&quot; butonunu kullanarak yeni ürün
          tanımlayabilirsiniz.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map(({ cat, items }) => (
        <ProductCategorySection
          key={cat}
          category={cat}
          products={items}
          isOpen={openCategories.has(cat)}
          bulkEditMode={bulkEditMode}
          bulkRows={bulkRows}
          changedIds={changedIds}
          editingId={editingId}
          onToggle={() => onToggleCategory(cat)}
          onBulkRowChange={onBulkRowChange}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

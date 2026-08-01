import { useEffect } from 'react'

import type { ProductFormValues, ProductIngredient, ProductMaterial, SubRecipe } from '@/features/products/types'
import { formatCurrency } from '@/lib/format'

import { ProductRecipeEditor } from './ProductRecipeEditor'

type ProductFormDrawerProps = {
  open: boolean
  editing: boolean
  form: ProductFormValues
  categories: string[]
  recipeItems: ProductIngredient[]
  materials: ProductMaterial[]
  subRecipes: SubRecipe[]
  isBuildingAiRecipe: boolean
  liveCost: number
  salePrice: number
  liveMargin: number
  liveCashContribution: number
  onClose: () => void
  onFormChange: <Field extends keyof ProductFormValues>(field: Field, value: ProductFormValues[Field]) => void
  onBuildAiRecipe: () => void
  onAddRecipeItem: (type: ProductIngredient['type']) => void
  onUpdateRecipeItem: (index: number, field: 'item_id' | 'quantity', value: string | number) => void
  onRemoveRecipeItem: (index: number) => void
  onSubmit: () => void
}

const inputClassName =
  'w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50'

export function ProductFormDrawer({
  open,
  editing,
  form,
  categories,
  recipeItems,
  materials,
  subRecipes,
  isBuildingAiRecipe,
  liveCost,
  salePrice,
  liveMargin,
  liveCashContribution,
  onClose,
  onFormChange,
  onBuildAiRecipe,
  onAddRecipeItem,
  onUpdateRecipeItem,
  onRemoveRecipeItem,
  onSubmit,
}: ProductFormDrawerProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fadeIn"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="bg-stone-900 border border-stone-800 rounded-2xl sm:rounded-3xl w-full max-w-3xl max-h-[94dvh] sm:max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative my-auto"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      >
        <div className="px-4 sm:px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
              {editing ? '✏️' : '✨'}
            </div>
            <div className="min-w-0">
              <h3 id="product-form-title" className="truncate font-bold text-white text-base sm:text-lg">
                {editing ? 'Ürünü Düzenle' : 'Yeni Menü Ürünü Ekle'}
              </h3>
              <p className="hidden sm:block text-stone-400 text-xs">
                Reçete ve fiyat bilgilerini girerek ürün maliyetini hesaplayabilirsiniz.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Ürün formunu kapat"
            className="shrink-0 min-h-10 min-w-10 text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-stone-300 text-xs font-semibold mb-1 block">Ürün Adı *</span>
              <input
                required
                value={form.name}
                onChange={(event) => onFormChange('name', event.target.value)}
                className={inputClassName}
                placeholder="örn: Caffe Latte"
              />
            </label>

            <label className="block">
              <span className="text-stone-300 text-xs font-semibold mb-1 block">Kategori</span>
              <input
                list="category-options-modal"
                value={form.category}
                onChange={(event) => onFormChange('category', event.target.value)}
                placeholder="Kategori seç/yaz..."
                className={inputClassName}
              />
              <datalist id="category-options-modal">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>

            <label className="block">
              <span className="text-stone-300 text-xs font-semibold mb-1 block">Satış Fiyatı (₺)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={form.sale_price}
                onChange={(event) => onFormChange('sale_price', event.target.value)}
                className={`${inputClassName} text-amber-400 font-bold`}
                placeholder="0.00"
              />
            </label>

            <label className="block">
              <span className="text-amber-400 text-xs font-semibold mb-1 block">Tahmini Aylık Satış</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.estimated_monthly_sales}
                onChange={(event) => onFormChange('estimated_monthly_sales', event.target.value)}
                className={`${inputClassName} border-amber-500/30`}
                placeholder="0"
              />
            </label>
          </div>

          <ProductRecipeEditor
            items={recipeItems}
            materials={materials}
            subRecipes={subRecipes}
            isBuildingAiRecipe={isBuildingAiRecipe}
            onBuildAiRecipe={onBuildAiRecipe}
            onAddItem={onAddRecipeItem}
            onUpdateItem={onUpdateRecipeItem}
            onRemoveItem={onRemoveRecipeItem}
          />

          <div className="bg-stone-950 border border-stone-800 p-4 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <span className="text-stone-400 text-[11px] block">Food Cost (Maliyet)</span>
              <span className="text-stone-200 font-bold text-base">₺{liveCost.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-stone-400 text-[11px] block">Satış Fiyatı</span>
              <span className="text-amber-400 font-extrabold text-base">₺{salePrice.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-stone-400 text-[11px] block">Kâr Marjı</span>
              <span className={`font-bold text-base ${liveMargin >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                %{liveMargin.toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-stone-400 text-[11px] block">Aylık Nakit Katkı</span>
              <span className="text-violet-400 font-extrabold text-base">{formatCurrency(liveCashContribution)}</span>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-4 bg-stone-950 border-t border-stone-800 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 w-full sm:w-auto bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            className="min-h-10 w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            {editing ? 'Ürünü Güncelle' : 'Ürünü Kaydet'}
          </button>
        </div>
      </form>
    </div>
  )
}

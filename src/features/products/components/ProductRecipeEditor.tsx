import type { ProductIngredient, ProductMaterial, SubRecipe } from '@/features/products/types'

type ProductRecipeEditorProps = {
  items: ProductIngredient[]
  materials: ProductMaterial[]
  subRecipes: SubRecipe[]
  isBuildingAiRecipe: boolean
  onBuildAiRecipe: () => void
  onAddItem: (type: ProductIngredient['type']) => void
  onUpdateItem: (index: number, field: 'item_id' | 'quantity', value: string | number) => void
  onRemoveItem: (index: number) => void
}

export function ProductRecipeEditor({
  items,
  materials,
  subRecipes,
  isBuildingAiRecipe,
  onBuildAiRecipe,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: ProductRecipeEditorProps) {
  return (
    <section className="bg-stone-950/60 p-4 rounded-2xl border border-stone-800/80 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-800/80">
        <div>
          <h4 className="font-bold text-amber-400 text-sm">Ürün Reçetesi</h4>
          <p className="text-stone-400 text-xs">Bu ürünü hazırlamak için kullanılan hammadde veya soslar.</p>
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={onBuildAiRecipe}
            disabled={isBuildingAiRecipe}
            className="min-h-9 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-50 transition-all active:scale-95"
          >
            {isBuildingAiRecipe ? '⏳ Oluşturuluyor...' : '✨ Yapay Zeka Hesaplasın'}
          </button>
          <button
            type="button"
            onClick={() => onAddItem('material')}
            className="min-h-9 bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
          >
            + Hammadde
          </button>
          <button
            type="button"
            onClick={() => onAddItem('sub_recipe')}
            className="min-h-9 bg-stone-800 hover:bg-stone-700 text-amber-300 px-3 py-1.5 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
          >
            + Üretim Reçetesi
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-stone-500 text-xs text-center py-4">
          Reçete boş. Yukarıdaki butonlarla hammadde veya üretim reçetesi ekleyebilirsiniz.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => {
            const itemUnit =
              item.type === 'material'
                ? materials.find((material) => material.id === item.item_id)?.unit
                : subRecipes.find((recipe) => recipe.id === item.item_id)?.yield_unit

            return (
              <div
                key={`${item.type}-${index}`}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-stone-900 p-2.5 rounded-xl border border-stone-800 text-xs"
              >
                <span
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold text-center shrink-0 ${
                    item.type === 'sub_recipe'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
                  }`}
                >
                  {item.type === 'sub_recipe' ? 'Üretim Reçetesi' : 'Hammadde'}
                </span>

                <div className="flex-1 min-w-0">
                  <select
                    value={item.item_id}
                    onChange={(event) => onUpdateItem(index, 'item_id', event.target.value)}
                    aria-label={`${index + 1}. reçete kalemi`}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none"
                  >
                    <option value="">
                      {item.type === 'material' ? 'Hammadde Seçiniz...' : 'Üretim Reçetesi Seçiniz...'}
                    </option>
                    {item.type === 'material'
                      ? materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name} ({material.unit})
                          </option>
                        ))
                      : subRecipes.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.name} (1 {recipe.yield_unit})
                          </option>
                        ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-40">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={item.quantity || ''}
                    onChange={(event) => onUpdateItem(index, 'quantity', Number(event.target.value))}
                    aria-label={`${index + 1}. reçete kalemi miktarı`}
                    className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs text-right focus:outline-none"
                    placeholder="Miktar"
                  />
                  <span className="text-stone-400 text-xs shrink-0 w-12 truncate">{itemUnit}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveItem(index)}
                  aria-label={`${index + 1}. reçete kalemini kaldır`}
                  className="min-h-9 min-w-9 text-stone-500 hover:text-red-400 p-1 rounded-lg hover:bg-stone-800 text-center transition-colors"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

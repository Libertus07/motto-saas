import { useCallback, useState } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import type {
  Product,
  ProductFormValues,
  ProductIngredient,
  ProductMaterial,
  ProductMutationInput,
  SubRecipe,
} from '@/features/products/types'
import { calculateMargin, calculateRecipeCost } from '@/features/products/utils'
import {
  createAiRecipeRequest,
  createProductFormPayload,
  describeProductChanges,
  EMPTY_PRODUCT_FORM,
} from '@/features/products/workspace-utils'

type ProductFormWorkspaceOptions = {
  products: Product[]
  materials: ProductMaterial[]
  subRecipes: SubRecipe[]
  categories: string[]
  saving: boolean
  saveProduct: (input: ProductMutationInput) => Promise<string>
  removeProduct: (productId: string) => Promise<void>
  loadProductRecipe: (productId: string) => Promise<ProductIngredient[]>
}

export function useProductFormWorkspace({
  products,
  materials,
  subRecipes,
  categories,
  saving,
  saveProduct,
  removeProduct,
  loadProductRecipe,
}: ProductFormWorkspaceOptions) {
  const { showAlert, showConfirm } = useNotification()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM)
  const [recipeItems, setRecipeItems] = useState<ProductIngredient[]>([])
  const [isBuildingAiRecipe, setIsBuildingAiRecipe] = useState(false)

  const reset = useCallback(() => {
    setForm(EMPTY_PRODUCT_FORM)
    setRecipeItems([])
    setEditingId(null)
    setOpen(false)
  }, [])

  const openCreate = useCallback(() => {
    setForm(EMPTY_PRODUCT_FORM)
    setRecipeItems([])
    setEditingId(null)
    setOpen(true)
  }, [])

  const updateField = useCallback(
    <Field extends keyof ProductFormValues>(field: Field, value: ProductFormValues[Field]) => {
      setForm((current) => ({ ...current, [field]: value }))
    },
    [],
  )

  const addRecipeItem = useCallback((type: ProductIngredient['type']) => {
    setRecipeItems((current) => [...current, { type, item_id: '', quantity: 0 }])
  }, [])

  const updateRecipeItem = useCallback((index: number, field: 'item_id' | 'quantity', value: string | number) => {
    setRecipeItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    )
  }, [])

  const removeRecipeItem = useCallback((index: number) => {
    setRecipeItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }, [])

  const submit = useCallback(async () => {
    if (!form.name.trim()) {
      await showAlert('Ürün adı zorunludur.', 'warning')
      return
    }
    const payload = createProductFormPayload(form)
    if (!payload) {
      await showAlert('Satış fiyatı ve aylık satış tahmini geçerli olmalıdır.', 'warning')
      return
    }

    try {
      await saveProduct({
        id: editingId,
        name: payload.name,
        category: payload.category,
        salePrice: payload.salePrice,
        estimatedMonthlySales: payload.estimatedMonthlySales,
        ingredients: recipeItems.filter((item) => item.item_id && item.quantity > 0),
        auditDetails: {
          detay: describeProductChanges(
            products.find((product) => product.id === editingId),
            payload,
          ),
        },
      })
      const action = editingId ? 'güncellendi' : 'eklendi'
      reset()
      await showAlert(`${payload.name} başarıyla ${action}.`, 'success')
    } catch (caughtError: unknown) {
      await showAlert(`Ürün kaydedilemedi: ${(caughtError as Error).message}`, 'error')
    }
  }, [editingId, form, products, recipeItems, reset, saveProduct, showAlert])

  const edit = useCallback(
    async (product: Product) => {
      setForm({
        name: product.name,
        category: product.category,
        sale_price: product.sale_price.toString(),
        estimated_monthly_sales: (product.estimated_monthly_sales || 0).toString(),
      })
      setEditingId(product.id)
      try {
        setRecipeItems(await loadProductRecipe(product.id))
        setOpen(true)
      } catch (caughtError: unknown) {
        setEditingId(null)
        await showAlert(`Ürün reçetesi yüklenemedi: ${(caughtError as Error).message}`, 'error')
      }
    },
    [loadProductRecipe, showAlert],
  )

  const remove = useCallback(
    async (id: string) => {
      const product = products.find((candidate) => candidate.id === id)
      const confirmed = await showConfirm(
        `"${product?.name}" ürününü silmek istediğinize emin misiniz?`,
        'Ürünü Sil 🗑️',
      )
      if (!confirmed) return
      try {
        await removeProduct(id)
        await showAlert(`${product?.name || 'Ürün'} başarıyla silindi.`, 'success')
      } catch (caughtError: unknown) {
        await showAlert(`Ürün silinemedi: ${(caughtError as Error).message}`, 'error')
      }
    },
    [products, removeProduct, showAlert, showConfirm],
  )

  const buildAiRecipe = useCallback(async () => {
    if (!form.name.trim()) {
      await showAlert('Lütfen önce ürün adını girin.', 'warning')
      return
    }
    setIsBuildingAiRecipe(true)
    try {
      const response = await fetch('/api/ai-recipe-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createAiRecipeRequest(form.name, materials, subRecipes)),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Yapay zeka reçetesi oluşturulamadı.')
      if (!Array.isArray(data.ingredients)) return

      const nextItems: ProductIngredient[] = data.ingredients.map(
        (ingredient: { type?: string; id: string; quantity: number }) => ({
          type: ingredient.type === 'sub_recipe' ? 'sub_recipe' : 'material',
          item_id: ingredient.id,
          quantity: Number(ingredient.quantity) || 0,
        }),
      )
      if (recipeItems.length > 0) {
        const confirmed = await showConfirm(
          'Mevcut reçete silinip yapay zeka reçetesi eklenecek. Onaylıyor musunuz?',
          'Reçeteyi Güncelle 🤖',
        )
        if (!confirmed) return
      }
      setRecipeItems(nextItems)
    } catch (caughtError: unknown) {
      await showAlert((caughtError as Error).message, 'error')
    } finally {
      setIsBuildingAiRecipe(false)
    }
  }, [form.name, materials, recipeItems.length, showAlert, showConfirm, subRecipes])

  const liveCost = calculateRecipeCost(recipeItems, materials, subRecipes)
  const salePrice = Number.parseFloat(form.sale_price || '0')
  const liveMargin = calculateMargin(salePrice, liveCost)
  const liveCashContribution = (salePrice - liveCost) * Number(form.estimated_monthly_sales || '0')

  return {
    editingId,
    openCreate,
    edit,
    remove,
    props: {
      open,
      editing: editingId !== null,
      form,
      categories,
      recipeItems,
      materials,
      subRecipes,
      isBuildingAiRecipe,
      saving,
      liveCost,
      salePrice,
      liveMargin,
      liveCashContribution,
      onClose: reset,
      onFormChange: updateField,
      onBuildAiRecipe: buildAiRecipe,
      onAddRecipeItem: addRecipeItem,
      onUpdateRecipeItem: updateRecipeItem,
      onRemoveRecipeItem: removeRecipeItem,
      onSubmit: submit,
    },
  }
}

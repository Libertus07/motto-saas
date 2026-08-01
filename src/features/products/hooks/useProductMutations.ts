import { useCallback, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  bulkUpdateProducts as bulkUpdateProductsRequest,
  deleteProduct as deleteProductRequest,
  fetchProductRecipe as fetchProductRecipeRequest,
  saveProductWithRecipe,
} from '@/features/products/services/product-service'
import type { ProductBulkUpdate, ProductMutationInput } from '@/features/products/types'

type ProductMutationAction = 'save' | 'bulk' | 'categorize' | 'delete' | null

type UseProductMutationsOptions = {
  supabase: SupabaseClient
  organizationId?: string
  refresh: () => Promise<void>
}

export function useProductMutations({ supabase, organizationId, refresh }: UseProductMutationsOptions) {
  const [pendingAction, setPendingAction] = useState<ProductMutationAction>(null)

  const requireOrganizationId = useCallback(() => {
    if (!organizationId) throw new Error('Aktif organizasyon bulunamadı.')
    return organizationId
  }, [organizationId])

  const saveProduct = useCallback(
    async (input: ProductMutationInput) => {
      setPendingAction('save')
      try {
        const productId = await saveProductWithRecipe(supabase, requireOrganizationId(), input)
        await refresh()
        return productId
      } finally {
        setPendingAction(null)
      }
    },
    [refresh, requireOrganizationId, supabase],
  )

  const updateProducts = useCallback(
    async (
      updates: ProductBulkUpdate[],
      description: string,
      auditDetails: Record<string, unknown>,
      source: 'bulk' | 'categorize',
    ) => {
      setPendingAction(source)
      try {
        const updatedCount = await bulkUpdateProductsRequest(
          supabase,
          requireOrganizationId(),
          updates,
          description,
          auditDetails,
        )
        await refresh()
        return updatedCount
      } finally {
        setPendingAction(null)
      }
    },
    [refresh, requireOrganizationId, supabase],
  )

  const removeProduct = useCallback(
    async (productId: string) => {
      setPendingAction('delete')
      try {
        await deleteProductRequest(supabase, requireOrganizationId(), productId)
        await refresh()
      } finally {
        setPendingAction(null)
      }
    },
    [refresh, requireOrganizationId, supabase],
  )

  const loadProductRecipe = useCallback(
    (productId: string) => fetchProductRecipeRequest(supabase, requireOrganizationId(), productId),
    [requireOrganizationId, supabase],
  )

  return {
    saveProduct,
    updateProducts,
    removeProduct,
    loadProductRecipe,
    savingProduct: pendingAction === 'save',
    bulkSaving: pendingAction === 'bulk',
    categorizing: pendingAction === 'categorize',
    deleting: pendingAction === 'delete',
  }
}

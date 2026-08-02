import { useEffect, useMemo } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { productTourSteps } from '@/features/products/tour'
import { calculateProductMetrics } from '@/features/products/utils'
import { getProductCategories } from '@/features/products/workspace-utils'
import { useAppTour } from '@/hooks/useAppTour'

import { useProductCatalogWorkspace } from './useProductCatalogWorkspace'
import { useProductFormWorkspace } from './useProductFormWorkspace'
import { useProductMutations } from './useProductMutations'
import { useProductsData } from './useProductsData'

export function useProductWorkspace() {
  const { showAlert } = useNotification()
  useAppTour('urunler', productTourSteps)

  const data = useProductsData()
  const mutations = useProductMutations({
    supabase: data.supabase,
    organizationId: data.organizationId,
    refresh: data.refresh,
  })
  const categories = useMemo(() => getProductCategories(data.products), [data.products])
  const metrics = useMemo(() => calculateProductMetrics(data.products), [data.products])

  useEffect(() => {
    if (data.error) void showAlert(`Ürün verileri yüklenemedi: ${data.error.message}`, 'error')
  }, [data.error, showAlert])

  const productForm = useProductFormWorkspace({
    products: data.products,
    materials: data.materials,
    subRecipes: data.subRecipes,
    categories,
    saving: mutations.savingProduct,
    saveProduct: mutations.saveProduct,
    removeProduct: mutations.removeProduct,
    loadProductRecipe: mutations.loadProductRecipe,
  })

  const productCatalog = useProductCatalogWorkspace({
    products: data.products,
    categories,
    loading: data.loading,
    editingId: productForm.editingId,
    bulkSaving: mutations.bulkSaving,
    categorizing: mutations.categorizing,
    updateProducts: mutations.updateProducts,
    onCreateProduct: productForm.openCreate,
    onEditProduct: productForm.edit,
    onDeleteProduct: productForm.remove,
  })

  return {
    header: productCatalog.header,
    metrics: {
      productCount: data.products.length,
      categoryCount: categories.length,
      totalRevenue: metrics.totalRevenue,
      averageMargin: metrics.averageMargin,
      totalEstimatedContribution: metrics.totalEstimatedContribution,
    },
    filters: productCatalog.filters,
    catalog: productCatalog.catalog,
    form: productForm.props,
    autoCategorize: productCatalog.autoCategorize,
  }
}

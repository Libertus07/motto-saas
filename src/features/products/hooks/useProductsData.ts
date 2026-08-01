import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useOrganization } from '@/context/OrganizationContext'
import { fetchProductWorkspace } from '@/features/products/services/product-service'
import type { Product, ProductMaterial, SubRecipe } from '@/features/products/types'
import { createClient } from '@/lib/supabase'

export function useProductsData() {
  const { activeOrg, loading: organizationLoading } = useOrganization()
  const supabase = useMemo(() => createClient(), [])
  const requestIdRef = useRef(0)
  const [products, setProducts] = useState<Product[]>([])
  const [materials, setMaterials] = useState<ProductMaterial[]>([])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const organizationId = activeOrg?.id

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current

    if (!organizationId) {
      if (!organizationLoading) {
        setProducts([])
        setMaterials([])
        setSubRecipes([])
        setLoading(false)
      }
      return
    }

    setLoading(true)
    setError(null)

    try {
      const workspace = await fetchProductWorkspace(supabase, organizationId)
      if (requestId !== requestIdRef.current) return

      setProducts(workspace.products)
      setMaterials(workspace.materials)
      setSubRecipes(workspace.subRecipes)
    } catch (caughtError: unknown) {
      if (requestId !== requestIdRef.current) return
      setError(caughtError instanceof Error ? caughtError : new Error('Ürün verileri yüklenemedi.'))
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [organizationId, organizationLoading, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  return {
    supabase,
    organizationId,
    products,
    materials,
    subRecipes,
    loading,
    error,
    refresh,
  }
}

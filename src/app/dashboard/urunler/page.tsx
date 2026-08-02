'use client'

import { AutoCategorizeDialog } from '@/features/products/components/AutoCategorizeDialog'
import { ProductCatalog } from '@/features/products/components/ProductCatalog'
import { ProductFilters } from '@/features/products/components/ProductFilters'
import { ProductFormDrawer } from '@/features/products/components/ProductFormDrawer'
import { ProductMetrics } from '@/features/products/components/ProductMetrics'
import { ProductPageHeader } from '@/features/products/components/ProductPageHeader'
import { useProductWorkspace } from '@/features/products/hooks/useProductWorkspace'

export default function Urunler() {
  const workspace = useProductWorkspace()

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      <ProductPageHeader {...workspace.header} />

      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        <ProductMetrics {...workspace.metrics} />
        <ProductFilters {...workspace.filters} />
        <ProductCatalog {...workspace.catalog} />
      </main>

      <ProductFormDrawer {...workspace.form} />
      <AutoCategorizeDialog {...workspace.autoCategorize} />
    </div>
  )
}

'use client'

import dynamic from 'next/dynamic'

import { MaterialCatalog } from '@/features/materials/components/MaterialCatalog'
import { MaterialFilters } from '@/features/materials/components/MaterialFilters'
import { MaterialFormModal } from '@/features/materials/components/MaterialFormModal'
import { MaterialMetrics } from '@/features/materials/components/MaterialMetrics'
import { MaterialPageHeader } from '@/features/materials/components/MaterialPageHeader'
import { useMaterialWorkspace } from '@/features/materials/hooks/useMaterialWorkspace'

const MaterialHistoryModal = dynamic(
  () => import('@/features/materials/components/MaterialHistoryModal').then((module) => module.MaterialHistoryModal),
  { ssr: false },
)
const MaterialAutoCatModal = dynamic(
  () => import('@/features/materials/components/MaterialAutoCatModal').then((module) => module.MaterialAutoCatModal),
  { ssr: false },
)

export default function Hammaddeler() {
  const workspace = useMaterialWorkspace()

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      <MaterialPageHeader {...workspace.header} />
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        <MaterialMetrics {...workspace.metrics} />
        <MaterialFilters {...workspace.filters} />
        <MaterialCatalog {...workspace.catalog} />
      </main>
      <MaterialFormModal {...workspace.form} />
      <MaterialHistoryModal {...workspace.history} />
      <MaterialAutoCatModal {...workspace.autoCategorize} />
    </div>
  )
}

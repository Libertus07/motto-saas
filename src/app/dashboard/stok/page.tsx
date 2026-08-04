'use client'

import { useMemo } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { InventoryHeader } from '@/features/inventory/components/InventoryHeader'
import { InventoryMetrics } from '@/features/inventory/components/InventoryMetrics'
import { InventoryTabs } from '@/features/inventory/components/InventoryTabs'
import { StockAlerts } from '@/features/inventory/components/StockAlerts'
import { StockMovementForm } from '@/features/inventory/components/StockMovementForm'
import { InventoryCountTab } from '@/features/inventory/components/tabs/InventoryCountTab'
import { LossAnalysisTab } from '@/features/inventory/components/tabs/LossAnalysisTab'
import { MovementsTab } from '@/features/inventory/components/tabs/MovementsTab'
import { StockListTab } from '@/features/inventory/components/tabs/StockListTab'
import { useInventoryData } from '@/features/inventory/hooks/useInventoryData'
import { useInventoryUI } from '@/features/inventory/hooks/useInventoryUI'
import { calculateInventoryMetrics } from '@/features/inventory/inventory-metrics'
import { useAppTour } from '@/hooks/useAppTour'

const stockTourSteps = [
  {
    element: '#tour-stock-movement',
    popover: {
      title: 'Stok hareketi kaydedin',
      description: 'Giriş, çıkış veya fireyi kaydederek stok seviyelerini güncel tutun.',
    },
  },
  {
    element: '#tour-stock-tabs',
    popover: {
      title: 'Çalışma alanını seçin',
      description: 'Stok, hareket, sayım ve fire analizi arasında geçiş yapın.',
    },
  },
  {
    element: '#tour-stock-kpis',
    popover: {
      title: 'Kritik seviyeleri izleyin',
      description: 'Toplam değer ve kritik stok uyarıları günlük önceliklerinizi gösterir.',
    },
  },
]

export default function InventoryPage() {
  const { showAlert, showConfirm } = useNotification()
  const ui = useInventoryUI()
  const data = useInventoryData(showAlert, showConfirm)
  const metrics = useMemo(
    () => calculateInventoryMetrics(data.materials, data.movements),
    [data.materials, data.movements],
  )
  useAppTour('stok', stockTourSteps)

  return (
    <div className="min-h-screen bg-stone-950 pb-16 text-stone-100">
      <InventoryHeader onAddMovement={() => ui.setShowForm(true)} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 pt-6 sm:px-8">
        <InventoryMetrics {...metrics} />
        <StockAlerts
          inventoryCountDay={data.inventoryCountDay}
          lastCountDate={data.lastCountDate}
          materials={data.materials}
          onNavigateSayim={() => ui.setActiveTab('sayim')}
        />
        {ui.showForm ? (
          <StockMovementForm
            materials={data.materials}
            form={ui.form}
            onChange={ui.setForm}
            onSubmit={() =>
              data.handleMovement(ui.form, () => {
                ui.resetForm()
                ui.setShowForm(false)
              })
            }
            onCancel={() => ui.setShowForm(false)}
          />
        ) : null}
        <InventoryTabs
          activeTab={ui.activeTab}
          materialCount={data.materials.length}
          movementCount={data.movements.length}
          onChange={ui.setActiveTab}
        />

        {data.loading ? (
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-16 text-center text-stone-400">
            <div className="mb-3 animate-spin text-3xl text-amber-500">📦</div>
            <p className="text-sm font-medium">Stok verileri ve depo hareketleri yükleniyor...</p>
          </div>
        ) : (
          <>
            {ui.activeTab === 'stok' ? (
              <StockListTab
                materials={data.materials}
                inlineMovementMatId={ui.inlineMovementMatId}
                inlineMovementType={ui.inlineMovementType}
                inlineForm={ui.inlineForm}
                onInlineMatIdChange={(id, type) => {
                  ui.setInlineMovementMatId(id)
                  ui.setInlineMovementType(type)
                  ui.setInlineForm({ quantity: '', unit_price: '', note: '' })
                }}
                onInlineFormChange={ui.setInlineForm}
                onInlineSubmit={() => {
                  if (ui.inlineMovementMatId)
                    data.handleInlineSubmit(
                      ui.inlineMovementMatId,
                      ui.inlineMovementType,
                      ui.inlineForm,
                      ui.resetInlineForm,
                    )
                }}
                onInlineCancel={ui.resetInlineForm}
              />
            ) : null}
            {ui.activeTab === 'hareket' ? (
              <MovementsTab
                movements={data.movements}
                searchTerm={ui.movementSearchTerm}
                typeFilter={ui.movementTypeFilter}
                dateFilter={ui.movementDateFilter}
                startDate={ui.movementStartDate}
                endDate={ui.movementEndDate}
                page={ui.movementPage}
                collapsedDates={ui.movementCollapsedDates}
                onSearchChange={ui.setMovementSearchTerm}
                onTypeFilterChange={ui.setMovementTypeFilter}
                onDateFilterChange={ui.setMovementDateFilter}
                onStartDateChange={ui.setMovementStartDate}
                onEndDateChange={ui.setMovementEndDate}
                onPageChange={ui.setMovementPage}
                onClearFilters={ui.clearMovementFilters}
                onToggleDate={ui.toggleMovementDate}
                onExpandAll={() => ui.setMovementCollapsedDates(new Set())}
                onCollapseAll={(dateKeys) => ui.setMovementCollapsedDates(new Set(dateKeys))}
              />
            ) : null}
            {ui.activeTab === 'sayim' ? (
              <InventoryCountTab
                materials={data.materials}
                sayimData={ui.sayimData}
                searchTerm={ui.sayimSearchTerm}
                onSearchChange={ui.setSayimSearchTerm}
                onSayimDataChange={(id, value) => ui.setSayimData({ ...ui.sayimData, [id]: value })}
                onSubmitSayim={() => data.handleSayim(ui.sayimData, ui.resetSayim)}
                onCancelSayim={ui.resetSayim}
              />
            ) : null}
            {ui.activeTab === 'zayi' ? (
              <LossAnalysisTab
                movements={data.movements}
                searchTerm={ui.zayiSearchTerm}
                dateFilter={ui.zayiDateFilter}
                sortBy={ui.zayiSortBy}
                expandedDates={ui.zayiExpandedDates}
                onSearchChange={ui.setZayiSearchTerm}
                onDateFilterChange={ui.setZayiDateFilter}
                onSortByChange={ui.setZayiSortBy}
                onToggleDate={ui.toggleZayiDate}
              />
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}

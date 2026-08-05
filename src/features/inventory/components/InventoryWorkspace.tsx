'use client'

import { useMemo } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { useAppTour } from '@/hooks/useAppTour'

import { useInventoryData } from '../hooks/useInventoryData'
import { useInventoryUI } from '../hooks/useInventoryUI'
import { calculateInventoryMetrics } from '../inventory-metrics'
import { INVENTORY_TOUR_STEPS } from '../tour'
import { InventoryHeader } from './InventoryHeader'
import { InventoryMetrics } from './InventoryMetrics'
import { InventoryTabs } from './InventoryTabs'
import { StockAlerts } from './StockAlerts'
import { StockMovementForm } from './StockMovementForm'
import { InventoryCountTab } from './tabs/InventoryCountTab'
import { LossAnalysisTab } from './tabs/LossAnalysisTab'
import { MovementsTab } from './tabs/MovementsTab'
import { StockListTab } from './tabs/StockListTab'

export function InventoryWorkspace() {
  const { showAlert, showConfirm } = useNotification()
  const ui = useInventoryUI()
  const data = useInventoryData(showAlert, showConfirm)
  const metrics = useMemo(
    () => calculateInventoryMetrics(data.materials, data.movements),
    [data.materials, data.movements],
  )

  useAppTour('stok', INVENTORY_TOUR_STEPS)

  const openInlineMovement = (materialId: string, movementType: 'giris' | 'cikis') => {
    ui.setInlineMovementMatId(materialId)
    ui.setInlineMovementType(movementType)
    ui.setInlineForm({ quantity: '', unit_price: '', note: '' })
  }

  const submitInlineMovement = () => {
    if (!ui.inlineMovementMatId) return
    void data.handleInlineSubmit(ui.inlineMovementMatId, ui.inlineMovementType, ui.inlineForm, ui.resetInlineForm)
  }

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
              void data.handleMovement(ui.form, () => {
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
                onInlineMatIdChange={openInlineMovement}
                onInlineFormChange={ui.setInlineForm}
                onInlineSubmit={submitInlineMovement}
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
                onSubmitSayim={() => void data.handleSayim(ui.sayimData, ui.resetSayim)}
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

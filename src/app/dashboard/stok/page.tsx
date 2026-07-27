'use client'

import { useMemo } from 'react'
import { useNotification } from '@/components/NotificationProvider'
import { useInventoryData } from '@/features/inventory/hooks/useInventoryData'
import { useInventoryUI } from '@/features/inventory/hooks/useInventoryUI'
import { StockAlerts } from '@/features/inventory/components/StockAlerts'
import { StockMovementForm } from '@/features/inventory/components/StockMovementForm'
import { StockListTab } from '@/features/inventory/components/tabs/StockListTab'
import { MovementsTab } from '@/features/inventory/components/tabs/MovementsTab'
import { InventoryCountTab } from '@/features/inventory/components/tabs/InventoryCountTab'
import { LossAnalysisTab } from '@/features/inventory/components/tabs/LossAnalysisTab'
import { formatCurrency } from '@/lib/format'

export default function InventoryPage() {
    const { showAlert, showConfirm } = useNotification()

    const ui = useInventoryUI()
    const data = useInventoryData(showAlert, showConfirm)

    // Executive KPI Computed Stats
    const totalMaterialsCount = data.materials.length
    
    const totalStockValue = useMemo(() => {
        return data.materials.reduce((acc, m) => acc + ((m.stock_quantity || 0) * (m.price_per_unit || 0)), 0)
    }, [data.materials])

    const criticalMaterialsCount = useMemo(() => {
        return data.materials.filter(
            m => (m.critical_stock_level || 0) > 0 && (m.stock_quantity || 0) <= (m.critical_stock_level || 0)
        ).length
    }, [data.materials])

    const currentMonthLossCost = useMemo(() => {
        const now = new Date()
        return data.movements
            .filter(mov => {
                if (mov.movement_type !== 'fire') return false
                const d = new Date(mov.created_at)
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            })
            .reduce((acc, mov) => acc + (mov.quantity * (mov.unit_price || 0)), 0)
    }, [data.movements])

    const tabs = [
        { key: 'stok', label: 'Stok Durumu', icon: '📦', badge: totalMaterialsCount },
        { key: 'hareket', label: 'Hareketler', icon: '📋', badge: data.movements.length },
        { key: 'sayim', label: 'Sayım Yap', icon: '🔢' },
        { key: 'zayi', label: 'Fire / Zayi (TL)', icon: '🔥', badgeColor: 'bg-rose-500/20 text-rose-400' }
    ]

    return (
        <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
            {/* ──────────────── HEADER BAR ──────────────── */}
            <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
                            📦
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Stok Takibi</h1>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                                    Depo & Envanter
                                </span>
                            </div>
                            <p className="text-stone-400 text-xs mt-0.5">
                                Mevcut stok durumları, stok hareketleri, fiziksel sayım ve fire/zayi maliyet takibi.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => ui.setShowForm(true)}
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 whitespace-nowrap"
                    >
                        <span>➕</span>
                        <span>Stok Hareketi Ekle</span>
                    </button>
                </div>
            </header>

            {/* ──────────────── MAIN CONTAINER ──────────────── */}
            <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
                {/* EXECUTIVE KPI METRIC CARDS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
                    <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-stone-400 text-xs font-semibold">Toplam Stok Kalemi</span>
                            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                                📦
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-white">{totalMaterialsCount} Kalem</div>
                        <div className="text-stone-400 text-[11px] mt-1">Aktif Depo Hammaddesi</div>
                    </div>

                    <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-stone-400 text-xs font-semibold">Toplam Stok Değeri</span>
                            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                                💰
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-amber-400">{formatCurrency(totalStockValue)}</div>
                        <div className="text-stone-400 text-[11px] mt-1">Mevcut Depo Maliyeti</div>
                    </div>

                    <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-stone-400 text-xs font-semibold">Kritik Stok Uyarısı</span>
                            <span
                                className={`p-2 rounded-xl text-base ${
                                    criticalMaterialsCount > 0
                                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                }`}
                            >
                                🚨
                            </span>
                        </div>
                        <div
                            className={`text-xl sm:text-2xl font-black ${
                                criticalMaterialsCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                        >
                            {criticalMaterialsCount} Ürün
                        </div>
                        <div className="text-stone-400 text-[11px] mt-1">
                            {criticalMaterialsCount > 0 ? 'Kritik Seviyenin Altında!' : 'Tüm Stoklar Yeterli'}
                        </div>
                    </div>

                    <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-stone-400 text-xs font-semibold">Bu Ayki Fire/Zayi</span>
                            <span className="p-2 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20 text-base">
                                🔥
                            </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black text-rose-400">{formatCurrency(currentMonthLossCost)}</div>
                        <div className="text-stone-400 text-[11px] mt-1">Aylık Fire/Zayi Zarar Tutar</div>
                    </div>
                </div>

                {/* ALERTS SECTION */}
                <StockAlerts
                    inventoryCountDay={data.inventoryCountDay}
                    lastCountDate={data.lastCountDate}
                    materials={data.materials}
                    onNavigateSayim={() => ui.setActiveTab('sayim')}
                />

                {/* MODAL FORM FOR MOVEMENT */}
                {ui.showForm && (
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
                )}

                {/* ──────────────── TAB NAVIGATION BAR ──────────────── */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-stone-900/60 p-2 rounded-2xl border border-stone-800/80 backdrop-blur-md scrollbar-none">
                    {tabs.map(tab => {
                        const isActive = ui.activeTab === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => ui.setActiveTab(tab.key as any)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95 ${
                                    isActive
                                        ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                                        : 'bg-stone-950/60 text-stone-400 hover:text-white hover:bg-stone-800/60 border border-stone-800/60'
                                }`}
                            >
                                <span>{tab.icon}</span>
                                <span>{tab.label}</span>
                                {tab.badge != null && (
                                    <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                            isActive
                                                ? 'bg-stone-950/20 text-stone-950'
                                                : tab.badgeColor || 'bg-stone-800 text-stone-300'
                                        }`}
                                    >
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* TAB CONTENT AREAS */}
                {data.loading ? (
                    <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
                        <div className="animate-spin text-amber-500 text-3xl mb-3">📦</div>
                        <p className="text-sm font-medium">Stok Verileri ve Depo Hareketleri Yükleniyor...</p>
                    </div>
                ) : (
                    <>
                        {ui.activeTab === 'stok' && (
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
                                    if (ui.inlineMovementMatId) {
                                        data.handleInlineSubmit(
                                            ui.inlineMovementMatId,
                                            ui.inlineMovementType,
                                            ui.inlineForm,
                                            ui.resetInlineForm
                                        )
                                    }
                                }}
                                onInlineCancel={ui.resetInlineForm}
                            />
                        )}

                        {ui.activeTab === 'hareket' && (
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
                                onCollapseAll={() => {}}
                            />
                        )}

                        {ui.activeTab === 'sayim' && (
                            <InventoryCountTab
                                materials={data.materials}
                                sayimData={ui.sayimData}
                                searchTerm={ui.sayimSearchTerm}
                                onSearchChange={ui.setSayimSearchTerm}
                                onSayimDataChange={(id, val) => ui.setSayimData({ ...ui.sayimData, [id]: val })}
                                onSubmitSayim={() => data.handleSayim(ui.sayimData, ui.resetSayim)}
                                onCancelSayim={ui.resetSayim}
                            />
                        )}

                        {ui.activeTab === 'zayi' && (
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
                        )}
                    </>
                )}
            </main>
        </div>
    )
}
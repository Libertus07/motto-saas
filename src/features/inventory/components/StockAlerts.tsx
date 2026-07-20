import React from 'react'
import { Material, InventoryTab } from '../types'

type StockAlertsProps = {
    inventoryCountDay: number
    lastCountDate: Date | null
    materials: Material[]
    onNavigateSayim: () => void
}

export function StockAlerts({ inventoryCountDay, lastCountDate, materials, onNavigateSayim }: StockAlertsProps) {
    const todayForCount = new Date()
    const isCountDay = todayForCount.getDate() === inventoryCountDay
    
    let daysSinceLastCount = null
    if (lastCountDate) {
        const d1 = new Date(todayForCount.getFullYear(), todayForCount.getMonth(), todayForCount.getDate())
        const d2 = new Date(lastCountDate.getFullYear(), lastCountDate.getMonth(), lastCountDate.getDate())
        daysSinceLastCount = Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
    }
    const isDelayed = daysSinceLastCount !== null && daysSinceLastCount > 30
    
    const criticalMaterials = materials.filter(i => (i.stock_quantity || 0) <= (i.critical_stock_level || 0) && (i.critical_stock_level || 0) > 0)

    return (
        <>
            {/* Sayım Günü Uyarısı */}
            {isCountDay && (
                <div className="bg-amber-900/30 border border-amber-500 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🔔</span>
                        <div>
                            <h3 className="font-bold text-amber-400">Bugün Sayım Günü!</h3>
                            <p className="text-stone-300 text-sm">Ayarlarınızda belirlenen aylık sayım günü geldi. Lütfen sayım sekmesinden stoklarınızı güncelleyin.</p>
                        </div>
                    </div>
                    <button onClick={onNavigateSayim} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap">
                        Hemen Sayım Yap
                    </button>
                </div>
            )}

            {/* Gecikme Uyarısı */}
            {isDelayed && !isCountDay && (
                <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 mb-6 flex items-center gap-3">
                    <span className="text-3xl">🚨</span>
                    <div>
                        <h3 className="font-bold text-red-400">Sayım Gecikmesi Tespit Edildi!</h3>
                        <p className="text-stone-300 text-sm">Son sayımınızın üzerinden <strong>{daysSinceLastCount} gün</strong> geçmiş. Teorik stoklarınız gerçeği yansıtmıyor olabilir, acilen sayım yapmanız önerilir.</p>
                    </div>
                </div>
            )}

            {/* Kritik Stok Uyarısı */}
            {criticalMaterials.length > 0 && (
                <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 mb-6">
                    <h3 className="font-bold text-red-400 mb-2">🚨 Kritik Stok Uyarısı</h3>
                    <div className="flex flex-wrap gap-2">
                        {criticalMaterials.map(mat => (
                            <span key={mat.id} className="bg-red-900/50 text-red-300 px-3 py-1 rounded-full text-sm">
                                {mat.name}: {mat.stock_quantity || 0} {mat.unit} kaldı
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </>
    )
}

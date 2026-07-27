import React from 'react'
import { Material } from '../types'

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

    const criticalMaterials = materials.filter(
        i => (i.stock_quantity || 0) <= (i.critical_stock_level || 0) && (i.critical_stock_level || 0) > 0
    )

    if (!isCountDay && !isDelayed && criticalMaterials.length === 0) {
        return null
    }

    return (
        <div className="space-y-4">
            {/* Sayım Günü Uyarısı */}
            {isCountDay && (
                <div className="bg-amber-500/10 border border-amber-500/30 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl border border-amber-500/30 shadow-inner">
                            🔔
                        </div>
                        <div>
                            <h3 className="font-bold text-amber-400 text-sm sm:text-base">Bugün Aylık Stok Sayım Günü!</h3>
                            <p className="text-stone-300 text-xs mt-0.5">
                                Sistem ayarlarınızda belirlenen sayım günü geldi. Lütfen sayım sekmesinden stoklarınızı doğrulayın.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onNavigateSayim}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold px-4 py-2 rounded-xl text-xs sm:text-sm transition-all shadow-md shadow-amber-500/20 active:scale-95 whitespace-nowrap"
                    >
                        Hemen Sayım Yap ➔
                    </button>
                </div>
            )}

            {/* Gecikme Uyarısı */}
            {isDelayed && !isCountDay && (
                <div className="bg-rose-500/10 border border-rose-500/30 backdrop-blur-md rounded-2xl p-4 sm:p-5 flex items-center gap-3 shadow-xl">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl border border-rose-500/30 shadow-inner">
                        🚨
                    </div>
                    <div>
                        <h3 className="font-bold text-rose-400 text-sm sm:text-base">Sayım Gecikmesi Tespit Edildi!</h3>
                        <p className="text-stone-300 text-xs mt-0.5">
                            Son sayımınızın üzerinden <strong className="text-rose-300 underline">{daysSinceLastCount} gün</strong> geçmiş.
                            Teorik stoklarınız gerçeği yansıtmıyor olabilir, acilen sayım yapmanız önerilir.
                        </p>
                    </div>
                </div>
            )}

            {/* Kritik Stok Uyarısı */}
            {criticalMaterials.length > 0 && (
                <div className="bg-rose-950/40 border border-rose-500/30 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">🚨</span>
                        <h3 className="font-extrabold text-rose-400 text-sm sm:text-base">
                            Kritik Stok Uyarısı ({criticalMaterials.length} Ürün)
                        </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {criticalMaterials.map(mat => (
                            <span
                                key={mat.id}
                                className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"
                            >
                                <span>{mat.name}:</span>
                                <span className="font-bold text-white">
                                    {mat.stock_quantity || 0} {mat.unit}
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

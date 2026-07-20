import React, { useMemo } from 'react'
import { formatCurrency, formatDate } from "@/lib/format"
import { Movement, ZayiDateFilter, ZayiSortBy } from '../../types'

type LossAnalysisTabProps = {
    movements: Movement[]
    searchTerm: string
    dateFilter: ZayiDateFilter
    sortBy: ZayiSortBy
    expandedDates: string[]
    onSearchChange: (val: string) => void
    onDateFilterChange: (val: ZayiDateFilter) => void
    onSortByChange: (val: ZayiSortBy) => void
    onToggleDate: (dateKey: string) => void
}

export function LossAnalysisTab({
    movements, searchTerm, dateFilter, sortBy, expandedDates,
    onSearchChange, onDateFilterChange, onSortByChange, onToggleDate
}: LossAnalysisTabProps) {
    const fireMovements = movements.filter(m => m.movement_type === 'fire')
    
    const filteredZayiMovements = useMemo(() => {
        return [...fireMovements.filter(m => {
            const matchesSearch = m.materials?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  m.note?.toLowerCase().includes(searchTerm.toLowerCase())
            if (!matchesSearch) return false
    
            if (dateFilter === 'tumu') return true
            
            const movDate = new Date(m.created_at)
            const todayDateObj = new Date()
            todayDateObj.setHours(0, 0, 0, 0)
            
            if (dateFilter === 'bugun') {
                return movDate >= todayDateObj
            } else if (dateFilter === 'bu_hafta') {
                const lastWeek = new Date(todayDateObj)
                lastWeek.setDate(lastWeek.getDate() - 7)
                return movDate >= lastWeek
            } else if (dateFilter === 'bu_ay') {
                return movDate.getMonth() === todayDateObj.getMonth() && movDate.getFullYear() === todayDateObj.getFullYear()
            }
            return true
        })].sort((a, b) => {
            if (sortBy === 'tarih_yeni') {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            } else if (sortBy === 'tarih_eski') {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            } else if (sortBy === 'tutar_yuksek') {
                const lossA = a.quantity * (a.unit_price || 0)
                const lossB = b.quantity * (b.unit_price || 0)
                return lossB - lossA
            } else if (sortBy === 'tutar_dusuk') {
                const lossA = a.quantity * (a.unit_price || 0)
                const lossB = b.quantity * (b.unit_price || 0)
                return lossA - lossB
            }
            return 0
        })
    }, [fireMovements, searchTerm, dateFilter, sortBy])

    const totalZayiMaliyeti = filteredZayiMovements.reduce((t, m) => t + (m.quantity * (m.unit_price || 0)), 0)

    const zayiAnalysis: Record<string, number> = {}
    filteredZayiMovements.forEach(m => {
        const name = m.materials?.name || 'Bilinmeyen'
        const loss = m.quantity * (m.unit_price || 0)
        zayiAnalysis[name] = (zayiAnalysis[name] || 0) + loss
    })

    const topZayiProducts = Object.entries(zayiAnalysis)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

    const groupedZayiMovements = useMemo(() => {
        const groups: Record<string, typeof filteredZayiMovements> = {}
        const todayDateObj2 = new Date()
        const yesterday = new Date(todayDateObj2)
        yesterday.setDate(yesterday.getDate() - 1)

        filteredZayiMovements.forEach(log => {
            const date = new Date(log.created_at)
            let dateKey = formatDate(date)
            
            if (date.toDateString() === todayDateObj2.toDateString()) {
                dateKey = 'Bugün'
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = 'Dün'
            }

            if (!groups[dateKey]) {
                groups[dateKey] = []
            }
            groups[dateKey].push(log)
        })
        return groups
    }, [filteredZayiMovements])

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-stone-900 border border-red-500/30 rounded-xl p-5 md:col-span-1 flex flex-col justify-center">
                    <h3 className="text-stone-400 text-sm mb-2">Toplam Fire/Zayi Maliyeti</h3>
                    <p className="text-3xl font-bold text-red-400">{formatCurrency(totalZayiMaliyeti)}</p>
                    <p className="text-stone-500 text-xs mt-2">Bu dönemdeki toplam zarar</p>
                </div>
                
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 md:col-span-2">
                    <h3 className="text-stone-400 text-sm mb-3">En Çok Fire Verilen Ürünler (Maliyet Bazlı)</h3>
                    <div className="space-y-3">
                        {topZayiProducts.length > 0 ? topZayiProducts.map((p, i) => {
                            const percentage = totalZayiMaliyeti > 0 ? (p.total / totalZayiMaliyeti) * 100 : 0
                            return (
                                <div key={i} className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-medium text-stone-200">{p.name}</span>
                                        <span className="text-red-400 font-bold">{formatCurrency(p.total)}</span>
                                    </div>
                                    <div className="w-full bg-stone-950 rounded-full h-1.5 border border-stone-800">
                                        <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                    </div>
                                </div>
                            )
                        }) : (
                            <p className="text-stone-500 text-sm italic">Henüz fire verisi bulunmuyor.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="text-stone-400 text-xs mb-1 block">Ara</label>
                    <input
                        type="text"
                        placeholder="Ürün veya not ara..."
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                </div>
                <div className="w-full md:w-48">
                    <label className="text-stone-400 text-xs mb-1 block">Zaman Aralığı</label>
                    <select
                        value={dateFilter}
                        onChange={e => onDateFilterChange(e.target.value as ZayiDateFilter)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                        <option value="bugun">Bugün</option>
                        <option value="bu_hafta">Bu Hafta</option>
                        <option value="bu_ay">Bu Ay</option>
                        <option value="tumu">Tüm Zamanlar</option>
                    </select>
                </div>
                <div className="w-full md:w-48">
                    <label className="text-stone-400 text-xs mb-1 block">Sıralama</label>
                    <select
                        value={sortBy}
                        onChange={e => onSortByChange(e.target.value as ZayiSortBy)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                        <option value="tarih_yeni">En Yeni</option>
                        <option value="tarih_eski">En Eski</option>
                        <option value="tutar_yuksek">Tutar (Yüksekten Düşüğe)</option>
                        <option value="tutar_dusuk">Tutar (Düşükten Yükseğe)</option>
                    </select>
                </div>
            </div>

            {Object.keys(groupedZayiMovements).length === 0 ? (
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
                    <p className="text-stone-400">Bu filtrelere uygun fire/zayi kaydı bulunamadı.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {Object.entries(groupedZayiMovements).map(([dateKey, items]) => {
                        const isExpanded = expandedDates.includes(dateKey)
                        const dailyTotal = items.reduce((sum, item) => sum + (item.quantity * (item.unit_price || 0)), 0)

                        return (
                            <div key={dateKey} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                <div 
                                    className="px-4 py-3 bg-stone-950/50 flex justify-between items-center cursor-pointer hover:bg-stone-800 transition-colors"
                                    onClick={() => onToggleDate(dateKey)}
                                >
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-amber-400">{dateKey}</h3>
                                        <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full">
                                            {items.length} kayıt
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-red-400 font-bold">{formatCurrency(dailyTotal)}</span>
                                        <span className="text-stone-500 text-sm">
                                            {isExpanded ? '▼' : '▶'}
                                        </span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="overflow-x-auto w-full border-t border-stone-800/50">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-stone-800/30">
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs w-24">Saat</th>
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs">Hammadde</th>
                                                    <th className="text-right px-4 py-2 text-stone-500 text-xs w-28">Miktar</th>
                                                    <th className="text-right px-4 py-2 text-stone-500 text-xs w-32">Birim Fiyat</th>
                                                    <th className="text-right px-4 py-2 text-stone-500 text-xs w-32">Toplam Zarar</th>
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs">Not</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map(mov => {
                                                    const loss = mov.quantity * (mov.unit_price || 0)
                                                    const timeStr = new Date(mov.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                                                    
                                                    return (
                                                        <tr key={mov.id} className="border-b border-stone-800/20 hover:bg-stone-800/40 transition-colors last:border-0">
                                                            <td className="px-4 py-3 text-stone-400 text-sm">{timeStr}</td>
                                                            <td className="px-4 py-3 font-medium text-stone-200">{mov.materials?.name}</td>
                                                            <td className="px-4 py-3 text-right font-bold text-orange-400">
                                                                {mov.quantity} <span className="text-xs font-normal opacity-70">{mov.materials?.unit}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-stone-400 text-sm">
                                                                {formatCurrency(mov.unit_price || 0)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-bold text-red-400">
                                                                {formatCurrency(loss)}
                                                            </td>
                                                            <td className="px-4 py-3 text-stone-400 text-sm max-w-[200px] truncate" title={mov.note || ''}>
                                                                {mov.note || '-'}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

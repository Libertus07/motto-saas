import React, { useMemo } from 'react'
import { formatCurrency, formatDate } from "@/lib/format"
import { Movement, MovementDateFilter, MovementTypeFilter } from '../../types'

type MovementsTabProps = {
    movements: Movement[]
    searchTerm: string
    typeFilter: MovementTypeFilter
    dateFilter: MovementDateFilter
    startDate: string
    endDate: string
    page: number
    collapsedDates: Set<string>
    onSearchChange: (value: string) => void
    onTypeFilterChange: (value: MovementTypeFilter) => void
    onDateFilterChange: (value: MovementDateFilter) => void
    onStartDateChange: (value: string) => void
    onEndDateChange: (value: string) => void
    onPageChange: (page: number) => void
    onClearFilters: () => void
    onToggleDate: (dateKey: string) => void
    onExpandAll: () => void
    onCollapseAll: () => void
}

const movementDaysPerPage = 7

export function MovementsTab({
    movements,
    searchTerm, typeFilter, dateFilter, startDate, endDate, page, collapsedDates,
    onSearchChange, onTypeFilterChange, onDateFilterChange, onStartDateChange, onEndDateChange,
    onPageChange, onClearFilters, onToggleDate, onExpandAll, onCollapseAll
}: MovementsTabProps) {

    const filteredMovementRows = useMemo(() => {
        return movements.filter(mov => {
            const materialName = mov.materials?.name?.toLowerCase() || ''
            const noteText = mov.note?.toLowerCase() || ''
            const search = searchTerm.trim().toLowerCase()

            const matchesSearch = search.length === 0 || materialName.includes(search) || noteText.includes(search)
            if (!matchesSearch) return false

            const matchesType = typeFilter === 'tumu' || mov.movement_type === typeFilter
            if (!matchesType) return false

            if (dateFilter === 'tumu') return true

            const movementDate = new Date(mov.created_at)
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            if (dateFilter === 'bugun') {
                return movementDate >= todayStart
            }

            if (dateFilter === 'bu_hafta') {
                const weekStart = new Date(todayStart)
                weekStart.setDate(weekStart.getDate() - 7)
                return movementDate >= weekStart
            }

            if (dateFilter === 'bu_ay') {
                return movementDate.getMonth() === todayStart.getMonth() && movementDate.getFullYear() === todayStart.getFullYear()
            }

            if (dateFilter === 'custom') {
                const dateStr = mov.created_at.split('T')[0]
                if (startDate && dateStr < startDate) return false
                if (endDate && dateStr > endDate) return false
            }

            return true
        })
    }, [movements, searchTerm, typeFilter, dateFilter, startDate, endDate])

    const groupedMovementRows = useMemo(() => {
        const groups: Array<{ dateKey: string; dateLabel: string; items: Movement[] }> = []
        const toLocalDateKey = (date: Date) => [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-')
        const todayDateObj = new Date()
        const yesterday = new Date(todayDateObj)
        yesterday.setDate(yesterday.getDate() - 1)
        const todayKey = toLocalDateKey(todayDateObj)
        const yesterdayKey = toLocalDateKey(yesterday)

        filteredMovementRows.forEach((mov) => {
            const date = new Date(mov.created_at)
            const dateKey = toLocalDateKey(date)
            const dateLabel = dateKey === todayKey ? 'Bugün' : dateKey === yesterdayKey ? 'Dün' : formatDate(date)
            const existingGroup = groups.find((group) => group.dateKey === dateKey)

            if (existingGroup) {
                existingGroup.items.push(mov)
            } else {
                groups.push({ dateKey, dateLabel, items: [mov] })
            }
        })

        return groups
    }, [filteredMovementRows])

    const totalMovementPages = Math.max(1, Math.ceil(groupedMovementRows.length / movementDaysPerPage))
    const safeMovementPage = Math.min(page, totalMovementPages)
    const paginatedMovementGroups = useMemo(() => {
        return groupedMovementRows.slice((safeMovementPage - 1) * movementDaysPerPage, safeMovementPage * movementDaysPerPage)
    }, [groupedMovementRows, safeMovementPage])
    
    const movementSummary = useMemo(() => {
        const countByType = (type: string) => filteredMovementRows.filter(mov => mov.movement_type === type).length
        const giris = countByType('giris')
        const cikis = countByType('cikis')
        const fire = countByType('fire')
        const sayim = countByType('sayim')

        return {
            total: filteredMovementRows.length,
            giris, cikis, fire, sayim,
            control: fire + sayim
        }
    }, [filteredMovementRows])

    const activeMovementFilters = useMemo(() => {
        const filters: string[] = []
        if (searchTerm.trim()) filters.push(`Arama: "${searchTerm.trim()}"`)
        if (typeFilter !== 'tumu') {
            const typeLabelMap: Record<string, string> = { giris: 'Giriş', cikis: 'Çıkış', fire: 'Fire', sayim: 'Sayım' }
            filters.push(`Tür: ${typeLabelMap[typeFilter]}`)
        }
        const dateLabelMap: Record<string, string> = { bugun: 'Bugün', bu_hafta: 'Son 7 Gün', bu_ay: 'Bu Ay', tumu: 'Tüm Zamanlar', custom: 'Özel Aralık' }
        if (dateFilter === 'custom') {
            if (startDate || endDate) filters.push(`Tarih: ${startDate || '...'} → ${endDate || '...'}`)
            else filters.push(`Tarih: ${dateLabelMap[dateFilter]}`)
        } else if (dateFilter !== 'tumu') {
            filters.push(`Tarih: ${dateLabelMap[dateFilter]}`)
        }
        return filters
    }, [searchTerm, typeFilter, dateFilter, startDate, endDate])

    return (
        <div className="space-y-6">
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                    <label className="text-stone-400 text-xs mb-1 block">Arama</label>
                    <input
                        type="text"
                        placeholder="Ürün veya not ara..."
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                </div>
                <div className="w-full md:w-48">
                    <label className="text-stone-400 text-xs mb-1 block">Hareket Türü</label>
                    <select
                        value={typeFilter}
                        onChange={e => onTypeFilterChange(e.target.value as MovementTypeFilter)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                        <option value="tumu">Tümü</option>
                        <option value="giris">Giriş</option>
                        <option value="cikis">Çıkış</option>
                        <option value="fire">Fire</option>
                        <option value="sayim">Sayım Düzeltmesi</option>
                    </select>
                </div>
                <div className="w-full md:w-48">
                    <label className="text-stone-400 text-xs mb-1 block">Tarih</label>
                    <select
                        value={dateFilter}
                        onChange={e => onDateFilterChange(e.target.value as MovementDateFilter)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    >
                        <option value="bugun">Bugün</option>
                        <option value="bu_hafta">Son 7 Gün</option>
                        <option value="bu_ay">Bu Ay</option>
                        <option value="tumu">Tüm Zamanlar</option>
                        <option value="custom">Özel Aralık</option>
                    </select>
                </div>
                {dateFilter === 'custom' && (
                    <div className="flex gap-2 w-full md:w-auto">
                        <div>
                            <label className="text-stone-400 text-xs mb-1 block">Başlangıç</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => onStartDateChange(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                            />
                        </div>
                        <div>
                            <label className="text-stone-400 text-xs mb-1 block">Bitiş</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => onEndDateChange(e.target.value)}
                                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                            />
                        </div>
                    </div>
                )}
            </div>

            {activeMovementFilters.length > 0 && (
                <div className="flex items-center justify-between bg-stone-900 border border-stone-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-stone-400 text-sm">Aktif Filtreler:</span>
                        {activeMovementFilters.map((filter, i) => (
                            <span key={i} className="bg-stone-800 text-stone-300 px-2 py-1 rounded-md text-xs border border-stone-700">
                                {filter}
                            </span>
                        ))}
                    </div>
                    <button
                        onClick={onClearFilters}
                        className="text-stone-400 hover:text-white text-sm underline px-2 whitespace-nowrap"
                    >
                        Filtreleri Temizle
                    </button>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-center text-center">
                    <span className="text-stone-400 text-xs mb-1">Toplam İşlem</span>
                    <span className="text-2xl font-bold text-white">{movementSummary.total}</span>
                </div>
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-center text-center">
                    <span className="text-green-500/70 text-xs mb-1">Girişler</span>
                    <span className="text-2xl font-bold text-green-400">{movementSummary.giris}</span>
                </div>
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-center text-center">
                    <span className="text-red-500/70 text-xs mb-1">Çıkışlar</span>
                    <span className="text-2xl font-bold text-red-400">{movementSummary.cikis}</span>
                </div>
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-center text-center">
                    <span className="text-amber-500/70 text-xs mb-1">Düzeltme / Zayi</span>
                    <span className="text-2xl font-bold text-amber-400">{movementSummary.control}</span>
                </div>
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col justify-center items-center text-center gap-2">
                    <span className="text-stone-400 text-xs mb-1 w-full">Görünüm</span>
                    <div className="flex gap-2 w-full justify-center">
                        <button onClick={onExpandAll} className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs py-1.5 rounded transition-colors" title="Tüm tarihleri genişlet">Genişlet</button>
                        <button onClick={onCollapseAll} className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs py-1.5 rounded transition-colors" title="Tüm tarihleri daralt">Daralt</button>
                    </div>
                </div>
            </div>

            {paginatedMovementGroups.length === 0 ? (
                <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center">
                    <p className="text-stone-400">Bu filtrelere uygun hareket bulunamadı.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {paginatedMovementGroups.map((group) => {
                        const isCollapsed = collapsedDates.has(group.dateKey)
                        return (
                            <div key={group.dateKey} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                <div 
                                    className="px-4 py-3 bg-stone-950/50 flex justify-between items-center cursor-pointer hover:bg-stone-800 transition-colors"
                                    onClick={() => onToggleDate(group.dateKey)}
                                >
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-amber-400">{group.dateLabel}</h3>
                                        <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full">
                                            {group.items.length} işlem
                                        </span>
                                    </div>
                                    <span className="text-stone-500 text-sm">
                                        {isCollapsed ? '▼ Görüntüle' : '▲ Daralt'}
                                    </span>
                                </div>

                                {!isCollapsed && (
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-stone-800/50">
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs w-24">Saat</th>
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs">Hammadde</th>
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs w-32">Tür</th>
                                                    <th className="text-right px-4 py-2 text-stone-500 text-xs w-28">Miktar</th>
                                                    <th className="text-right px-4 py-2 text-stone-500 text-xs w-32">B. Fiyat</th>
                                                    <th className="text-left px-4 py-2 text-stone-500 text-xs">Not</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {group.items.map(mov => {
                                                    const isGiris = mov.movement_type === 'giris'
                                                    const isCikis = mov.movement_type === 'cikis'
                                                    const isFire = mov.movement_type === 'fire'
                                                    const isSayim = mov.movement_type === 'sayim'

                                                    const typeLabel = isGiris ? 'Giriş' : isCikis ? 'Çıkış' : isFire ? 'Fire' : 'Sayım Düzeltmesi'
                                                    const typeColor = isGiris ? 'text-green-400' : isCikis ? 'text-red-400' : isFire ? 'text-orange-400' : 'text-blue-400'
                                                    const typeBg = isGiris ? 'bg-green-900/20' : isCikis ? 'bg-red-900/20' : isFire ? 'bg-orange-900/20' : 'bg-blue-900/20'
                                                    
                                                    const timeStr = new Date(mov.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

                                                    return (
                                                        <tr key={mov.id} className="border-b border-stone-800/30 hover:bg-stone-800/50 transition-colors last:border-0">
                                                            <td className="px-4 py-2 text-stone-400 text-sm">{timeStr}</td>
                                                            <td className="px-4 py-2 font-medium text-stone-200">{mov.materials?.name}</td>
                                                            <td className="px-4 py-2">
                                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${typeColor} ${typeBg}`}>
                                                                    {typeLabel}
                                                                </span>
                                                            </td>
                                                            <td className={`px-4 py-2 text-right font-bold ${typeColor}`}>
                                                                {isGiris || isSayim ? '+' : '-'}{mov.quantity} <span className="text-xs font-normal opacity-70">{mov.materials?.unit}</span>
                                                            </td>
                                                            <td className="px-4 py-2 text-right text-stone-400 text-sm">
                                                                {mov.unit_price ? formatCurrency(mov.unit_price) : '-'}
                                                            </td>
                                                            <td className="px-4 py-2 text-stone-400 text-sm max-w-[200px] truncate" title={mov.note || ''}>
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

            {totalMovementPages > 1 && (
                <div className="flex justify-between items-center bg-stone-900 border border-stone-800 rounded-xl p-3">
                    <button
                        disabled={safeMovementPage === 1}
                        onClick={() => onPageChange(safeMovementPage - 1)}
                        className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                        Geri
                    </button>
                    <span className="text-stone-400 text-sm">Sayfa {safeMovementPage} / {totalMovementPages}</span>
                    <button
                        disabled={safeMovementPage === totalMovementPages}
                        onClick={() => onPageChange(safeMovementPage + 1)}
                        className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                        İleri
                    </button>
                </div>
            )}
        </div>
    )
}

'use client'

import { useState, useEffect, useMemo } from 'react'
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency, formatDate } from "@/lib/format";
import { HistoryAccordion } from '@/components/ui/HistoryAccordion';

type SaleItem = {
    id: string
    sale_date: string
    quantity: number
    total_price: number
    batch_id: string | null
    product_id: string | null
    document_url?: string | null
    product_name?: string
}

type GroupedSale = {
    date: string
    batchId: string | null
    totalRevenue: number
    totalItems: number
    documentUrl?: string | null
    items: SaleItem[]
}

type GroupedMonth = {
    monthKey: string // '2025-09'
    monthLabel: string // 'Eylül 2025'
    totalRevenue: number
    totalItems: number
    days: GroupedSale[]
}

export default function GecmisRaporlar() {
    const [allGroups, setAllGroups] = useState<GroupedSale[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingDate, setDeletingDate] = useState<string | null>(null)
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
    const [expandedDate, setExpandedDate] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const { showAlert, showConfirm } = useNotification()
    
    // Filters & Sorting
    const [selectedMonth, setSelectedMonth] = useState<string>('all')
    const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'revenue_desc'>('date_desc')
    
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchSales()
    }, [])

    const fetchSales = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('sales')
            .select(`
                id,
                sale_date,
                quantity,
                total_price,
                batch_id,
                product_id,
                document_url
            `)
            .order('sale_date', { ascending: false })

        if (error) {
            devError('Satışlar çekilirken hata:', error)
            setLoading(false)
            return
        }

        const { data: productsData } = await supabase.from('products').select('id, name')
        const productMap: Record<string, string> = {}
        if (productsData) {
            productsData.forEach(p => {
                productMap[p.id] = p.name
            })
        }

        const groups: Record<string, GroupedSale> = {}
        data?.forEach((item: any) => {
            const date = item.sale_date
            item.product_name = item.product_id && productMap[item.product_id] 
                ? productMap[item.product_id] 
                : 'Bilinmeyen Ürün'

            if (!groups[date]) {
                groups[date] = {
                    date,
                    batchId: item.batch_id,
                    totalRevenue: 0,
                    totalItems: 0,
                    documentUrl: item.document_url || null,
                    items: []
                }
            }
            groups[date].items.push(item)
            groups[date].totalRevenue += item.total_price
            groups[date].totalItems += item.quantity
        })

        const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setAllGroups(sortedGroups)
        setLoading(false)
    }

    // Gruplama, Filtreleme ve Sıralama işlemleri
    const groupedMonths = useMemo(() => {
        let filteredGroups = [...allGroups]

        // Ay Filtresi
        if (selectedMonth !== 'all') {
            filteredGroups = filteredGroups.filter(g => g.date.startsWith(selectedMonth))
        }

        // Aylara Göre Gruplama
        const monthGroups: Record<string, GroupedMonth> = {}
        filteredGroups.forEach(day => {
            const dateObj = new Date(day.date)
            const year = dateObj.getFullYear()
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
            const monthKey = `${year}-${month}`
            
            if (!monthGroups[monthKey]) {
                const monthName = formatDate(dateObj)
                monthGroups[monthKey] = {
                    monthKey,
                    monthLabel: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                    totalRevenue: 0,
                    totalItems: 0,
                    days: []
                }
            }
            
            monthGroups[monthKey].days.push(day)
            monthGroups[monthKey].totalRevenue += day.totalRevenue
            monthGroups[monthKey].totalItems += day.totalItems
        })

        let result = Object.values(monthGroups)

        // Günleri Sıralama (Her ayın kendi içindeki günleri)
        result.forEach(month => {
            month.days.sort((a, b) => {
                if (sortBy === 'date_desc') return new Date(b.date).getTime() - new Date(a.date).getTime()
                if (sortBy === 'date_asc') return new Date(a.date).getTime() - new Date(b.date).getTime()
                if (sortBy === 'revenue_desc') return b.totalRevenue - a.totalRevenue
                return 0
            })
        })

        // Ayları Sıralama (Her zaman en yenisi en üstte)
        result.sort((a, b) => b.monthKey.localeCompare(a.monthKey))

        return result
    }, [allGroups, selectedMonth, sortBy])

    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        allGroups.forEach(day => {
            const dateObj = new Date(day.date)
            const year = dateObj.getFullYear()
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
            months.add(`${year}-${month}`)
        })
        return Array.from(months).sort((a, b) => b.localeCompare(a))
    }, [allGroups])

    const formatMonthLabel = (monthKey: string) => {
        const [year, month] = monthKey.split('-')
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1)
        const name = formatDate(dateObj)
        return name.charAt(0).toUpperCase() + name.slice(1)
    }

    const toggleMonthExpand = (monthKey: string) => {
        setExpandedMonth(expandedMonth === monthKey ? null : monthKey)
    }

    const toggleDateExpand = (date: string) => {
        setExpandedDate(expandedDate === date ? null : date)
    }

    const handleDelete = async (group: GroupedSale) => {
        if (!group.batchId) {
            await showAlert('Bu Z-Raporu eski bir versiyona ait (Batch ID eksik) olduğu için otomatik olarak geri alınamaz.', 'warning')
            return
        }

        const confirmed = await showConfirm(
            `Emin misiniz?\n\n${formatDate(group.date)} tarihli bu rapor silindiğinde:\n- O güne ait tüm Satışlar ve Giderler silinecek.\n- Satılan ürünlerin hammadde stokları depoya geri eklenecek.\n- Z-Raporuyla kasaya işlenen finans hareketleri (gelir/gider) geri alınarak bakiyeler düzeltilecek.\n\nBu işlem geri alınamaz!`,
            'Z-Raporunu Sil 🗑'
        )
        if (!confirmed) return

        setDeletingDate(group.date)
        try {
            const res = await fetch('/api/delete-z-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_id: group.batchId })
            })
            
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            
            logActivity('Z-Raporu', 'SILME', `${formatDate(group.date)} tarihli Z-Raporu silindi ve içerisindeki ${group.totalItems} kalem ürünün stokları geri yüklendi.`, { batchId: group.batchId })
            
            await showAlert('Z-Raporu başarıyla silindi ve stoklar geri alındı.', 'success')
            fetchSales()
        } catch (err: any) {
            await showAlert('Silme işlemi başarısız: ' + err.message, 'error')
        } finally {
            setDeletingDate(null)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white transition-colors">
                    ← Geri
                </button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">📅</span>
                <h1 className="font-bold text-amber-400 text-lg">Geçmiş Z-Raporları</h1>
            </header>

            <main className="p-6 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-2">İşlenmiş Satışlar</h2>
                        <p className="text-stone-400 text-sm max-w-xl">Sisteme yüklediğiniz Z-Raporları aylara göre kategorize edilmiştir. İçerisindeki günleri görebilir, filtreleme yapabilirsiniz.</p>
                    </div>

                    {/* Filtre ve Sıralama Çubuğu */}
                    <div className="flex flex-wrap items-center gap-3 bg-stone-900 p-2 rounded-xl border border-stone-800">
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-400"
                        >
                            <option value="all">Tüm Aylar</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonthLabel(m)}</option>
                            ))}
                        </select>

                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-400"
                        >
                            <option value="date_desc">En Yeniler Önce</option>
                            <option value="date_asc">En Eskiler Önce</option>
                            <option value="revenue_desc">En Çok Ciro Yapanlar</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-amber-400 text-4xl mb-4">⚙️</div>
                        <p className="text-stone-400">Veriler yükleniyor...</p>
                    </div>
                ) : groupedMonths.length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
                        <div className="text-6xl mb-4 opacity-50">📂</div>
                        <h3 className="text-xl font-bold mb-2">Kayıt Bulunamadı</h3>
                        <p className="text-stone-500">Seçili kriterlere uygun Z-Raporu bulunmuyor.</p>
                    </div>
                ) : (
                    <HistoryAccordion
                        groups={groupedMonths.map(month => ({
                            id: month.monthKey,
                            title: month.monthLabel,
                            subtitle: `${month.days.length} gün • ${month.totalItems} satılan ürün`,
                            icon: <span className="text-xl">📅</span>,
                            items: month.days
                        }))}
                        defaultExpandedIds={groupedMonths.length > 0 ? [groupedMonths[0].monthKey] : []}
                        renderHeaderRight={(group) => {
                            const month = groupedMonths.find(m => m.monthKey === group.id)!
                            return (
                                <div className="text-right">
                                    <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-1">Aylık Toplam Ciro</p>
                                    <p className="text-2xl font-bold text-green-400">{formatCurrency(month.totalRevenue)}</p>
                                </div>
                            )
                        }}
                        renderContent={(days) => (
                            <div className="p-4 sm:p-6 space-y-4">
                                {days.map(day => {
                                    const isDateExpanded = expandedDate === day.date;
                                    const dateObj = new Date(day.date)
                                    const dayName = formatDate(dateObj)
                                    const dayNum = formatDate(dateObj)

                                    return (
                                        <div key={day.date} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                            <div className="w-full px-5 py-3 flex items-center justify-between hover:bg-stone-800/30 transition-colors">
                                                <button 
                                                    onClick={() => toggleDateExpand(day.date)}
                                                    className="flex-1 text-left flex items-center gap-3"
                                                >
                                                    <div className="bg-stone-800 px-3 py-1.5 rounded-lg text-amber-400 font-bold tracking-wider text-sm">
                                                        {dayNum}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-stone-200">{dayName}</h4>
                                                        <p className="text-xs text-stone-500 mt-0.5">{day.totalItems} ürün</p>
                                                    </div>
                                                </button>
                                                
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-green-400">{formatCurrency(day.totalRevenue)}</p>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        {day.documentUrl && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setPreviewUrl(day.documentUrl!); }}
                                                                className="bg-stone-800 hover:bg-stone-700 text-stone-300 p-2 rounded-lg text-sm flex items-center justify-center transition-colors border border-stone-700 active:scale-95"
                                                                title="Z-Raporu Belgesini Gör"
                                                            >
                                                                🖼️
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(day) }}
                                                            disabled={deletingDate === day.date || !day.batchId}
                                                            className={`p-2 rounded-lg transition-colors border ${
                                                                !day.batchId ? 'bg-stone-800 border-stone-800 text-stone-600 cursor-not-allowed opacity-50' :
                                                                'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                                            }`}
                                                            title={!day.batchId ? "Eski kayıt silinemez" : "Raporu Sil"}
                                                        >
                                                            {deletingDate === day.date ? '⏳' : '🗑️'}
                                                        </button>
                                                        <button 
                                                            onClick={() => toggleDateExpand(day.date)}
                                                            className={`text-stone-500 p-2 transform transition-transform duration-200 ${isDateExpanded ? 'rotate-180' : ''}`}
                                                        >
                                                            ▼
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {isDateExpanded && (
                                                <div className="border-t border-stone-800 bg-stone-900/50">
                                                    <div className="overflow-x-auto w-full">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-stone-800/30 text-stone-400 border-b border-stone-800">
                                                                <tr>
                                                                    <th className="px-5 py-2.5 font-medium">Satılan Ürün</th>
                                                                    <th className="px-5 py-2.5 font-medium text-center">Adet</th>
                                                                    <th className="px-5 py-2.5 font-medium text-right">Toplam Tutar</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-stone-800/50">
                                                                {day.items.map((item) => (
                                                                    <tr key={item.id} className="hover:bg-stone-800/50 transition-colors">
                                                                        <td className="px-5 py-2.5 font-medium text-stone-300">
                                                                            {item.product_name}
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-center">
                                                                            <span className="inline-block bg-stone-800 text-amber-400 px-2 py-0.5 rounded text-xs font-bold min-w-[2rem]">
                                                                                {item.quantity}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-right font-medium text-white">{formatCurrency(item.total_price)}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    />
                )}
            </main>

            {/* Belge Önizleme Modalı */}
            <DocumentPreviewModal 
                isOpen={!!previewUrl} 
                onClose={() => setPreviewUrl(null)} 
                url={previewUrl} 
                title="Fiş / Fatura Belgesi Önizleme"
            />
        </div>
    )
}

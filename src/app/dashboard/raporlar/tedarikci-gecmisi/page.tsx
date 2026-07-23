'use client'

import { useState, useEffect, useMemo } from 'react'
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency, formatDate } from "@/lib/format";
import { HistoryAccordion } from '@/components/ui/HistoryAccordion'

type StockMovement = {
    id: string
    material_id: string
    quantity: number
    unit_price: number
    created_at: string
    batch_id: string | null
    note: string
    document_url?: string | null
    materials: {
        name: string
        unit: string
    }
    suppliers?: {
        name: string
    }
}

type GroupedReceipt = {
    id: string
    date: string
    supplierName: string
    totalAmount: number
    totalItems: number
    batchId: string | null
    documentUrl?: string | null
    items: StockMovement[]
}

type GroupedSupplier = {
    supplierName: string
    totalAmount: number
    receiptCount: number
    receipts: GroupedReceipt[]
}

type GroupedMonth = {
    monthKey: string
    monthLabel: string
    totalAmount: number
    receiptCount: number
    receipts: GroupedReceipt[]
}

export default function TedarikciGecmisi() {
    const { showAlert, showConfirm } = useNotification()
    const [allReceipts, setAllReceipts] = useState<GroupedReceipt[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    
    const [expandedMain, setExpandedMain] = useState<string | null>(null) // Ay veya Tedarikçi
    const [expandedReceipt, setExpandedReceipt] = useState<string | null>(null) // Fişin içi
    
    // Filters & Sorting
    const [groupBy, setGroupBy] = useState<'date' | 'supplier'>('date')
    const [selectedMonth, setSelectedMonth] = useState<string>('all')
    const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc'>('date_desc')
    
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchReceipts()
    }, [])

    const fetchReceipts = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('stock_movements')
            .select(`
                id,
                material_id,
                quantity,
                unit_price,
                created_at,
                batch_id,
                note,
                materials!stock_movements_material_id_fkey (
                    name,
                    unit
                ),
                suppliers!stock_movements_supplier_id_fkey (
                    name
                )
            `)
            .or('note.ilike.Yapay Zeka Fiş Yükleme%,note.ilike.Yapay zeka ile fiş okuma%')
            .in('movement_type', ['giris', 'IN'])
            .order('created_at', { ascending: false })

        if (error) {
            console.error("Supabase Error Details:", error);
            devError('Fişler çekilirken hata:', error?.message, error?.details, error?.hint)
            setLoading(false)
            return
        }

        const groups: Record<string, GroupedReceipt> = {}
        
        data?.forEach((item: any) => {
            const dateObj = new Date(item.created_at)
            const timeKey = `${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()}_${dateObj.getHours()}:${dateObj.getMinutes()}`
            const groupId = item.batch_id || timeKey
            
            if (!groups[groupId]) {
                groups[groupId] = {
                    id: groupId,
                    date: item.created_at,
                    supplierName: item.suppliers?.name || 'Bilinmeyen Tedarikçi',
                    totalAmount: 0,
                    totalItems: 0,
                    batchId: item.batch_id,
                    documentUrl: undefined, // Document loaded on demand
                    items: []
                }
            }
            groups[groupId].items.push(item)
            groups[groupId].totalAmount += (item.quantity * item.unit_price)
            groups[groupId].totalItems += 1
        })

        const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setAllReceipts(sortedGroups)
        setLoading(false)
    }

    const viewDocument = async (batchId: string | null) => {
        if (!batchId) {
            await showAlert('Bu işlem için ekli belge bulunamadı.', 'error')
            return
        }
        setLoading(true)
        const { data } = await supabase
            .from('stock_movements')
            .select('document_url')
            .eq('batch_id', batchId)
            .not('document_url', 'is', null)
            .limit(1)
            .single()
            
        setLoading(false)
        if (data?.document_url) {
            setPreviewUrl(data.document_url)
        } else {
            await showAlert('Veritabanında bu kayıt için herhangi bir fatura/fiş görseli bulunamadı.', 'error')
        }
    }

    // Ay Listesi (Filtre için)
    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        allReceipts.forEach(receipt => {
            const dateObj = new Date(receipt.date)
            const year = dateObj.getFullYear()
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
            months.add(`${year}-${month}`)
        })
        return Array.from(months).sort((a, b) => b.localeCompare(a))
    }, [allReceipts])

    const formatMonthLabel = (monthKey: string) => {
        const [year, month] = monthKey.split('-')
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1)
        const name = formatDate(dateObj)
        return name.charAt(0).toUpperCase() + name.slice(1)
    }

    // Verileri Hesapla ve Grupla
    const displayData = useMemo(() => {
        let filtered = [...allReceipts]

        // Ay Filtresi
        if (selectedMonth !== 'all') {
            filtered = filtered.filter(r => r.date.startsWith(selectedMonth))
        }

        // Genel Sıralama (Fişlerin Sıralaması)
        filtered.sort((a, b) => {
            if (sortBy === 'date_desc') return new Date(b.date).getTime() - new Date(a.date).getTime()
            if (sortBy === 'date_asc') return new Date(a.date).getTime() - new Date(b.date).getTime()
            if (sortBy === 'amount_desc') return b.totalAmount - a.totalAmount
            return 0
        })

        if (groupBy === 'supplier') {
            const supplierMap: Record<string, GroupedSupplier> = {}
            filtered.forEach(receipt => {
                const sName = receipt.supplierName
                if (!supplierMap[sName]) {
                    supplierMap[sName] = {
                        supplierName: sName,
                        totalAmount: 0,
                        receiptCount: 0,
                        receipts: []
                    }
                }
                supplierMap[sName].receipts.push(receipt)
                supplierMap[sName].totalAmount += receipt.totalAmount
                supplierMap[sName].receiptCount += 1
            })
            
            return Object.values(supplierMap).sort((a, b) => b.totalAmount - a.totalAmount) // Tedarikçileri ciroya göre sırala
        } else {
            // groupBy date
            const monthMap: Record<string, GroupedMonth> = {}
            filtered.forEach(receipt => {
                const dateObj = new Date(receipt.date)
                const monthKey = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`
                
                if (!monthMap[monthKey]) {
                    monthMap[monthKey] = {
                        monthKey,
                        monthLabel: formatMonthLabel(monthKey),
                        totalAmount: 0,
                        receiptCount: 0,
                        receipts: []
                    }
                }
                monthMap[monthKey].receipts.push(receipt)
                monthMap[monthKey].totalAmount += receipt.totalAmount
                monthMap[monthKey].receiptCount += 1
            })

            return Object.values(monthMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
        }
    }, [allReceipts, groupBy, selectedMonth, sortBy])

    const handleDelete = async (group: GroupedReceipt) => {
        if (!group.id) {
            await showAlert('Bu fiş eski bir versiyona ait (Batch ID eksik) olduğu için otomatik olarak geri alınamaz. Lütfen manuel olarak stok ve cari düzeltmesi yapın.', 'warning')
            return
        }

        const confirmed = await showConfirm(
            `Emin misiniz?\n\n${formatDate(group.date)} tarihli ve ₺${formatCurrency(group.totalAmount)} tutarındaki fiş silindiğinde:\n- Fişten gelen stoklar silinecek.\n- ${group.supplierName || 'Tedarikçi'} carisindeki borç/ödeme kayıtları geri alınacak.\n\nBu işlem geri alınamaz!`,
            'Fişi Sil 🗑️'
        )
        if (!confirmed) return

        setDeletingId(group.id)
        try {
            const res = await fetch('/api/delete-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_id: group.batchId })
            })
            
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            
            const formattedDate = formatDate(new Date(group.date));
            await logActivity('Tedarikçi Geçmişi', 'SILME', `${formattedDate} tarihli ${group.supplierName} fişi silindi. Stoklar ve cari bakiyeler geri alındı.`, { batchId: group.id })
            
            await showAlert('Fiş başarıyla silindi ve işlemler geri alındı.', 'success')
            fetchReceipts()
        } catch (err: any) {
            await showAlert('Silme işlemi başarısız: ' + err.message, 'error')
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white transition-colors">
                    ← Geri
                </button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">🧾</span>
                <h1 className="font-bold text-green-400 text-lg">Geçmiş Tedarikçi Fişleri</h1>
            </header>

            <main className="p-6 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-2">İşlenmiş Fişler</h2>
                        <p className="text-stone-400 text-sm max-w-xl">Yapay zeka ile yüklediğiniz tedarikçi fişleri kategorize edilmiştir. Fişleri aylara veya tedarikçilere göre görüntüleyebilirsiniz.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-stone-900 p-2 rounded-xl border border-stone-800">
                        {/* Gruplama Türü */}
                        <div className="flex bg-stone-800 rounded-lg p-1">
                            <button 
                                onClick={() => { setGroupBy('date'); setExpandedMain(null) }}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${groupBy === 'date' ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-400 hover:text-stone-200'}`}
                            >
                                Aya Göre
                            </button>
                            <button 
                                onClick={() => { setGroupBy('supplier'); setExpandedMain(null) }}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${groupBy === 'supplier' ? 'bg-stone-700 text-white shadow-sm' : 'text-stone-400 hover:text-stone-200'}`}
                            >
                                Tedarikçiye Göre
                            </button>
                        </div>

                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-green-400"
                        >
                            <option value="all">Tüm Aylar</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonthLabel(m)}</option>
                            ))}
                        </select>

                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value as any)}
                            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-green-400"
                        >
                            <option value="date_desc">En Yeniler Önce</option>
                            <option value="date_asc">En Eskiler Önce</option>
                            <option value="amount_desc">En Yüksek Tutarlılar</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-green-400 text-4xl mb-4">⚙️</div>
                        <p className="text-stone-400">Veriler yükleniyor...</p>
                    </div>
                ) : displayData.length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
                        <div className="text-6xl mb-4 opacity-50">📂</div>
                        <h3 className="text-xl font-bold mb-2">Kayıt Bulunamadı</h3>
                        <p className="text-stone-500">Seçili kriterlere uygun fiş bulunmuyor.</p>
                    </div>
                ) : (
                    <HistoryAccordion
                        groups={displayData.map((mainGroup: any) => {
                            const mainKey = groupBy === 'supplier' ? mainGroup.supplierName : mainGroup.monthKey;
                            const mainTitle = groupBy === 'supplier' ? mainGroup.supplierName : mainGroup.monthLabel;

                            return {
                                id: mainKey,
                                title: mainTitle,
                                subtitle: `${mainGroup.receiptCount} adet fiş bulundu`,
                                icon: <span className="text-xl">{groupBy === 'supplier' ? '🏢' : '📅'}</span>,
                                items: mainGroup.receipts
                            }
                        })}
                        defaultExpandedIds={displayData.length > 0 ? [groupBy === 'supplier' ? (displayData[0] as any).supplierName : (displayData[0] as any).monthKey] : []}
                        renderHeaderRight={(group) => {
                            const mainGroup = displayData.find((g: any) => (groupBy === 'supplier' ? g.supplierName : g.monthKey) === group.id)
                            return (
                                <div className="text-right">
                                    <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-1">Toplam Alış Tutarı</p>
                                    <p className="text-2xl font-bold text-white">{formatCurrency(mainGroup?.totalAmount || 0)}</p>
                                </div>
                            )
                        }}
                        renderContent={(receipts: any[]) => (
                            <div className="p-4 sm:p-6 space-y-4">
                                {receipts.map((receipt: GroupedReceipt) => {
                                    const isReceiptExpanded = expandedReceipt === receipt.id;
                                    const dateObj = new Date(receipt.date)
                                    const dateStr = formatDate(dateObj)

                                    return (
                                        <div key={receipt.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                            <div className="w-full px-5 py-3 flex items-center justify-between hover:bg-stone-800/30 transition-colors">
                                                <button 
                                                    onClick={() => setExpandedReceipt(isReceiptExpanded ? null : receipt.id)}
                                                    className="flex-1 text-left flex items-center gap-3"
                                                >
                                                    <div className="bg-stone-800 px-3 py-1.5 rounded-lg text-green-400 font-bold tracking-wider text-sm whitespace-nowrap">
                                                        {formatDate(dateObj)}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-stone-200">{groupBy === 'supplier' ? dateStr : receipt.supplierName}</h4>
                                                        <p className="text-xs text-stone-500 mt-0.5">{groupBy === 'supplier' ? 'Fiş Tarihi' : dateStr} • {receipt.totalItems} kalem ürün</p>
                                                    </div>
                                                </button>
                                                
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-white">{formatCurrency(receipt.totalAmount)}</p>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-1">
                                                        {receipt.batchId && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); viewDocument(receipt.batchId); }}
                                                                className="bg-stone-800 hover:bg-stone-700 text-stone-300 p-2 rounded-lg flex items-center justify-center transition-colors border border-stone-700 active:scale-95"
                                                                title="Fiş Belgesini Gör"
                                                            >
                                                                🖼️
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(receipt) }}
                                                            disabled={deletingId === receipt.id || !receipt.batchId}
                                                            className={`p-2 rounded-lg transition-colors border ${
                                                                !receipt.batchId ? 'bg-stone-800 border-stone-800 text-stone-600 cursor-not-allowed opacity-50' :
                                                                'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                                            }`}
                                                            title={!receipt.batchId ? "Eski kayıt silinemez" : "Fişi Sil"}
                                                        >
                                                            {deletingId === receipt.id ? '⏳' : '🗑️'}
                                                        </button>
                                                        <button 
                                                            onClick={() => setExpandedReceipt(isReceiptExpanded ? null : receipt.id)}
                                                            className={`text-stone-500 p-2 transform transition-transform duration-200 ${isReceiptExpanded ? 'rotate-180' : ''}`}
                                                        >
                                                            ▼
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {isReceiptExpanded && (
                                                <div className="border-t border-stone-800 bg-stone-900/50">
                                                    <div className="overflow-x-auto w-full">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-stone-800/30 text-stone-400 border-b border-stone-800">
                                                                <tr>
                                                                    <th className="px-5 py-2.5 font-medium">Hammadde</th>
                                                                    <th className="px-5 py-2.5 font-medium text-center">Birim Fiyat</th>
                                                                    <th className="px-5 py-2.5 font-medium text-center">Miktar</th>
                                                                    <th className="px-5 py-2.5 font-medium text-right">Toplam Tutar</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-stone-800/50">
                                                                {receipt.items.map((item) => (
                                                                    <tr key={item.id} className="hover:bg-stone-800/50 transition-colors">
                                                                        <td className="px-5 py-2.5 font-medium text-stone-300">
                                                                            {item.materials?.name || 'Bilinmeyen'}
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-center text-stone-400">{formatCurrency(item.unit_price)}
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-center">
                                                                            <span className="inline-block bg-stone-800 text-green-400 px-2 py-0.5 rounded text-xs font-bold min-w-[2rem]">
                                                                                {item.quantity} {item.materials?.unit || ''}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-5 py-2.5 text-right font-medium text-white">{formatCurrency((item.quantity * item.unit_price))}
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
                title="Tedarikçi Belgesi Önizleme"
            />
        </div>
    )
}

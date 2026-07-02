'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'

type SaleItem = {
    id: string
    sale_date: string
    quantity: number
    total_price: number
    batch_id: string | null
    product_id: string | null
    product_name?: string
}

type GroupedSale = {
    date: string
    batchId: string | null
    totalRevenue: number
    totalItems: number
    items: SaleItem[]
}

export default function GecmisRaporlar() {
    const [groupedSales, setGroupedSales] = useState<GroupedSale[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingDate, setDeletingDate] = useState<string | null>(null)
    const [expandedDate, setExpandedDate] = useState<string | null>(null)
    
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
                product_id
            `)
            .order('sale_date', { ascending: false })
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Satışlar çekilirken hata:', error)
            setLoading(false)
            return
        }

        // Ürünleri manuel çek (Foreign key hatası almamak için)
        const { data: productsData } = await supabase.from('products').select('id, name')
        const productMap: Record<string, string> = {}
        if (productsData) {
            productsData.forEach(p => {
                productMap[p.id] = p.name
            })
        }

        // Tarihe göre grupla
        const groups: Record<string, GroupedSale> = {}
        data?.forEach((item: any) => {
            const date = item.sale_date
            
            // Ürün ismini map'ten bul
            item.product_name = item.product_id && productMap[item.product_id] 
                ? productMap[item.product_id] 
                : 'Bilinmeyen Ürün'

            if (!groups[date]) {
                groups[date] = {
                    date,
                    batchId: item.batch_id,
                    totalRevenue: 0,
                    totalItems: 0,
                    items: []
                }
            }
            groups[date].items.push(item)
            groups[date].totalRevenue += item.total_price
            groups[date].totalItems += item.quantity
        })

        // Obje -> Dizi çevirimi
        const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setGroupedSales(sortedGroups)
        setLoading(false)
    }

    const toggleExpand = (date: string) => {
        setExpandedDate(expandedDate === date ? null : date)
    }

    const handleDelete = async (group: GroupedSale) => {
        if (!group.batchId) {
            alert('Bu Z-Raporu eski bir versiyona ait (Batch ID eksik) olduğu için otomatik olarak geri alınamaz.')
            return
        }

        if (!confirm(`Emin misiniz?\n\n${group.date} tarihli bu rapor silindiğinde:\n- Satışlar silinecek.\n- Düşülen hammadde stokları geri eklenecek.\n\nBu işlem geri alınamaz!`)) {
            return
        }

        setDeletingDate(group.date)
        try {
            const res = await fetch('/api/delete-z-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_id: group.batchId })
            })
            
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            
            logActivity('Z-Raporu', 'SILME', `${group.date} tarihli Z-Raporu silindi ve içerisindeki ${group.totalItems} kalem ürünün stokları geri yüklendi.`, { batchId: group.batchId })
            
            alert('Z-Raporu başarıyla silindi ve stoklar geri alındı.')
            fetchSales() // Listeyi yenile
        } catch (err: any) {
            alert('Silme işlemi başarısız: ' + err.message)
        } finally {
            setDeletingDate(null)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white transition-colors">
                    ← Geri
                </button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">📅</span>
                <h1 className="font-bold text-amber-400 text-lg">Geçmiş Z-Raporları</h1>
            </header>

            <main className="p-6 max-w-4xl mx-auto">
                <div className="mb-6">
                    <h2 className="text-xl font-bold mb-2">İşlenmiş Satışlar</h2>
                    <p className="text-stone-400 text-sm">Sisteme yüklediğiniz Z-Raporları ve fişlere ait gerçekleşen satış detayları tarihe göre gruplanmıştır.</p>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-amber-400 text-4xl mb-4">⚙️</div>
                        <p className="text-stone-400">Veriler yükleniyor...</p>
                    </div>
                ) : groupedSales.length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
                        <div className="text-6xl mb-4 opacity-50">📂</div>
                        <h3 className="text-xl font-bold mb-2">Kayıt Bulunamadı</h3>
                        <p className="text-stone-500">Henüz sisteme işlenmiş bir Z-Raporu verisi bulunmuyor.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groupedSales.map((group) => {
                            const isExpanded = expandedDate === group.date
                            
                            // Tarihi formatla
                            const dateObj = new Date(group.date)
                            const dateStr = dateObj.toLocaleDateString('tr-TR', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                weekday: 'long'
                            })

                            return (
                                <div key={group.date} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                    {/* Accordion Header */}
                                    <div className="w-full px-6 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors">
                                        <button 
                                            onClick={() => toggleExpand(group.date)}
                                            className="flex-1 text-left"
                                        >
                                            <h3 className="font-bold text-lg text-amber-400">{dateStr}</h3>
                                            <p className="text-sm text-stone-400 mt-1">
                                                <span className="font-bold text-white">{group.totalItems}</span> adet ürün satıldı
                                            </p>
                                        </button>
                                        
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-1">Toplam Ciro</p>
                                                <p className="text-xl font-bold text-green-400">₺{group.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(group) }}
                                                    disabled={deletingDate === group.date || !group.batchId}
                                                    className={`p-2 rounded-lg transition-colors border ${
                                                        !group.batchId ? 'bg-stone-800 border-stone-700 text-stone-500 cursor-not-allowed opacity-50' :
                                                        'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                                    }`}
                                                    title={!group.batchId ? "Eski kayıt silinemez" : "Raporu Sil ve Stokları Geri Al"}
                                                >
                                                    {deletingDate === group.date ? '⏳' : '🗑️'}
                                                </button>
                                                <button 
                                                    onClick={() => toggleExpand(group.date)}
                                                    className={`text-stone-500 p-2 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                                >
                                                    ▼
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Accordion Body */}
                                    {isExpanded && (
                                        <div className="border-t border-stone-800 bg-stone-950/50">
                                            <div className="overflow-x-auto w-full">
<table className="w-full text-sm text-left">
                                                <thead className="bg-stone-900/50 text-stone-400 border-b border-stone-800">
                                                    <tr>
                                                        <th className="px-6 py-3 font-medium">Satılan Ürün</th>
                                                        <th className="px-6 py-3 font-medium text-center">Adet</th>
                                                        <th className="px-6 py-3 font-medium text-right">Toplam Tutar</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-stone-800">
                                                    {group.items.map((item) => (
                                                        <tr key={item.id} className="hover:bg-stone-900 transition-colors">
                                                            <td className="px-6 py-3 font-medium text-stone-200">
                                                                {item.product_name}
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <span className="inline-block bg-stone-800 text-amber-400 px-2 py-1 rounded-md font-bold min-w-[2.5rem]">
                                                                    {item.quantity}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-3 text-right font-medium text-white">
                                                                ₺{item.total_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
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
            </main>
        </div>
    )
}

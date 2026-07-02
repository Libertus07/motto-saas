'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type StockMovement = {
    id: string
    material_id: string
    quantity: number
    unit_price: number
    created_at: string
    batch_id: string | null
    note: string
    materials: {
        name: string
        unit: string
    }
    suppliers?: {
        name: string
    }
}

type GroupedReceipt = {
    id: string // batch_id or timestamp
    date: string
    supplierName: string
    totalAmount: number
    totalItems: number
    batchId: string | null
    items: StockMovement[]
}

export default function TedarikciGecmisi() {
    const [groupedReceipts, setGroupedReceipts] = useState<GroupedReceipt[]>([])
    const [loading, setLoading] = useState(true)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchReceipts()
    }, [])

    const fetchReceipts = async () => {
        setLoading(true)
        // Fiş yüklemelerini stock_movements üzerinden tespit edeceğiz
        // "Yapay Zeka Fiş Yükleme" notu ile başlayan girişleri alıyoruz.
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
                materials (
                    name,
                    unit
                ),
                suppliers (
                    name
                )
            `)
            .ilike('note', 'Yapay Zeka Fiş Yükleme%')
            .eq('movement_type', 'giris')
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Fişler çekilirken hata:', error)
            setLoading(false)
            return
        }

        // Fişleri batch_id'ye veya oluşturulma zamanına göre grupla
        const groups: Record<string, GroupedReceipt> = {}
        
        data?.forEach((item: any) => {
            // Eski kayıtlarda batch_id olmayacağı için tarihi ID olarak kullan (dakika bazında yuvarla)
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
                    items: []
                }
            }
            groups[groupId].items.push(item)
            groups[groupId].totalAmount += (item.quantity * item.unit_price)
            groups[groupId].totalItems += 1 // Kalem sayısı
        })

        const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setGroupedReceipts(sortedGroups)
        setLoading(false)
    }

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id)
    }

    const handleDelete = async (receipt: GroupedReceipt) => {
        if (!receipt.batchId) {
            alert('Bu fiş eski bir versiyona ait (Batch ID eksik) olduğu için otomatik olarak geri alınamaz. Lütfen manuel olarak stok ve cari düzeltmesi yapın.')
            return
        }

        if (!confirm(`Emin misiniz?\n\nBu fiş silindiğinde:\n- Fişten gelen stoklar silinecek.\n- Tedarikçi borç/ödeme kayıtları geri alınacak.\n\nBu işlem geri alınamaz!`)) {
            return
        }

        setDeletingId(receipt.id)
        try {
            const res = await fetch('/api/delete-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch_id: receipt.batchId })
            })
            
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            
            alert('Fiş başarıyla silindi ve işlemler geri alındı.')
            fetchReceipts() // Listeyi yenile
        } catch (err: any) {
            alert('Silme işlemi başarısız: ' + err.message)
        } finally {
            setDeletingId(null)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white transition-colors">
                    ← Geri
                </button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">🧾</span>
                <h1 className="font-bold text-green-400 text-lg">Geçmiş Tedarikçi Fişleri</h1>
            </header>

            <main className="p-6 max-w-4xl mx-auto">
                <div className="mb-6">
                    <h2 className="text-xl font-bold mb-2">İşlenmiş Fişler</h2>
                    <p className="text-stone-400 text-sm">Sisteme yüklediğiniz tedarikçi fatura ve fişleri (sadece yapay zeka ile okunanlar). Eski fişleri sadece görüntüleyebilirsiniz, yenileri silebilirsiniz.</p>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-green-400 text-4xl mb-4">⚙️</div>
                        <p className="text-stone-400">Veriler yükleniyor...</p>
                    </div>
                ) : groupedReceipts.length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
                        <div className="text-6xl mb-4 opacity-50">📂</div>
                        <h3 className="text-xl font-bold mb-2">Kayıt Bulunamadı</h3>
                        <p className="text-stone-500">Henüz sisteme işlenmiş bir tedarikçi fişi bulunmuyor.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {groupedReceipts.map((group) => {
                            const isExpanded = expandedId === group.id
                            
                            // Tarihi formatla
                            const dateObj = new Date(group.date)
                            const dateStr = dateObj.toLocaleDateString('tr-TR', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })

                            return (
                                <div key={group.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                    {/* Accordion Header */}
                                    <div className="w-full px-6 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors">
                                        <button 
                                            onClick={() => toggleExpand(group.id)}
                                            className="flex-1 text-left"
                                        >
                                            <h3 className="font-bold text-lg text-green-400">{group.supplierName}</h3>
                                            <p className="text-sm text-stone-400 mt-1">
                                                {dateStr} • <span className="font-bold text-white">{group.totalItems}</span> kalem ürün
                                            </p>
                                        </button>
                                        
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-1">Toplam Fiş Tutarı</p>
                                                <p className="text-xl font-bold text-white">₺{group.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(group) }}
                                                    disabled={deletingId === group.id || !group.batchId}
                                                    className={`p-2 rounded-lg transition-colors border ${
                                                        !group.batchId ? 'bg-stone-800 border-stone-700 text-stone-500 cursor-not-allowed opacity-50' :
                                                        'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                                                    }`}
                                                    title={!group.batchId ? "Eski kayıt silinemez" : "Fişi Sil ve Geri Al"}
                                                >
                                                    {deletingId === group.id ? '⏳' : '🗑️'}
                                                </button>
                                                <button 
                                                    onClick={() => toggleExpand(group.id)}
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
                                                        <th className="px-6 py-3 font-medium">Hammadde</th>
                                                        <th className="px-6 py-3 font-medium text-center">Birim Fiyat</th>
                                                        <th className="px-6 py-3 font-medium text-center">Miktar</th>
                                                        <th className="px-6 py-3 font-medium text-right">Toplam</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-stone-800">
                                                    {group.items.map((item) => (
                                                        <tr key={item.id} className="hover:bg-stone-900 transition-colors">
                                                            <td className="px-6 py-3 font-medium text-stone-200">
                                                                {item.materials?.name || 'Bilinmeyen'}
                                                            </td>
                                                            <td className="px-6 py-3 text-center text-stone-400">
                                                                ₺{item.unit_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <span className="inline-block bg-stone-800 text-green-400 px-2 py-1 rounded-md font-bold">
                                                                    {item.quantity} {item.materials?.unit || ''}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-3 text-right font-medium text-white">
                                                                ₺{(item.quantity * item.unit_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
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

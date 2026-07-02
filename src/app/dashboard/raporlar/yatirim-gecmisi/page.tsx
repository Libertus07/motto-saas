'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

type Investment = {
    id: string
    asset_type: string
    name: string
    quantity: number
    average_cost: number
    purchase_date: string
    notes: string
    document_url: string
}

type GroupedMonth = {
    monthKey: string
    monthLabel: string
    totalAmount: number
    receiptCount: number
    items: Investment[]
}

export default function YatirimGecmisi() {
    const [investments, setInvestments] = useState<Investment[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null)
    const [selectedMonth, setSelectedMonth] = useState<string>('all')
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const { showAlert, showConfirm } = useNotification()
    
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchInvestments()
    }, [])

    const fetchInvestments = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('investments')
            .select('*')
            .not('document_url', 'is', null)
            .order('purchase_date', { ascending: false })

        if (error) {
            console.error('Yatırımlar çekilirken hata:', error)
            setLoading(false)
            return
        }

        setInvestments(data || [])
        setLoading(false)
    }

    // Ay Listesi (Filtre için)
    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        investments.forEach(inv => {
            const dateObj = new Date(inv.purchase_date || new Date().toISOString())
            const year = dateObj.getFullYear()
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
            months.add(`${year}-${month}`)
        })
        return Array.from(months).sort((a, b) => b.localeCompare(a))
    }, [investments])

    const formatMonthLabel = (monthKey: string) => {
        const [year, month] = monthKey.split('-')
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1)
        const name = dateObj.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
        return name.charAt(0).toUpperCase() + name.slice(1)
    }

    // Verileri Hesapla ve Grupla
    const displayData = useMemo(() => {
        let filtered = [...investments]

        if (selectedMonth !== 'all') {
            filtered = filtered.filter(i => (i.purchase_date || '').startsWith(selectedMonth))
        }

        const monthMap: Record<string, GroupedMonth> = {}
        filtered.forEach(inv => {
            const dateObj = new Date(inv.purchase_date || new Date().toISOString())
            const monthKey = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`
            
            if (!monthMap[monthKey]) {
                monthMap[monthKey] = {
                    monthKey,
                    monthLabel: formatMonthLabel(monthKey),
                    totalAmount: 0,
                    receiptCount: 0,
                    items: []
                }
            }
            monthMap[monthKey].items.push(inv)
            monthMap[monthKey].totalAmount += (inv.quantity * inv.average_cost)
            monthMap[monthKey].receiptCount += 1
        })

        return Object.values(monthMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    }, [investments, selectedMonth])

    const handleDelete = async (id: string, name: string) => {
        const confirmed = await showConfirm(
            `"${name}" isimli yatırım fişini silmek istediğinize emin misiniz?\n\nBu işlem yatırımı cüzdanınızdan kaldıracak ve ödenen tutarı kasanıza/bankanıza iade edecektir.`,
            'Yatırım Fişini Sil 🗑️'
        )
        if (!confirmed) return
        
        try {
            // 1. Yatırıma bağlı kasa hareketini bul
            const { data: movementData, error: movGetError } = await supabase
                .from('account_movements')
                .select('*')
                .eq('source_type', 'investment')
                .eq('source_id', id)
                .maybeSingle()

            if (movGetError) {
                console.error('Kasa hareketi aranırken hata oluştu:', movGetError)
            }

            // 2. Eğer kasa hareketi varsa, kasa/banka bakiyesini geri iade et
            if (movementData) {
                const { data: accData, error: accGetError } = await supabase
                    .from('accounts')
                    .select('balance, name')
                    .eq('id', movementData.account_id)
                    .single()

                if (!accGetError && accData) {
                    // Yatırım alımı 'cikis' idi, sildiğimiz için bakiyeyi ARTTIRIYORUZ (iade)
                    const newBalance = Number(accData.balance) + Number(movementData.amount)
                    
                    const { error: accUpdError } = await supabase
                        .from('accounts')
                        .update({ balance: newBalance })
                        .eq('id', movementData.account_id)

                    if (accUpdError) throw accUpdError

                    // Kasa hareketini sil
                    await supabase.from('account_movements').delete().eq('id', movementData.id)

                    // Log activity for refund
                    await logActivity('Yatırım Fişi', 'GUNCELLEME', `Bakiye İade Edildi: ${accData.name}`, {
                        detay: `İade Tutarı (₺${movementData.amount}) | Silinen Yatırım (${name})`
                    })
                }
            }

            // 3. Yatırım kaydını sil (DB'de cascade delete olduğu için transactionlar da silinecektir)
            const { error: delError } = await supabase.from('investments').delete().eq('id', id)
            if (delError) throw delError
            
            // Log activity for delete
            await logActivity('Yatırım Fişi', 'SILME', `Yatırım Fişi Silindi: ${name}`, {
                detay: `Silinen Yatırım ID (${id})`
            })

            await showAlert('Yatırım fişi ve ilişkili kasa hareketi başarıyla silindi.', 'success')
            fetchInvestments()
        } catch (error: any) {
            await showAlert('Silme işlemi başarısız oldu: ' + error.message, 'error')
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white transition-colors">
                    ← Geri
                </button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">🗂️</span>
                <h1 className="font-bold text-purple-400 text-lg">Geçmiş Yatırım Fişleri</h1>
            </header>

            <main className="p-6 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold mb-2">İşlenmiş Yatırım Belge ve Dekontları</h2>
                        <p className="text-stone-400 text-sm max-w-xl">Yüklediğiniz veya sisteme manuel olarak girdiğiniz tüm altın, döviz ve gayrimenkul belgeleri ay bazlı olarak listelenir.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 bg-stone-900 p-2 rounded-xl border border-stone-800">
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => {
                                setSelectedMonth(e.target.value)
                                setExpandedMonth(null)
                            }}
                            className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-purple-400"
                        >
                            <option value="all">Tüm Aylar</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonthLabel(m)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin text-purple-400 text-4xl mb-4">⚙️</div>
                        <p className="text-stone-400">Veriler yükleniyor...</p>
                    </div>
                ) : displayData.length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
                        <div className="text-6xl mb-4">📄</div>
                        <h3 className="text-xl font-bold text-white mb-2">Fiş Bulunamadı</h3>
                        <p className="text-stone-400">Seçili tarihe ait işlenmiş yatırım belgesi bulunamadı.</p>
                        <button 
                            onClick={() => router.push('/dashboard/raporlar/yatirim-fisi')}
                            className="mt-6 bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-2 rounded-lg transition-colors"
                        >
                            Yeni Fiş Yükle
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {displayData.map((group) => {
                            const isExpanded = expandedMonth === group.monthKey
                            
                            return (
                                <div key={group.monthKey} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all">
                                    <div 
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-stone-800/50"
                                        onClick={() => setExpandedMonth(isExpanded ? null : group.monthKey)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="bg-purple-900/30 text-purple-400 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl">
                                                📅
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-white">{group.monthLabel}</h3>
                                                <p className="text-stone-400 text-sm">{group.receiptCount} adet yatırım fişi</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right hidden sm:block">
                                                <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Toplam Yatırım Tutarı</p>
                                                <p className="font-bold text-purple-400">₺{group.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            <div className={`text-stone-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                ▼
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-stone-800 bg-stone-950/50 p-4">
                                            <div className="space-y-3">
                                                {group.items.map(inv => (
                                                    <div key={inv.id} className="bg-stone-900 border border-stone-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-3xl">
                                                                {inv.asset_type === 'doviz' ? '💵' : inv.asset_type === 'altin' ? '🪙' : '🏢'}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-white">{inv.name}</h4>
                                                                <p className="text-stone-400 text-sm">
                                                                    {new Date(inv.purchase_date).toLocaleDateString('tr-TR')} • {inv.quantity} {inv.asset_type === 'altin' ? 'Gram' : inv.asset_type === 'doviz' ? 'Adet/Birim' : 'Adet'}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-6">
                                                            <div className="text-right">
                                                                <p className="text-stone-500 text-xs">Birim Maliyet</p>
                                                                <p className="font-medium text-stone-300">₺{Number(inv.average_cost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-stone-500 text-xs">Toplam Tutar</p>
                                                                <p className="font-bold text-purple-400">₺{(inv.quantity * inv.average_cost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                                                            </div>
                                                            
                                                            {inv.document_url && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(inv.document_url); }}
                                                                    className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors border border-stone-700 active:scale-95"
                                                                >
                                                                    <span>🖼️</span> Belgeyi Gör
                                                                </button>
                                                            )}
                                                            
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleDelete(inv.id, inv.name); }}
                                                                className="text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors border border-red-400/20"
                                                                title="Sil"
                                                            >
                                                                🗑️ Sil
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </main>

            {/* Belge Önizleme Modalı */}
            {previewUrl && (
                <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-[999] p-4" onClick={() => setPreviewUrl(null)}>
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setPreviewUrl(null)} 
                            className="absolute -top-12 right-0 text-white hover:text-stone-300 text-sm font-bold bg-stone-900 border border-stone-800 px-4 py-2 rounded-xl flex items-center gap-2 active:scale-95 transition-all"
                        >
                            ✕ Kapat
                        </button>
                        
                        <div className="bg-stone-900 border border-stone-800 p-2 rounded-2xl shadow-2xl overflow-hidden max-w-full max-h-[80vh] flex items-center justify-center">
                            {previewUrl.startsWith('data:application/pdf') || previewUrl.endsWith('.pdf') ? (
                                <iframe 
                                    src={previewUrl} 
                                    className="w-[80vw] h-[70vh] rounded-lg border-0"
                                    title="Belge Önizleme"
                                />
                            ) : (
                                <img 
                                    src={previewUrl} 
                                    alt="Belge Önizleme" 
                                    className="max-w-full max-h-[75vh] object-contain rounded-lg"
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

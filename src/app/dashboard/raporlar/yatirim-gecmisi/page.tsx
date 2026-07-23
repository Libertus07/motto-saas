'use client'

import { useState, useEffect, useMemo } from 'react'
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency, formatDate } from "@/lib/format";
import { deleteInvestmentTransactionWithRefund } from '@/lib/investment-transactions'
import { HistoryAccordion } from '@/components/ui/HistoryAccordion'

type InvestmentTransaction = {
    id: string
    investment_id: string
    transaction_type: string
    quantity: number
    price_per_unit: number
    total_amount: number
    transaction_date: string
    notes: string
    document_url: string
    investments: {
        name: string
        asset_type: string
    }
}

type GroupedMonth = {
    monthKey: string
    monthLabel: string
    totalAmount: number
    receiptCount: number
    items: InvestmentTransaction[]
}

export default function YatirimGecmisi() {
    const [transactions, setTransactions] = useState<InvestmentTransaction[]>([])
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
            .from('investment_transactions')
            .select(`
                *,
                investments (name, asset_type)
            `)
            .order('transaction_date', { ascending: false })

        if (error) {
            console.error("Supabase Error Details:", error);
            devError('Yatırım işlemleri çekilirken hata:', error?.message, error?.details, error?.hint)
            setLoading(false)
            return
        }

        setTransactions(data || [])
        setLoading(false)
    }

    // Ay Listesi (Filtre için)
    const availableMonths = useMemo(() => {
        const months = new Set<string>()
        transactions.forEach(inv => {
            const dateObj = new Date(inv.transaction_date || new Date().toISOString())
            const year = dateObj.getFullYear()
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0')
            months.add(`${year}-${month}`)
        })
        return Array.from(months).sort((a, b) => b.localeCompare(a))
    }, [transactions])

    const formatMonthLabel = (monthKey: string) => {
        const [year, month] = monthKey.split('-')
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1)
        const name = formatDate(dateObj)
        return name.charAt(0).toUpperCase() + name.slice(1)
    }

    // Verileri Hesapla ve Grupla
    const displayData = useMemo(() => {
        let filtered = [...transactions]

        if (selectedMonth !== 'all') {
            filtered = filtered.filter(i => (i.transaction_date || '').startsWith(selectedMonth))
        }

        const monthMap: Record<string, GroupedMonth> = {}
        filtered.forEach(inv => {
            const dateObj = new Date(inv.transaction_date || new Date().toISOString())
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
            monthMap[monthKey].totalAmount += Number(inv.total_amount)
            monthMap[monthKey].receiptCount += 1
        })

        return Object.values(monthMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    }, [transactions, selectedMonth])

    const handleDelete = async (id: string, name: string, amount: number) => {
        const confirmed = await showConfirm(
            `"${name}" isimli yatırım fişini silmek istediğinize emin misiniz?\\n\\nBu işlem yatırımdan ilgili tutarı cüzdanınızdan düşecek ve ödenen ₺${formatCurrency(amount)} tutarı kasanıza/bankanıza iade edecektir.`,
            'Yatırım Fişini Sil 🗑️'
        )
        if (!confirmed) return
        
        try {
            const result = await deleteInvestmentTransactionWithRefund(supabase, id)

            // Log activity for delete
            await logActivity('Yatırım Fişi', 'SILME', `Yatırım İşlemi Silindi: ${name}`, {
                detay: `Silinen İşlem ID (${id}) | İade Edilen Tutar (₺${Math.abs(result.refundedAmount || amount)})`
            })

            await showAlert('Yatırım işlemi başarıyla silindi ve iade gerçekleştirildi.', 'success')
            fetchInvestments()
        } catch (error: any) {
            devError('Silme işlemi başarısız oldu:', error)
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
                    <HistoryAccordion
                        groups={displayData.map(group => ({
                            id: group.monthKey,
                            title: group.monthLabel,
                            subtitle: `${group.receiptCount} adet yatırım fişi`,
                            icon: <span className="text-xl">📅</span>,
                            items: group.items
                        }))}
                        defaultExpandedIds={displayData.length > 0 ? [displayData[0].monthKey] : []}
                        renderHeaderRight={(group) => {
                            const dataGroup = displayData.find(g => g.monthKey === group.id)!
                            return (
                                <div className="text-right">
                                    <p className="text-stone-500 text-xs uppercase tracking-wider mb-1">Toplam Yatırım Tutarı</p>
                                    <p className="font-bold text-purple-400">{formatCurrency(dataGroup.totalAmount)}</p>
                                </div>
                            )
                        }}
                        renderContent={(items) => (
                            <div className="p-4 space-y-3">
                                {items.map(inv => (
                                    <div key={inv.id} className="bg-stone-900 border border-stone-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="text-3xl">
                                                {inv.investments?.asset_type === 'eur' || inv.investments?.asset_type === 'usd' ? '💵' : inv.investments?.asset_type === 'gold' ? '🪙' : '🏢'}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-white">{inv.investments?.name || 'Yatırım'}</h4>
                                                <p className="text-stone-400 text-sm">
                                                    {formatDate(new Date(inv.transaction_date || new Date().toISOString()))} • {inv.quantity} {inv.investments?.asset_type === 'gold' ? 'Gram' : inv.investments?.asset_type === 'real_estate' ? 'Adet' : 'Birim'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-stone-500 text-xs">Birim Maliyet</p>
                                                <p className="font-medium text-stone-300">{formatCurrency(Number(inv.price_per_unit))}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-stone-500 text-xs">Toplam Tutar</p>
                                                <p className="font-bold text-purple-400">{formatCurrency(Number(inv.total_amount))}</p>
                                            </div>
                                            
                                            {inv.document_url && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setPreviewUrl(inv.document_url); }}
                                                    className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors border border-stone-700 active:scale-95"
                                                >
                                                    <span>🖼️</span> Belgeyi Gör
                                                </button>
                                            )}
                                            
                                            {inv.transaction_type === 'buy' && (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDelete(inv.id, inv.investments?.name || 'Yatırım İşlemi', Number(inv.total_amount)); }}
                                                    className="text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors border border-red-400/20"
                                                    title="Sil"
                                                >
                                                    🗑️ Sil
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
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
                title="Yatırım Belgesi Önizleme"
            />
        </div>
    )
}

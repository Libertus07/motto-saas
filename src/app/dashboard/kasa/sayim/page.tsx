'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { formatCurrency } from "@/lib/format"
import { useAppTour } from '@/hooks/useAppTour'

interface RecentReconciliation {
    id: string
    date: string
    counted_cash: number
    counted_credit_card: number
    counted_meal_card: number
    expected_cash: number
    expected_credit_card: number
    cash_variance: number
    credit_card_variance: number
    status: string
    notes?: string
    created_at: string
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Veriler yüklenirken hata oluştu'

const DENOMINATIONS = [
    { value: 200, label: '200 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 100, label: '100 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 50, label: '50 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 20, label: '20 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 10, label: '10 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 5, label: '5 ₺ Banknot', icon: '💵', type: 'note' },
    { value: 1, label: '1 ₺ Madeni', icon: '🪙', type: 'coin' },
    { value: 0.5, label: '0.50 ₺ (50 Krş)', icon: '🪙', type: 'coin' },
    { value: 0.25, label: '0.25 ₺ (25 Krş)', icon: '🪙', type: 'coin' },
]

export default function KasaSayimPage() {
    useAppTour('kasa_sayim', [
        {
            element: '#tour-cash-date',
            popover: { title: 'Doğru günü seçin', description: 'Sayımı kaydetmeden önce işlem gününü kontrol edin; sistem beklentisi bu tarihe göre hesaplanır.' }
        },
        {
            element: '#tour-cash-tabs',
            popover: { title: 'Sayım ve geçmiş aynı yerde', description: 'Gün sonu sayımını tamamlayın veya önceki mutabakatları bu iki sekmeden inceleyin.' }
        },
        {
            element: '#tour-cash-count',
            popover: { title: 'Kör sayımı girin', description: 'Kasadaki nakit, POS ve yemek kartını fiili değerlerle kaydedin; fark otomatik hesaplanır.' }
        }
    ])
    const supabase = useMemo(() => createClient(), [])

    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    // Sistem Beklentisi State'leri
    const [expectedSales, setExpectedSales] = useState(0)
    const [expectedExpenses, setExpectedExpenses] = useState(0)
    const [expectedDiscounts, setExpectedDiscounts] = useState(0)
    const [expectedTotal, setExpectedTotal] = useState(0)
    const [expectedCashRaw, setExpectedCashRaw] = useState(0)
    const [expectedCreditRaw, setExpectedCreditRaw] = useState(0)

    // Sayım Girişleri State'leri
    const [countedCash, setCountedCash] = useState<number | ''>('')
    const [countedCreditCard, setCountedCreditCard] = useState<number | ''>('')
    const [countedMealCard, setCountedMealCard] = useState<number | ''>('')

    // Kasiyer Düzeltme Modülü
    const [adjustmentType, setAdjustmentType] = useState<'none' | 'cash_to_credit' | 'credit_to_cash' | 'overcharged_pos_cash_refund'>('none')
    const [adjustmentAmount, setAdjustmentAmount] = useState<number | ''>('')
    const [adjustmentNote, setAdjustmentNote] = useState('')

    // Banknot/Bozuk Para Sayım Asistanı State'i
    const [showDenomCalculator, setShowDenomCalculator] = useState(false)
    const [denomCounts, setDenomCounts] = useState<Record<number, number>>({
        200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.5: 0, 0.25: 0
    })

    // Geçmiş Mutabakatlar & Aktif Mutabakat State'i
    const [existingReconciliation, setExistingReconciliation] = useState<RecentReconciliation | null>(null)
    const [recentReconciliations, setRecentReconciliations] = useState<RecentReconciliation[]>([])
    const [activeTab, setActiveTab] = useState<'count' | 'history'>('count')

    const fetchExpectedTotals = useCallback(async () => {
        setLoading(true)
        setError(null)
        setSuccess(false)
        setExistingReconciliation(null)

        // Tarih değişince önceki tarihten kalma sayım/düzeltme verilerini temizle
        setDenomCounts({ 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.5: 0, 0.25: 0 })
        setShowDenomCalculator(false)
        setAdjustmentType('none')
        setAdjustmentAmount('')
        setAdjustmentNote('')

        try {
            // 1. Önceki mutabakat var mı kontrol et
            const { data: recData, error: recError } = await supabase
                .from('cash_reconciliations')
                .select('*')
                .eq('date', date)
                .maybeSingle()

            if (recError) throw recError
            if (recData) {
                setExistingReconciliation(recData)
                setCountedCash(recData.counted_cash)
                setCountedCreditCard(recData.counted_credit_card)
                setCountedMealCard(recData.counted_meal_card || 0)
            } else {
                setCountedCash('')
                setCountedCreditCard('')
                setCountedMealCard('')
            }

            // 2. Günün Satışlarını Getir
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('batch_id, total_price')
                .eq('sale_date', date)
            
            if (salesError) throw salesError
            
            const totalSales = salesData?.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0) || 0
            const validBatchIds = Array.from(new Set(salesData?.map(s => s.batch_id).filter(Boolean)))

            // 3. Günün Giderlerini Getir (İndirim ve iadeleri fiziki kasadan düşmemek için ayır)
            const { data: expensesData, error: expError } = await supabase
                .from('expenses')
                .select('amount, category')
                .eq('expense_date', date)
            
            if (expError) throw expError
            
            // Fiziki olarak kasadan çıkan paralar (Örn: manav, fırın, tüp vb.)
            const totalExpenses = expensesData?.filter(e => !['indirim-ikram', 'iade'].includes(e.category || '')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0
            // Sadece muhasebesel olan düşüşler (İndirimler, ikramlar)
            const totalDiscounts = expensesData?.filter(e => ['indirim-ikram', 'iade'].includes(e.category || '')).reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0

            // 4. Günün Ödeme Yöntemi Dağılımını Getir (Z-Raporu hareketleri)
            let totalExpectedCash = 0;
            let totalExpectedCredit = 0;
            let finalExpectedSales = totalSales;

            if (validBatchIds.length > 0) {
                const { data: movementsData, error: movError } = await supabase
                    .from('account_movements')
                    .select('amount, description, movement_type, source_id')
                    .eq('source_type', 'z_report')
                    .in('source_id', validBatchIds)

                if (movError) throw movError

                if (movementsData && movementsData.length > 0) {
                    movementsData.forEach(m => {
                        if (m.description?.includes('Nakit') && m.movement_type === 'giris') {
                            totalExpectedCash += Number(m.amount) || 0;
                        } else if (m.description?.includes('Kredi Kartı') && m.movement_type === 'giris') {
                            totalExpectedCredit += Number(m.amount) || 0;
                        }
                    })

                    if (totalExpectedCash > 0 || totalExpectedCredit > 0) {
                        finalExpectedSales = totalExpectedCash + totalExpectedCredit;
                    }
                }
            }

            setExpectedSales(finalExpectedSales)
            setExpectedExpenses(totalExpenses)
            setExpectedDiscounts(totalDiscounts)
            setExpectedTotal(finalExpectedSales - totalExpenses)
            setExpectedCashRaw(totalExpectedCash)
            setExpectedCreditRaw(totalExpectedCredit)

        } catch (err: unknown) {
            setError(getErrorMessage(err))
        } finally {
            setLoading(false)
        }
    }, [date, supabase])

    const fetchRecentHistory = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('cash_reconciliations')
                .select('*')
                .order('date', { ascending: false })
                .limit(10)

            if (!error && data) {
                setRecentReconciliations(data)
            }
        } catch (e) {
            console.error('Geçmiş mutabakatlar yüklenemedi:', e)
        }
    }, [supabase])

    useEffect(() => {
        const id = window.setTimeout(() => {
            void fetchExpectedTotals()
            void fetchRecentHistory()
        }, 0)
        return () => window.clearTimeout(id)
    }, [fetchExpectedTotals, fetchRecentHistory])

    // Para Sayma Asistanı Hesaplama
    const handleDenomChange = (val: number, count: number) => {
        const next = { ...denomCounts, [val]: Math.max(0, count) }
        setDenomCounts(next)
        
        const total = Object.entries(next).reduce((sum, [denom, qty]) => {
            return sum + (Number(denom) * qty)
        }, 0)

        setCountedCash(total > 0 ? Number(total.toFixed(2)) : '')
    }

    const clearDenomCalculator = () => {
        setDenomCounts({ 200: 0, 100: 0, 50: 0, 20: 0, 10: 0, 5: 0, 1: 0, 0.5: 0, 0.25: 0 })
    }

    // Tarih Değiştirici Yardımcıları
    const handleStepDate = (days: number) => {
        const currentDate = new Date(date)
        currentDate.setDate(currentDate.getDate() + days)
        setDate(currentDate.toISOString().split('T')[0])
    }

    const countedTotal = (Number(countedCash) || 0) + (Number(countedCreditCard) || 0) + (Number(countedMealCard) || 0)
    
    // Nakit ve POS kırılımı varsa ayrı ayrı hesapla
    const isMovementFound = expectedCashRaw > 0 || expectedCreditRaw > 0
    const adjAmount = Number(adjustmentAmount) || 0
    let adjCash = 0;
    let adjCredit = 0;
    
    if (adjustmentType === 'cash_to_credit') {
        adjCash = -adjAmount;
        adjCredit = adjAmount;
    } else if (adjustmentType === 'credit_to_cash') {
        adjCash = adjAmount;
        adjCredit = -adjAmount;
    } else if (adjustmentType === 'overcharged_pos_cash_refund') {
        adjCash = -adjAmount;
        adjCredit = 0;
    }

    const expectedNetCash = isMovementFound ? expectedCashRaw - expectedExpenses + adjCash : 0
    const expectedNetCredit = isMovementFound ? expectedCreditRaw + adjCredit : 0
    const expectedTotalAdjusted = expectedTotal + adjCash + adjCredit
    
    const cashVariance = isMovementFound ? (Number(countedCash) || 0) - expectedNetCash : 0
    const creditVariance = isMovementFound ? (Number(countedCreditCard) || 0) - expectedNetCredit : 0
    const variance = countedTotal - expectedTotalAdjusted

    const handleSave = async () => {
        if (countedCash === '' || countedCreditCard === '') {
            setError('Lütfen Nakit ve Kredi Kartı tutarlarını girin (Yoksa 0 yazın)')
            return
        }

        setSaving(true)
        setError(null)

        try {
            let status = 'MATCH'
            if (variance > 0) status = 'OVERAGE'
            if (variance < 0) status = 'SHORTAGE'

            const payload = {
                id: existingReconciliation ? existingReconciliation.id : null,
                date,
                counted_cash: Number(countedCash) || 0,
                counted_credit_card: Number(countedCreditCard) || 0,
                counted_meal_card: Number(countedMealCard) || 0,
                expected_cash: expectedNetCash,
                expected_credit_card: expectedNetCredit,
                expected_meal_card: 0,
                cash_variance: isMovementFound ? cashVariance : variance,
                credit_card_variance: isMovementFound ? creditVariance : 0,
                meal_card_variance: 0,
                status,
                notes: `Toplam Satış: ${expectedSales} TL, Toplam Gider: ${expectedExpenses} TL${adjustmentType !== 'none' && adjAmount > 0 ? ` | Düzeltme: ${adjustmentType === 'cash_to_credit' ? 'Nakit yerine Kart çekilmiş' : adjustmentType === 'credit_to_cash' ? 'Kart yerine Nakit alınmış' : 'Fazla POS çekimi, Nakit iade verilmiş'} (${adjAmount} TL)` : ''}${adjustmentNote ? ' | Açıklama: ' + adjustmentNote : ''}`,
                is_movement_found: isMovementFound
            }

            const { error: rpcError } = await supabase.rpc('process_cash_reconciliation', { payload })

            if (rpcError) {
                throw new Error(rpcError.message || 'Kasa sayım onayı (RPC) sırasında bir hata oluştu.')
            }

            let details = '';
            if (existingReconciliation) {
                const changes = [];
                if (existingReconciliation.counted_cash !== Number(countedCash)) {
                    changes.push(`Nakit Sayım: ${existingReconciliation.counted_cash} ₺ -> ${countedCash || 0} ₺`)
                }
                if (existingReconciliation.counted_credit_card !== Number(countedCreditCard)) {
                    changes.push(`POS Sayım: ${existingReconciliation.counted_credit_card} ₺ -> ${countedCreditCard || 0} ₺`)
                }
                
                const oldTotal = Number(existingReconciliation.counted_cash) + Number(existingReconciliation.counted_credit_card) + Number(existingReconciliation.counted_meal_card || 0);
                const oldVariance = oldTotal - (Number(existingReconciliation.expected_cash) + Number(existingReconciliation.expected_credit_card));
                
                if (oldVariance !== variance) {
                    changes.push(`Kasa Farkı: ${oldVariance > 0 ? '+' : ''}${oldVariance} ₺ -> ${variance > 0 ? '+' : ''}${variance} ₺`)
                }
                
                details = changes.length > 0 ? changes.join(' | ') : 'Sayım güncellendi ancak tutarlarda değişiklik olmadı.';
            } else {
                details = `Nakit Sayım: ${countedCash || 0} ₺ | POS Sayım: ${countedCreditCard || 0} ₺ | Fark: ${variance > 0 ? '+' : ''}${variance} ₺`;
            }

            await logActivity('Kasa', existingReconciliation ? 'GUNCELLEME' : 'EKLEME', `${date} tarihli kasa sayımı ${existingReconciliation ? 'güncellendi' : 'kaydedildi'}.`, { detay: details })

            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            fetchExpectedTotals()
            fetchRecentHistory()
        } catch (err: unknown) {
            setError(getErrorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const getVarianceBadge = () => {
        if (variance > 0) return <span className="bg-emerald-500/20 text-emerald-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-emerald-500/30 shadow-lg shadow-emerald-500/10 flex items-center gap-1.5">+ {formatCurrency(variance)} Kasa Fazlası</span>
        if (variance < 0) return <span className="bg-rose-500/20 text-rose-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-rose-500/30 shadow-lg shadow-rose-500/10 flex items-center gap-1.5">- {formatCurrency(Math.abs(variance))} Kasa Açığı</span>
        return <span className="bg-amber-500/20 text-amber-400 px-3.5 py-1.5 rounded-full text-xs font-bold border border-amber-500/30 shadow-lg shadow-amber-500/10 flex items-center gap-1.5">✓ Kasa Birebir Denk</span>
    }

    const denomSumTotal = Object.entries(denomCounts).reduce((sum, [d, q]) => sum + (Number(d) * q), 0)

    return (
        <div className="min-h-screen bg-stone-950 text-white p-4 sm:p-6 lg:p-8 pb-24">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header & Date Controls */}
                <header className="bg-stone-900/80 backdrop-blur-xl border border-stone-800/80 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="space-y-1 z-10">
                        <div className="flex items-center gap-3">
                            <span className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl text-2xl">
                                🏧
                            </span>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                                    Kasa Sayımı & Mutabakat
                                </h1>
                                <p className="text-stone-400 text-xs sm:text-sm mt-0.5">
                                    Fiziki kör sayım değerlerini girerek sistem kayıtlarıyla anlık eşleştirin.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div id="tour-cash-date" className="flex flex-wrap items-center gap-2.5 z-10">
                        {/* Tarih Navigasyonu */}
                        <div className="flex items-center bg-stone-950 border border-stone-800/90 rounded-2xl p-1 shadow-inner">
                            <button
                                onClick={() => handleStepDate(-1)}
                                className="px-3 py-2 text-stone-400 hover:text-amber-400 hover:bg-stone-900 rounded-xl transition-all font-bold text-xs flex items-center gap-1"
                                title="Önceki Gün"
                            >
                                ◀ Dün
                            </button>
                            <input 
                                type="date" 
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="bg-transparent text-amber-400 font-bold text-xs sm:text-sm px-2 text-center focus:outline-none cursor-pointer"
                            />
                            <button
                                onClick={() => handleStepDate(1)}
                                className="px-3 py-2 text-stone-400 hover:text-amber-400 hover:bg-stone-900 rounded-xl transition-all font-bold text-xs flex items-center gap-1"
                                title="Sonraki Gün"
                            >
                                Bugün ▶
                            </button>
                        </div>

                        {/* Mutabakat Durum Rozeti */}
                        <div className="px-4 py-2.5 rounded-2xl border bg-stone-950/80 border-stone-800 text-xs font-bold flex items-center gap-2">
                            {existingReconciliation ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-emerald-400">Mutabakat Kayıtlı</span>
                                </>
                            ) : (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                                    <span className="text-amber-400">Kör Sayım Bekleniyor</span>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Tab Navigator */}
                <div id="tour-cash-tabs" className="flex gap-2 border-b border-stone-800/80 pb-2">
                    <button
                        onClick={() => setActiveTab('count')}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'count'
                                ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                                : 'bg-stone-900/60 text-stone-400 hover:bg-stone-900 hover:text-white border border-stone-800/60'
                        }`}
                    >
                        🧮 Gün Sonu Kör Sayımı
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 ${
                            activeTab === 'history'
                                ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                                : 'bg-stone-900/60 text-stone-400 hover:bg-stone-900 hover:text-white border border-stone-800/60'
                        }`}
                    >
                        📜 Son Mutabakat Geçmişi ({recentReconciliations.length})
                    </button>
                </div>

                {activeTab === 'history' ? (
                    /* Geçmiş Mutabakatlar Audit Trail Tablosu */
                    <div className="bg-stone-900/80 backdrop-blur-xl border border-stone-800/80 rounded-3xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span>📜</span> Son Kasa Mutabakat Geçmişi
                            </h2>
                            <span className="text-xs text-stone-400">Her gün için yapılan son 10 mutabakat kaydı</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-stone-800/80 text-stone-500 uppercase tracking-wider font-bold">
                                        <th className="py-3 px-4">Tarih</th>
                                        <th className="py-3 px-4">Sayılan Nakit</th>
                                        <th className="py-3 px-4">Sayılan POS</th>
                                        <th className="py-3 px-4">Sayılan Yemek</th>
                                        <th className="py-3 px-4">Genel Fark</th>
                                        <th className="py-3 px-4">Durum</th>
                                        <th className="py-3 px-4 text-right">İşlem</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-800/50">
                                    {recentReconciliations.map((rec) => {
                                        const totCounted = rec.counted_cash + rec.counted_credit_card + (rec.counted_meal_card || 0)
                                        const totExpected = rec.expected_cash + rec.expected_credit_card
                                        const totDiff = totCounted - totExpected

                                        return (
                                            <tr key={rec.id} className="hover:bg-stone-800/30 transition-colors">
                                                <td className="py-3 px-4 font-bold text-stone-200">
                                                    📅 {rec.date}
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-amber-400">
                                                    {formatCurrency(rec.counted_cash)}
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-blue-400">
                                                    {formatCurrency(rec.counted_credit_card)}
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-purple-400">
                                                    {formatCurrency(rec.counted_meal_card || 0)}
                                                </td>
                                                <td className="py-3 px-4 font-bold">
                                                    <span className={totDiff > 0 ? 'text-emerald-400' : totDiff < 0 ? 'text-rose-400' : 'text-amber-400'}>
                                                        {totDiff > 0 ? '+ ' : ''}{formatCurrency(totDiff)}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {rec.status === 'MATCH' ? (
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                            ✓ Denk
                                                        </span>
                                                    ) : rec.status === 'OVERAGE' ? (
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            + Fazla
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                            - Açık
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <button
                                                        onClick={() => {
                                                            setDate(rec.date)
                                                            setActiveTab('count')
                                                        }}
                                                        className="px-3 py-1.5 bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-300 rounded-xl transition-all font-bold text-[11px]"
                                                    >
                                                        Detayı Gör / Düzenle
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* Ana Sayım Ekranı */
                    <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Sol Kolon (7 Kolon): Fiziki Kör Sayım Formu & Para Sayma Asistanı */}
                        <div className="lg:col-span-7 space-y-6">
                            <div id="tour-cash-count" className="bg-stone-900/80 backdrop-blur-xl border border-stone-800/80 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-black text-white flex items-center gap-2.5">
                                        <span className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs">1</span>
                                        Fiziki Kör Sayım Girişi
                                    </h2>
                                    <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">Gün Sonu Kasa</span>
                                </div>

                                {/* Form İnputları Grid */}
                                <div className="space-y-5">
                                    {/* Nakit Kasa */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                                                <span>💵</span> Çekmecedeki Fiziki Nakit
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowDenomCalculator(!showDenomCalculator)}
                                                className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 hover:underline transition-all"
                                            >
                                                <span>🧮</span> {showDenomCalculator ? 'Asistanı Kapat' : 'Banknot/Bozuk Para Sayım Asistanı'}
                                            </button>
                                        </div>

                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                            <input 
                                                type="number" 
                                                value={countedCash}
                                                onChange={(e) => setCountedCash(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder="0.00"
                                                className="w-full bg-stone-950 border border-stone-800/90 rounded-2xl py-3.5 pl-10 pr-4 text-amber-400 text-2xl font-black focus:outline-none focus:border-amber-500 transition-all placeholder-stone-800"
                                            />
                                        </div>
                                    </div>

                                    {/* Banknot & Bozuk Para Sayım Asistanı Accordion Drawer */}
                                    {showDenomCalculator && (
                                        <div className="bg-stone-950/90 border border-amber-500/30 rounded-2xl p-5 space-y-4 animate-fade-in shadow-2xl">
                                            <div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-amber-400 text-lg">🧮</span>
                                                    <div>
                                                        <h4 className="text-xs font-bold text-white">Banknot & Bozuk Para Sayım Asistanı</h4>
                                                        <p className="text-[10px] text-stone-400">Adetleri girin, nakit tutarı otomatik toplansın.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl">
                                                        Sum: {formatCurrency(denomSumTotal)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={clearDenomCalculator}
                                                        className="text-[10px] text-stone-400 hover:text-rose-400 underline font-bold"
                                                    >
                                                        Sıfırla
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                                {DENOMINATIONS.map((d) => (
                                                    <div key={d.value} className="bg-stone-900/90 border border-stone-800 rounded-xl p-2.5 space-y-1.5">
                                                        <div className="flex items-center justify-between text-[11px] font-bold text-stone-300">
                                                            <span className="flex items-center gap-1">
                                                                <span>{d.icon}</span> {d.value} ₺
                                                            </span>
                                                            <span className="text-amber-400 text-[10px]">
                                                                {(denomCounts[d.value] || 0) * d.value} ₺
                                                            </span>
                                                        </div>
                                                        <input 
                                                            type="number"
                                                            min="0"
                                                            value={denomCounts[d.value] || ''}
                                                            onChange={(e) => handleDenomChange(d.value, Number(e.target.value))}
                                                            placeholder="0 adet"
                                                            className="w-full bg-stone-950 border border-stone-800 rounded-lg py-1.5 px-2 text-white text-xs font-bold focus:outline-none focus:border-amber-500 text-center"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* POS Cihazı Kredi Kartı */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                                            <span>💳</span> POS Cihazı SLIP Toplamı (Kredi Kartı)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                            <input 
                                                type="number" 
                                                value={countedCreditCard}
                                                onChange={(e) => setCountedCreditCard(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder="0.00"
                                                className="w-full bg-stone-950 border border-stone-800/90 rounded-2xl py-3.5 pl-10 pr-4 text-blue-400 text-2xl font-black focus:outline-none focus:border-amber-500 transition-all placeholder-stone-800"
                                            />
                                        </div>
                                    </div>

                                    {/* Yemek Kartları / Diğer */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                                            <span>🎫</span> Yemek Kartları / Diğer (Multinet, Sodexo vs.)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                            <input 
                                                type="number" 
                                                value={countedMealCard}
                                                onChange={(e) => setCountedMealCard(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder="0.00"
                                                className="w-full bg-stone-950 border border-stone-800/90 rounded-2xl py-3.5 pl-10 pr-4 text-purple-400 text-2xl font-black focus:outline-none focus:border-amber-500 transition-all placeholder-stone-800"
                                            />
                                        </div>
                                    </div>

                                    {/* Kasiyer Hatası Düzeltme Modülü */}
                                    <div className="pt-4 border-t border-stone-800/80 space-y-4">
                                        <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                                            <span>⚙️</span> Kasiyer Hata Düzeltme Modülü
                                        </h3>
                                        
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[11px] font-bold text-stone-400 mb-1.5">Oluşan Durum</label>
                                                <select 
                                                    value={adjustmentType}
                                                    onChange={(e) => setAdjustmentType(e.target.value as typeof adjustmentType)}
                                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-2.5 px-3 text-white text-xs font-bold focus:outline-none focus:border-amber-500 cursor-pointer"
                                                >
                                                    <option value="none">Düzeltme Yok</option>
                                                    <option value="cash_to_credit">Nakit Girilmiş ➔ POS Olacak</option>
                                                    <option value="credit_to_cash">POS Girilmiş ➔ Nakit Olacak</option>
                                                    <option value="overcharged_pos_cash_refund">Fazla POS Çekimi ➔ Nakit İade Edildi</option>
                                                </select>
                                            </div>

                                            {adjustmentType !== 'none' && (
                                                <div className="animate-fade-in">
                                                    <label className="block text-[11px] font-bold text-stone-400 mb-1.5">Düzeltme Tutarı</label>
                                                    <div className="relative">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500 font-bold text-xs">₺</span>
                                                        <input 
                                                            type="number" 
                                                            value={adjustmentAmount}
                                                            onChange={(e) => setAdjustmentAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                                            placeholder="0.00"
                                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl py-2.5 pl-8 pr-3 text-white text-xs font-bold focus:outline-none focus:border-amber-500"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {adjustmentType !== 'none' && (
                                            <div className="animate-fade-in">
                                                <label className="block text-[11px] font-bold text-stone-400 mb-1.5">Düzeltme Açıklama Notu</label>
                                                <textarea 
                                                    value={adjustmentNote}
                                                    onChange={(e) => setAdjustmentNote(e.target.value)}
                                                    placeholder="Örn: 150 TL tutarındaki adisyon nakit yerine yanlışlıkla kredi kartı girildi..."
                                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-300 text-xs focus:outline-none focus:border-amber-500 h-20 resize-none"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Sayılan Toplam Özeti */}
                                    <div className="pt-4 border-t border-stone-800/80 flex items-center justify-between">
                                        <span className="text-xs font-bold text-stone-400">Sizin Saydığınız Toplam Parasal Büyüklük:</span>
                                        <span className="text-2xl font-black text-white">{formatCurrency(countedTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sağ Kolon (5 Kolon): Sistem Beklentisi & Mutabakat Sonucu */}
                        <div className="lg:col-span-5 space-y-6">

                            {/* Sistem Beklentisi Kartı */}
                            <div className="bg-stone-900/80 backdrop-blur-xl border border-stone-800/80 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden space-y-5">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-black text-white flex items-center gap-2.5">
                                        <span className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs">2</span>
                                        Sistem Beklentisi
                                    </h2>
                                    <span className="text-[10px] bg-stone-950 border border-stone-800 text-stone-400 px-2.5 py-1 rounded-full font-bold">
                                        Otomatik Hesaplama
                                    </span>
                                </div>

                                {loading ? (
                                    <div className="animate-pulse space-y-3">
                                        <div className="h-10 bg-stone-800/60 rounded-xl w-full"></div>
                                        <div className="h-10 bg-stone-800/60 rounded-xl w-full"></div>
                                        <div className="h-16 bg-stone-800/60 rounded-xl w-full mt-4"></div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 text-xs">
                                        {isMovementFound ? (
                                            <>
                                                <div className="flex justify-between items-center p-3 bg-stone-950/70 rounded-2xl border border-stone-800/80">
                                                    <span className="text-stone-400 font-medium">Z-Raporu Nakit Hasılat</span>
                                                    <span className="font-bold text-amber-400">{formatCurrency(expectedCashRaw)}</span>
                                                </div>
                                                <div className="flex justify-between items-center p-3 bg-stone-950/70 rounded-2xl border border-stone-800/80">
                                                    <span className="text-stone-400 font-medium">Z-Raporu POS Hasılat</span>
                                                    <span className="font-bold text-blue-400">{formatCurrency(expectedCreditRaw)}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex justify-between items-center p-3 bg-stone-950/70 rounded-2xl border border-stone-800/80">
                                                <span className="text-stone-400 font-medium">Günün Toplam Ürün Satışı</span>
                                                <span className="font-bold text-stone-200">{formatCurrency(expectedSales)}</span>
                                            </div>
                                        )}

                                        {expectedExpenses > 0 && (
                                            <div className="flex justify-between items-center p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                                <span className="text-rose-400 font-medium">Kasadan Çıkan (Giderler)</span>
                                                <span className="font-bold text-rose-400">- {formatCurrency(expectedExpenses)}</span>
                                            </div>
                                        )}

                                        {expectedDiscounts > 0 && (
                                            <div className="flex justify-between items-center p-3 bg-stone-950/40 rounded-2xl border border-stone-800/40 opacity-70">
                                                <span className="text-stone-400">İndirim & İkramlar</span>
                                                <span className="font-semibold text-stone-500">- {formatCurrency(expectedDiscounts)}</span>
                                            </div>
                                        )}

                                        {(adjCash !== 0 || adjCredit !== 0) && (
                                            <div className="p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 space-y-1.5">
                                                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Kasiyer Düzeltme Etkisi</span>
                                                {adjCash !== 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-amber-300">Nakit Beklentisi:</span>
                                                        <span className="font-bold text-amber-400">{adjCash > 0 ? '+' : ''}{formatCurrency(adjCash)}</span>
                                                    </div>
                                                )}
                                                {adjCredit !== 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-amber-300">POS Beklentisi:</span>
                                                        <span className="font-bold text-amber-400">{adjCredit > 0 ? '+' : ''}{formatCurrency(adjCredit)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-stone-800/80 space-y-2 mt-4">
                                            {isMovementFound && (
                                                <>
                                                    <div className="flex justify-between items-center text-stone-400">
                                                        <span>Beklenen Net Nakit:</span>
                                                        <span className="font-bold text-amber-400">{formatCurrency(expectedNetCash)}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-stone-400">
                                                        <span>Beklenen Net POS:</span>
                                                        <span className="font-bold text-blue-400">{formatCurrency(expectedNetCredit)}</span>
                                                    </div>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center pt-2 border-t border-stone-800/50">
                                                <span className="font-bold text-stone-300">Kasada Olması Gereken Toplam:</span>
                                                <span className="text-2xl font-black text-white">{formatCurrency(expectedTotalAdjusted)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Mutabakat Sonuç Kartı */}
                            <div className={`border rounded-3xl p-6 lg:p-8 shadow-2xl transition-all space-y-5 ${
                                variance === 0 
                                    ? 'bg-amber-500/10 border-amber-500/30 shadow-amber-500/5' 
                                    : variance > 0 
                                        ? 'bg-emerald-500/10 border-emerald-500/30 shadow-emerald-500/5' 
                                        : 'bg-rose-500/10 border-rose-500/30 shadow-rose-500/5'
                            }`}>
                                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider text-center">
                                    Mutabakat Karşılaştırma Sonucu
                                </h3>

                                <div className="flex flex-col items-center justify-center gap-3">
                                    <div className="text-4xl sm:text-5xl font-black tracking-tight">
                                        {variance > 0 ? '+ ' : ''}{formatCurrency(variance)}
                                    </div>
                                    {getVarianceBadge()}

                                    {isMovementFound && (
                                        <div className="grid grid-cols-2 gap-3 w-full mt-2">
                                            <div className="bg-stone-950/80 p-3 rounded-2xl border border-stone-800/80 text-center">
                                                <div className="text-stone-400 text-[11px] font-medium mb-1">Nakit Farkı</div>
                                                <div className={`font-bold text-sm ${cashVariance === 0 ? 'text-amber-400' : cashVariance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {cashVariance > 0 ? '+ ' : ''}{formatCurrency(cashVariance)}
                                                </div>
                                            </div>
                                            <div className="bg-stone-950/80 p-3 rounded-2xl border border-stone-800/80 text-center">
                                                <div className="text-stone-400 text-[11px] font-medium mb-1">POS (Kart) Farkı</div>
                                                <div className={`font-bold text-sm ${creditVariance === 0 ? 'text-amber-400' : creditVariance > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {creditVariance > 0 ? '+ ' : ''}{formatCurrency(creditVariance)}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {error && (
                                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs text-center font-semibold">
                                        ⚠️ {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs text-center font-bold">
                                        ✓ Kasa sayımı ve mutabakat kaydı başarıyla kaydedildi!
                                    </div>
                                )}

                                <button
                                    onClick={handleSave}
                                    disabled={saving || loading}
                                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-base py-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20"
                                >
                                    {saving ? 'Kaydedildiği...' : existingReconciliation ? '💾 Mutabakatı Güncelle' : '🔒 Günü Kapat ve Mutabakatı Kaydet'}
                                </button>
                            </div>
                        </div>

                    </main>
                )}
            </div>
        </div>
    )
}

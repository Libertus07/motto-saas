'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { formatCurrency } from "@/lib/format";

export default function KasaSayimPage() {
    const supabase = createClient()
    const router = useRouter()

    const [date, setDate] = useState(new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const [expectedSales, setExpectedSales] = useState(0)
    const [expectedExpenses, setExpectedExpenses] = useState(0)
    const [expectedTotal, setExpectedTotal] = useState(0)
    const [expectedCashRaw, setExpectedCashRaw] = useState(0)
    const [expectedCreditRaw, setExpectedCreditRaw] = useState(0)

    const [countedCash, setCountedCash] = useState<number | ''>('')
    const [countedCreditCard, setCountedCreditCard] = useState<number | ''>('')
    const [countedMealCard, setCountedMealCard] = useState<number | ''>('')
    const [adjustmentNote, setAdjustmentNote] = useState('')

    const [existingReconciliation, setExistingReconciliation] = useState<any>(null)

    useEffect(() => {
        fetchExpectedTotals()
    }, [date])

    const fetchExpectedTotals = async () => {
        setLoading(true)
        setError(null)
        setSuccess(false)
        setExistingReconciliation(null)

        try {
            // 1. Önceki mutabakat var mı kontrol et
            const { data: recData, error: recError } = await supabase
                .from('cash_reconciliations')
                .select('*')
                .eq('date', date)
                .maybeSingle()

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

            // 3. Günün Giderlerini Getir
            const { data: expensesData, error: expError } = await supabase
                .from('expenses')
                .select('amount')
                .eq('expense_date', date)
            
            if (expError) throw expError
            
            const totalExpenses = expensesData?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0

            // 4. Günün Ödeme Yöntemi Dağılımını Getir (Z-Raporu hareketleri)
            let totalExpectedCash = 0;
            let totalExpectedCredit = 0;
            let finalExpectedSales = totalSales; // Varsayılan olarak ürün toplamı

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

                    // Eğer fişte gerçek tahsilat tutarları varsa, gerçek satışı tahsilatların toplamı kabul et
                    // (Çünkü fişteki ürünlerin toplamı; KDV, yuvarlama, küsurat veya bahşiş sebebiyle tahsilattan farklı olabilir)
                    if (totalExpectedCash > 0 || totalExpectedCredit > 0) {
                        finalExpectedSales = totalExpectedCash + totalExpectedCredit;
                    }
                }
            }

            // Kasa Net Nakit Beklentisi (Giren Nakit - Giderler)
            setExpectedSales(finalExpectedSales)
            setExpectedExpenses(totalExpenses)
            setExpectedTotal(finalExpectedSales - totalExpenses)
            setExpectedCashRaw(totalExpectedCash)
            setExpectedCreditRaw(totalExpectedCredit)

        } catch (err: any) {
            setError(err.message || 'Veriler yüklenirken hata oluştu')
        } finally {
            setLoading(false)
        }
    }

    const countedTotal = (Number(countedCash) || 0) + (Number(countedCreditCard) || 0) + (Number(countedMealCard) || 0)
    
    // Nakit ve POS kırılımı varsa ayrı ayrı hesapla
    const isMovementFound = expectedCashRaw > 0 || expectedCreditRaw > 0
    const expectedNetCash = isMovementFound ? expectedCashRaw - expectedExpenses : 0
    const expectedNetCredit = isMovementFound ? expectedCreditRaw : 0
    
    const cashVariance = isMovementFound ? (Number(countedCash) || 0) - expectedNetCash : 0
    const creditVariance = isMovementFound ? (Number(countedCreditCard) || 0) - expectedNetCredit : 0
    const variance = countedTotal - expectedTotal

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
                cash_variance: isMovementFound ? cashVariance : variance, // Ayrımsa sadece nakit, değilse genel fark
                credit_card_variance: isMovementFound ? creditVariance : 0,
                meal_card_variance: 0,
                status,
                notes: `Toplam Satış: ${expectedSales} TL, Toplam Gider: ${expectedExpenses} TL${adjustmentNote ? ' | Açıklama/Not: ' + adjustmentNote : ''}`,
                is_movement_found: isMovementFound
            }

            // ATOMIC İŞLEM: Tüm silme, ekleme ve hesap güncellemeleri PostgreSQL'de tek seferde yapılır
            const { data: rpcResult, error: rpcError } = await supabase.rpc('process_cash_reconciliation', { payload })

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

            // İşlem geçmişine kaydet
            await logActivity('Kasa', existingReconciliation ? 'GUNCELLEME' : 'EKLEME', `${date} tarihli kasa sayımı ${existingReconciliation ? 'güncellendi' : 'kaydedildi'}.`, { detay: details })

            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
            fetchExpectedTotals() // Yenile
        } catch (err: any) {
            setError(err.message || 'Kaydetme sırasında hata oluştu')
        } finally {
            setSaving(false)
        }
    }

    const getVarianceBadge = () => {
        if (variance > 0) return <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/30">+ {formatCurrency(variance)} Fazla</span>
        if (variance < 0) return <span className="bg-rose-500/20 text-rose-400 px-3 py-1 rounded-full text-sm font-bold border border-rose-500/30">- {formatCurrency(Math.abs(variance))} Açık</span>
        return <span className="bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-sm font-bold border border-amber-500/30">✓ Kasa Denk</span>
    }

    return (
        <div className="min-h-full bg-stone-950 text-white p-6 pb-20">
            <header className="max-w-4xl mx-auto flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-amber-400 flex items-center gap-3">
                        🏧 Kasa Sayımı ve Mutabakat
                    </h1>
                    <p className="text-stone-400 mt-2">Gün sonu kasanızdaki gerçek parayı (Kör Sayım) girerek sistemle eşleştirin.</p>
                </div>
                <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-stone-200 focus:outline-none focus:border-amber-500 transition-colors shadow-inner font-bold text-lg cursor-pointer"
                />
            </header>

            <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Sol Kolon: Kör Sayım Formu */}
                <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10" />
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <span className="text-amber-500">1.</span> Fiziki Sayım Değerleri
                    </h2>
                    
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-stone-400 mb-2">Çekmecedeki Nakit (TL)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                <input 
                                    type="number" 
                                    value={countedCash}
                                    onChange={(e) => setCountedCash(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-4 pl-10 pr-4 text-white text-xl font-bold focus:outline-none focus:border-amber-500 transition-all placeholder-stone-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-stone-400 mb-2">POS Cihazı Kredi Kartı Gün Sonu (TL)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                <input 
                                    type="number" 
                                    value={countedCreditCard}
                                    onChange={(e) => setCountedCreditCard(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-4 pl-10 pr-4 text-white text-xl font-bold focus:outline-none focus:border-amber-500 transition-all placeholder-stone-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-stone-400 mb-2">Yemek Kartları / Diğer (TL)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                                <input 
                                    type="number" 
                                    value={countedMealCard}
                                    onChange={(e) => setCountedMealCard(e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="0.00"
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl py-4 pl-10 pr-4 text-white text-xl font-bold focus:outline-none focus:border-amber-500 transition-all placeholder-stone-700"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-stone-400 mb-2">Günün Kasa Notları (Opsiyonel)</label>
                            <textarea 
                                value={adjustmentNote}
                                onChange={(e) => setAdjustmentNote(e.target.value)}
                                placeholder="Örn: 190 TL'lik hesap kartla çekildi ama yanlışlıkla nakit girildi..."
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-stone-300 focus:outline-none focus:border-amber-500 transition-colors h-24 resize-none shadow-inner"
                            />
                        </div>

                        <div className="pt-4 border-t border-stone-800">
                            <div className="flex justify-between items-center text-stone-300">
                                <span className="font-medium">Sizin Saydığınız Toplam:</span>
                                <span className="text-2xl font-bold text-white">{formatCurrency(countedTotal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sağ Kolon: Sistem Karşılaştırması */}
                <div className="space-y-6">
                    <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10" />
                        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <span className="text-emerald-500">2.</span> Sistem Beklentisi
                        </h2>

                        {loading ? (
                            <div className="animate-pulse space-y-4">
                                <div className="h-10 bg-stone-800 rounded-xl w-full"></div>
                                <div className="h-10 bg-stone-800 rounded-xl w-full"></div>
                                <div className="h-12 bg-stone-800 rounded-xl w-full mt-6"></div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-4 bg-stone-950 rounded-xl border border-stone-800">
                                    <span className="text-stone-400">Günün Toplam Satışı (Z-Raporu)</span>
                                    <span className="font-bold text-emerald-400">+ {formatCurrency(expectedSales)}</span>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-stone-950 rounded-xl border border-stone-800">
                                    <span className="text-stone-400">Günün Kasa Giderleri</span>
                                    <span className="font-bold text-rose-400">- {formatCurrency(expectedExpenses)}</span>
                                </div>
                                
                                <div className="pt-4 border-t border-stone-800 mt-6">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-stone-300">Kasada Olması Gereken:</span>
                                        <span className="text-3xl font-bold text-white">{formatCurrency(expectedTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sonuç Alanı */}
                    <div className={`border rounded-3xl p-8 shadow-2xl transition-all duration-500 ${
                        variance === 0 
                            ? 'bg-amber-500/10 border-amber-500/30' 
                            : variance > 0 
                                ? 'bg-emerald-500/10 border-emerald-500/30' 
                                : 'bg-rose-500/10 border-rose-500/30'
                    }`}>
                        <h2 className="text-lg font-medium text-stone-300 mb-2 text-center">Mutabakat Sonucu</h2>
                        <div className="flex flex-col items-center justify-center gap-4">
                            <div className="text-5xl font-black tracking-tighter">
                                {variance > 0 ? '+ ' : ''}{formatCurrency(variance)}
                            </div>
                            {getVarianceBadge()}

                            {isMovementFound && (
                                <div className="flex gap-4 mt-4 w-full px-4">
                                    <div className="flex-1 bg-stone-950 p-4 rounded-xl border border-stone-800 text-center">
                                        <div className="text-stone-400 text-sm mb-1">POS Farkı</div>
                                        <div className={`font-bold text-lg ${creditVariance === 0 ? 'text-amber-500' : creditVariance > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {creditVariance > 0 ? '+ ' : ''}{formatCurrency(creditVariance)}
                                        </div>
                                    </div>
                                    <div className="flex-1 bg-stone-950 p-4 rounded-xl border border-stone-800 text-center">
                                        <div className="text-stone-400 text-sm mb-1">Nakit Farkı</div>
                                        <div className={`font-bold text-lg ${cashVariance === 0 ? 'text-amber-500' : cashVariance > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {cashVariance > 0 ? '+ ' : ''}{formatCurrency(cashVariance)}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm text-center">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-sm text-center font-bold">
                                Kasa Sayımı başarıyla kaydedildi!
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="w-full mt-8 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black text-lg py-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20"
                        >
                            {saving ? 'Kaydediliyor...' : existingReconciliation ? 'Mutabakatı Güncelle' : 'Günü Kapat ve Mutabakatı Kaydet'}
                        </button>
                    </div>
                </div>
            </main>
        </div>
    )
}

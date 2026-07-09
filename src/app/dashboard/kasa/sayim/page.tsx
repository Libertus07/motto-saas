'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

    const [countedCash, setCountedCash] = useState<number | ''>('')
    const [countedCreditCard, setCountedCreditCard] = useState<number | ''>('')
    const [countedMealCard, setCountedMealCard] = useState<number | ''>('')

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
            }

            // 2. Günün Satışlarını Getir
            const { data: salesData, error: salesError } = await supabase
                .from('sales')
                .select('total_price')
                .eq('sale_date', date)
            
            if (salesError) throw salesError
            
            const totalSales = salesData?.reduce((sum, s) => sum + (Number(s.total_price) || 0), 0) || 0

            // 3. Günün Giderlerini Getir
            const { data: expensesData, error: expError } = await supabase
                .from('expenses')
                .select('amount')
                .eq('expense_date', date)
            
            if (expError) throw expError
            
            const totalExpenses = expensesData?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0

            setExpectedSales(totalSales)
            setExpectedExpenses(totalExpenses)
            setExpectedTotal(totalSales - totalExpenses)

        } catch (err: any) {
            setError(err.message || 'Veriler yüklenirken hata oluştu')
        } finally {
            setLoading(false)
        }
    }

    const countedTotal = (Number(countedCash) || 0) + (Number(countedCreditCard) || 0) + (Number(countedMealCard) || 0)
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
                date,
                counted_cash: Number(countedCash) || 0,
                counted_credit_card: Number(countedCreditCard) || 0,
                counted_meal_card: Number(countedMealCard) || 0,
                expected_cash: 0, // Ayrıntılı kırılamıyorsa 0
                expected_credit_card: 0,
                expected_meal_card: 0,
                cash_variance: variance, // Toplam farkı cash_variance içine yazıyoruz
                credit_card_variance: 0,
                meal_card_variance: 0,
                status,
                notes: `Toplam Satış: ${expectedSales} TL, Toplam Gider: ${expectedExpenses} TL`
            }

            if (existingReconciliation) {
                const { error: updateError } = await supabase
                    .from('cash_reconciliations')
                    .update(payload)
                    .eq('id', existingReconciliation.id)
                if (updateError) throw updateError
            } else {
                const { error: insertError } = await supabase
                    .from('cash_reconciliations')
                    .insert([payload])
                if (insertError) throw insertError
            }

            setSuccess(true)
            fetchExpectedTotals() // Yenile
        } catch (err: any) {
            setError(err.message || 'Kaydetme sırasında hata oluştu')
        } finally {
            setSaving(false)
        }
    }

    const getVarianceBadge = () => {
        if (variance > 0) return <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-sm font-bold border border-emerald-500/30">+ ₺{variance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} Fazla</span>
        if (variance < 0) return <span className="bg-rose-500/20 text-rose-400 px-3 py-1 rounded-full text-sm font-bold border border-rose-500/30">- ₺{Math.abs(variance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} Açık</span>
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

                        <div className="pt-4 border-t border-stone-800">
                            <div className="flex justify-between items-center text-stone-300">
                                <span className="font-medium">Sizin Saydığınız Toplam:</span>
                                <span className="text-2xl font-bold text-white">₺{countedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
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
                                    <span className="font-bold text-emerald-400">+ ₺{expectedSales.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center p-4 bg-stone-950 rounded-xl border border-stone-800">
                                    <span className="text-stone-400">Günün Kasa Giderleri</span>
                                    <span className="font-bold text-rose-400">- ₺{expectedExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                
                                <div className="pt-4 border-t border-stone-800 mt-6">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-stone-300">Kasada Olması Gereken:</span>
                                        <span className="text-3xl font-bold text-white">₺{expectedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
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
                                {variance > 0 ? '+' : ''}₺{variance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </div>
                            {getVarianceBadge()}
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

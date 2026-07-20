'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency } from "@/lib/format";

type Account = {
    id: string
    name: string
    type: string
    balance: number
}

type ParsedInvestment = {
    asset_type: string
    quantity: number
    price_per_unit: number
    total_amount: number
    purchase_date: string
    notes: string
    name: string
}

export default function YatirimFisiYukle() {
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [fileText, setFileText] = useState<string | null>(null)
    const [fileType, setFileType] = useState<'image' | 'pdf' | null>(null)
    const [loading, setLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const { showAlert, showConfirm } = useNotification()
    
    const [parsedData, setParsedData] = useState<ParsedInvestment | null>(null)
    const [accounts, setAccounts] = useState<Account[]>([])
    const [selectedAccount, setSelectedAccount] = useState<string>('')

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        const fetchAccounts = async () => {
            const { data } = await supabase.from('accounts').select('id, name, type, balance')
            if (data) {
                setAccounts(data)
                if (data.length > 0) setSelectedAccount(data[0].id)
            }
        }
        fetchAccounts()
    }, [])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const fileExt = file.name.split('.').pop()?.toLowerCase()
        if (file.type === 'application/pdf') {
            const reader = new FileReader()
            reader.onload = () => {
                setFileText(null)
                setImageUrl(reader.result as string)
                setFileType('pdf')
            }
            reader.readAsDataURL(file)
        } else {
            const reader = new FileReader()
            reader.onload = () => {
                setFileText(null)
                setImageUrl(reader.result as string)
                setFileType('image')
            }
            reader.readAsDataURL(file)
        }
    }

    const handleAnalyze = async () => {
        if (!imageUrl) return
        setAnalyzing(true)

        try {
            const res = await fetch('/api/analyze-investment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageUrl })
            })

            const data = await res.json()
            if (data.error) throw new Error(data.error)

            const qty = data.quantity || 1
            const price = data.price_per_unit || 0

            // API'den dönen formatı ParsedInvestment yapısına oturt
            setParsedData({
                asset_type: data.asset_type || 'usd',
                name: data.asset_type === 'usd' ? 'Dolar Alımı' : data.asset_type === 'eur' ? 'Euro Alımı' : data.asset_type === 'gold' ? 'Altın Alımı' : 'Gayrimenkul/Diğer',
                quantity: qty,
                price_per_unit: price,
                total_amount: qty * price,
                purchase_date: data.purchase_date || new Date().toISOString().split('T')[0],
                notes: data.notes || 'Yapay Zeka ile oluşturuldu'
            })
        } catch (error: any) {
            await showAlert('Analiz Hatası: ' + error.message, 'error')
        } finally {
            setAnalyzing(false)
        }
    }

    const startManualMode = () => {
        setParsedData({
            asset_type: 'usd',
            name: '',
            quantity: 1,
            price_per_unit: 0,
            total_amount: 0,
            purchase_date: new Date().toISOString().split('T')[0],
            notes: 'Manuel Giriş'
        })
    }

    const handleApprove = async () => {
        if (!parsedData || !selectedAccount) return
        setLoading(true)

        try {
            const acc = accounts.find(a => a.id === selectedAccount)
            if (!acc) throw new Error("Hesap bulunamadı")

            const investmentName = parsedData.name || `${parsedData.quantity} Birim ${parsedData.asset_type.toUpperCase()}`

            // --- ÇİFT KAYIT KONTROLÜ BAŞLANGIÇ ---
            const { data: dupData } = await supabase
                .from('investment_transactions')
                .select('id')
                .eq('transaction_date', parsedData.purchase_date)
                .eq('total_amount', parsedData.total_amount)
                .eq('transaction_type', 'buy')
                .limit(1)

            if (dupData && dupData.length > 0) {
                const confirmed = await showConfirm(
                    `Bu tarihe (${parsedData.purchase_date}) ait ve bu tutarda (₺${parsedData.total_amount}) bir yatırım işlemi zaten eklenmiş görünüyor.\n\nÖnceki kaydı (kasa dahil) silip bu yeni fiş bilgileriyle güncellemek istiyor musunuz?`,
                    'warning'
                )
                if (!confirmed) {
                    setLoading(false)
                    return // İptal edildi
                }
                
                // Kullanıcı onayladı, eski Yatırımı sil (Rollback)
                const { error: delError } = await supabase.rpc('delete_investment_transaction', { p_transaction_id: dupData[0].id })
                if (delError) {
                    await showAlert("Eski Yatırım fişi silinirken hata oluştu: " + delError.message, 'error')
                    setLoading(false)
                    return
                }
            }
            // --- ÇİFT KAYIT KONTROLÜ BİTİŞ ---

            const { error: rpcError } = await supabase.rpc('buy_investment_transaction', {
                p_asset_type: parsedData.asset_type,
                p_name: investmentName,
                p_quantity: parsedData.quantity,
                p_price: parsedData.price_per_unit,
                p_account_id: selectedAccount,
                p_notes: parsedData.notes || null,
                p_purchase_date: parsedData.purchase_date,
                p_document_url: imageUrl || null
            })

            if (rpcError) throw rpcError

            // 4. Log
            await logActivity('Yatırım Fişi', 'EKLEME', `Yatırım eklendi: ${investmentName}`, {
                detay: `Tutar (₺${parsedData.total_amount}) | Ödenen Hesap (${acc.name})`
            })

            await showAlert('Yatırım fişi başarıyla kaydedildi!', 'success')
            router.push('/dashboard/raporlar/yatirim-gecmisi')

        } catch (err: any) {
            await showAlert('Kayıt sırasında hata oluştu: ' + err.message, 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white">← Geri</button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">💰</span>
                <h1 className="font-bold text-purple-400">Yatırım Fişi Yükle</h1>
            </header>

            <main className="p-6 max-w-4xl mx-auto">
                {!parsedData ? (
                    <div className="space-y-6">
                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center border-dashed">
                            <div className="text-6xl mb-4">📄</div>
                            <h2 className="text-xl font-bold mb-2">Makbuz veya Dekont Yükleyin</h2>
                            <p className="text-stone-400 mb-6 max-w-md mx-auto">
                                Altın alım fişi, Döviz bürosu makbuzu veya Gayrimenkul dekontunu yükleyin. Yapay zeka yatırım bilgilerini okuyup portföyünüze otomatik ekler.
                            </p>
                            
                            <label className="block w-full border-2 border-dashed border-stone-700 hover:border-purple-400 rounded-xl p-8 text-center cursor-pointer transition-colors relative bg-stone-900/50 overflow-hidden">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-6 py-3 rounded-lg transition-colors inline-block">
                                    Belge Seç / Çek
                                </div>
                                <p className="text-stone-600 text-sm mt-3">JPG, PNG, PDF desteklenir</p>
                            </label>
                            
                            <div className="flex items-center gap-4 my-6">
                                <div className="h-px bg-stone-800 flex-1"></div>
                                <span className="text-stone-500 text-sm font-bold">VEYA</span>
                                <div className="h-px bg-stone-800 flex-1"></div>
                            </div>
                            <button
                                onClick={startManualMode}
                                disabled={analyzing || loading}
                                className="w-full bg-stone-800 hover:bg-stone-700 text-white font-bold py-4 rounded-xl transition-colors border border-stone-700 text-lg"
                            >
                                ✍️ Yatırımı Manuel Gir
                            </button>
                        </div>

                        {imageUrl && (
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-6">
                                <h3 className="font-bold mb-4">Önizleme</h3>
                                <div className="flex justify-center mb-6">
                                    {fileType === 'image' && (
                                        <img src={imageUrl} alt="Yatırım Belgesi" className="max-h-96 mx-auto rounded-lg object-contain" />
                                    )}
                                    {fileType === 'pdf' && (
                                        <div className="py-12 text-center">
                                            <div className="text-6xl mb-3">📄</div>
                                            <p className="text-stone-300 font-bold">PDF Seçildi</p>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={analyzing}
                                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {analyzing ? 'Yapay Zeka Fişi Okuyor...' : 'Yapay Zeka İle Analiz Et ✨'}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1">
                                <h2 className="font-bold text-purple-400 text-xl mb-2">Yatırım Detayları</h2>
                                <p className="text-stone-400 text-sm">Yapay zeka analizini kontrol edin ve tutarları onaylayın.</p>
                            </div>
                            <div className="text-left md:text-right w-full md:w-auto">
                                <p className="text-purple-400 text-sm mb-1 font-bold">Toplam Ödenen</p>
                                <div className="text-3xl font-bold text-purple-400 bg-stone-900 px-4 py-2 rounded-lg border border-purple-500/30 inline-block">{formatCurrency(Number(parsedData.total_amount))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Form Sol */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Yatırım İsmi / Açıklama</label>
                                        <input 
                                            type="text"
                                            value={parsedData.name}
                                            onChange={(e) => setParsedData({...parsedData, name: e.target.value})}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Varlık Türü</label>
                                        <select 
                                            value={parsedData.asset_type}
                                            onChange={(e) => setParsedData({...parsedData, asset_type: e.target.value})}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                                        >
                                            <option value="usd">Dolar (USD)</option>
                                            <option value="eur">Euro (EUR)</option>
                                            <option value="gold">Altın</option>
                                            <option value="real_estate">Gayrimenkul / Araç</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Tarih</label>
                                        <input 
                                            type="date"
                                            value={parsedData.purchase_date}
                                            onChange={(e) => setParsedData({...parsedData, purchase_date: e.target.value})}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>
                                {/* Form Sağ */}
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="text-stone-400 text-sm mb-1 block">Miktar / Adet</label>
                                            <input 
                                                type="number"
                                                value={parsedData.quantity}
                                                onChange={(e) => {
                                                    const qty = parseFloat(e.target.value) || 0
                                                    setParsedData({...parsedData, quantity: qty, total_amount: qty * parsedData.price_per_unit})
                                                }}
                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400 font-bold"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-stone-400 text-sm mb-1 block">Birim Fiyat (₺)</label>
                                            <input 
                                                type="number"
                                                value={parsedData.price_per_unit}
                                                onChange={(e) => {
                                                    const price = parseFloat(e.target.value) || 0
                                                    setParsedData({...parsedData, price_per_unit: price, total_amount: parsedData.quantity * price})
                                                }}
                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400 font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Ödemenin Çıkacağı Hesap</label>
                                        <select 
                                            value={selectedAccount}
                                            onChange={(e) => setSelectedAccount(e.target.value)}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                                        >
                                            <option value="" disabled>Hesap Seçin</option>
                                            {accounts.map(a => (
                                                <option key={a.id} value={a.id}>{a.name} (Bakiye: ₺{a.balance})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Not / Açıklama</label>
                                        <input 
                                            type="text"
                                            value={parsedData.notes}
                                            onChange={(e) => setParsedData({...parsedData, notes: e.target.value})}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleApprove}
                                disabled={loading}
                                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 text-lg"
                            >
                                {loading ? 'Kaydediliyor...' : 'Onayla ve Portföye Ekle 🚀'}
                            </button>
                            <button
                                onClick={() => { setParsedData(null); setImageUrl(null); setFileText(null); setFileType(null); }}
                                disabled={loading}
                                className="bg-stone-800 hover:bg-stone-700 text-white font-bold px-8 py-4 rounded-xl transition-colors disabled:opacity-50"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

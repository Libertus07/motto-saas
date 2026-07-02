'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Account = {
    id: string
    name: string
    type: string
    balance: number
}

type AccountMovement = {
    id: string
    account_id: string
    movement_type: 'giris' | 'cikis'
    amount: number
    description: string
    source_type: string
    created_at: string
}

export default function FinansPage() {
    const [accounts, setAccounts] = useState<Account[]>([])
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [movements, setMovements] = useState<AccountMovement[]>([])
    const [loading, setLoading] = useState(true)
    
    // Modal state for manual entry
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [manualForm, setManualForm] = useState({ movement_type: 'giris', amount: '', description: '' })
    const [saving, setSaving] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        fetchAccounts()
    }, [])

    useEffect(() => {
        if (selectedAccount) {
            fetchMovements(selectedAccount.id)
        } else {
            setMovements([])
        }
    }, [selectedAccount])

    const fetchAccounts = async () => {
        setLoading(true)
        const { data, error } = await supabase.from('accounts').select('*').order('created_at', { ascending: true })
        if (error) {
            console.error('Hesaplar çekilemedi', error)
        } else {
            setAccounts(data || [])
            if (data && data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0]) // İlk hesabı seçili yap
            }
        }
        setLoading(false)
    }

    const fetchMovements = async (accountId: string) => {
        const { data, error } = await supabase
            .from('account_movements')
            .select('*')
            .eq('account_id', accountId)
            .order('created_at', { ascending: false })
            
        if (error) {
            console.error('Hareketler çekilemedi', error)
        } else {
            setMovements(data || [])
        }
    }

    const handleManualEntry = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAccount || !manualForm.amount || !manualForm.description) return

        setSaving(true)
        try {
            const amount = parseFloat(manualForm.amount)
            
            // 1. Hareketi ekle
            const { error: moveError } = await supabase.from('account_movements').insert({
                account_id: selectedAccount.id,
                movement_type: manualForm.movement_type,
                amount: amount,
                description: manualForm.description,
                source_type: 'manual'
            })
            if (moveError) throw moveError

            // 2. Bakiyeyi güncelle
            const amountChange = manualForm.movement_type === 'giris' ? amount : -amount
            const { error: accError } = await supabase.from('accounts').update({
                balance: selectedAccount.balance + amountChange
            }).eq('id', selectedAccount.id)
            if (accError) throw accError

            // Formu temizle ve verileri yenile
            setManualForm({ movement_type: 'giris', amount: '', description: '' })
            setIsModalOpen(false)
            fetchAccounts()
            fetchMovements(selectedAccount.id)
            
            // Güncel bakiyeyi selectedAccount state'ine de yansıt
            setSelectedAccount({ ...selectedAccount, balance: selectedAccount.balance + amountChange })

        } catch (error: any) {
            alert('İşlem başarısız: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="mb-8 p-6 pb-0">
                <h1 className="text-3xl font-bold text-amber-500 flex items-center gap-3">
                    💳 Finans ve Hesaplar
                </h1>
                <p className="text-stone-400 mt-2 max-w-2xl">
                    Kasa ve banka hesaplarınızı yönetin. Z-Raporu ve tedarikçi işlemleriniz otomatik olarak bu hesaplara yansır.
                </p>
            </header>

            <main className="p-6 pt-0">
                {/* Cüzdanlar (Hesap Kartları) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                    {loading ? (
                        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 h-32 animate-pulse"></div>
                    ) : accounts.map(acc => (
                        <div 
                            key={acc.id}
                            onClick={() => setSelectedAccount(acc)}
                            className={`cursor-pointer transition-all duration-300 rounded-2xl p-6 border ${
                                selectedAccount?.id === acc.id 
                                ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
                                : 'bg-stone-900 border-stone-800 hover:border-stone-600 hover:bg-stone-800/50'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-stone-950 rounded-lg text-xl border border-stone-800">
                                    {acc.type === 'cash' ? '💵' : '🏦'}
                                </div>
                                {selectedAccount?.id === acc.id && (
                                    <div className="w-3 h-3 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                                )}
                            </div>
                            <p className={`text-sm mb-1 ${selectedAccount?.id === acc.id ? 'text-amber-200' : 'text-stone-400'}`}>
                                {acc.name}
                            </p>
                            <h3 className={`text-2xl font-bold ${selectedAccount?.id === acc.id ? 'text-amber-500' : 'text-white'}`}>
                                ₺{acc.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </h3>
                        </div>
                    ))}
                </div>

                {/* Seçili Hesap Ekstresi */}
                {selectedAccount && (
                    <div className="bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden">
                        <div className="p-6 border-b border-stone-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    {selectedAccount.type === 'cash' ? '💵' : '🏦'} {selectedAccount.name} Hareketleri
                                </h2>
                                <p className="text-stone-400 text-sm mt-1">Bu hesaba ait tüm para giriş ve çıkışları</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(true)}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-4 py-2 rounded-xl transition-colors text-sm font-bold border border-stone-700 flex items-center gap-2"
                            >
                                <span>✍️</span> Manuel İşlem Ekle
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-stone-950/50 text-stone-400 border-b border-stone-800">
                                    <tr>
                                        <th className="px-6 py-4 font-medium">Tarih</th>
                                        <th className="px-6 py-4 font-medium">İşlem / Açıklama</th>
                                        <th className="px-6 py-4 font-medium">Kaynak</th>
                                        <th className="px-6 py-4 font-medium text-right">Tutar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-800">
                                    {movements.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-stone-500">
                                                Henüz bir hesap hareketi bulunmuyor.
                                            </td>
                                        </tr>
                                    ) : movements.map(move => {
                                        const isGiris = move.movement_type === 'giris'
                                        return (
                                            <tr key={move.id} className="hover:bg-stone-800/30 transition-colors">
                                                <td className="px-6 py-4 text-stone-400 whitespace-nowrap">
                                                    {new Date(move.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4 font-medium text-stone-200">
                                                    {move.description}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                                        move.source_type === 'z_report' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                        move.source_type === 'supplier_payment' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                                        move.source_type === 'expense' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                        'bg-stone-800 text-stone-400 border-stone-700'
                                                    }`}>
                                                        {move.source_type === 'z_report' ? 'Z-Raporu' :
                                                         move.source_type === 'supplier_payment' ? 'Tedarikçi Ödemesi' :
                                                         move.source_type === 'expense' ? 'Masraf/Gider' : 'Manuel İşlem'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <span className={`font-bold px-3 py-1 rounded-lg ${isGiris ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                        {isGiris ? '+' : '-'} ₺{move.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* Manuel İşlem Modalı */}
            {isModalOpen && selectedAccount && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">Manuel İşlem Ekle</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-stone-500 hover:text-white">✕</button>
                        </div>
                        
                        <form onSubmit={handleManualEntry} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">İşlem Yapılacak Hesap</label>
                                <div className="bg-stone-950 border border-stone-800 rounded-lg px-4 py-3 text-stone-300 font-medium">
                                    {selectedAccount.name}
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">İşlem Türü</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setManualForm({...manualForm, movement_type: 'giris'})}
                                        className={`py-2 px-4 rounded-lg font-bold border transition-colors ${manualForm.movement_type === 'giris' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-stone-800 border-stone-700 text-stone-400'}`}
                                    >
                                        Para Girişi
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setManualForm({...manualForm, movement_type: 'cikis'})}
                                        className={`py-2 px-4 rounded-lg font-bold border transition-colors ${manualForm.movement_type === 'cikis' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-stone-800 border-stone-700 text-stone-400'}`}
                                    >
                                        Para Çıkışı
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Tutar (₺)</label>
                                <input 
                                    type="number"
                                    required
                                    step="0.01"
                                    min="0.01"
                                    value={manualForm.amount}
                                    onChange={(e) => setManualForm({...manualForm, amount: e.target.value})}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400 text-xl font-bold"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Açıklama</label>
                                <input 
                                    type="text"
                                    required
                                    value={manualForm.description}
                                    onChange={(e) => setManualForm({...manualForm, description: e.target.value})}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="Örn: Kasaya para eklendi, Patron avans..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !manualForm.amount || !manualForm.description}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors disabled:opacity-50 mt-4"
                            >
                                {saving ? 'Kaydediliyor...' : 'İşlemi Kaydet'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

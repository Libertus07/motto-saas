'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

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
    const { showAlert, showConfirm } = useNotification()
    const router = useRouter()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [movements, setMovements] = useState<AccountMovement[]>([])
    const [loading, setLoading] = useState(true)
    
    // UI states
    const [expandedDates, setExpandedDates] = useState<string[]>(['Bugün'])
    const [selectedMovement, setSelectedMovement] = useState<AccountMovement | null>(null)
    
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

    const groupedMovements = useMemo(() => {
        const groups: Record<string, AccountMovement[]> = {}
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        movements.forEach(move => {
            const date = new Date(move.created_at)
            let dateKey = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
            
            if (date.toDateString() === today.toDateString()) {
                dateKey = 'Bugün'
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = 'Dün'
            }

            if (!groups[dateKey]) {
                groups[dateKey] = []
            }
            groups[dateKey].push(move)
        })
        return groups
    }, [movements])

    const toggleDate = (dateKey: string) => {
        setExpandedDates(prev => prev.includes(dateKey) ? prev.filter(d => d !== dateKey) : [...prev, dateKey])
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

            // Audit Log
            const changeDesc = `Manuel ${manualForm.movement_type === 'giris' ? 'Para Girişi' : 'Para Çıkışı'} İşlemi (${selectedAccount.name})`
            await logActivity('Finans', 'EKLEME', changeDesc, {
                detay: `Tutar (${manualForm.movement_type === 'giris' ? '+' : '-'}₺${amount}) | Açıklama (${manualForm.description})`
            })

        } catch (error: any) {
            await showAlert('İşlem başarısız: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteMovement = async (move: AccountMovement) => {
        const confirmed = await showConfirm(
            `Bu kasa hareketini silmek istediğinize emin misiniz?\n\nBu işlem sonucunda ${move.movement_type === 'giris' ? 'giren tutar kasanızdan düşülecektir' : 'çıkan tutar kasanıza geri iade edilecektir'}.`,
            'Kasa Hareketi Sil 🗑️'
        )
        if (!confirmed) return

        try {
            // 1. Kasa bakiyesini geri al (Rollback)
            const amountChange = move.movement_type === 'giris' ? -Number(move.amount) : Number(move.amount)
            
            const { error: accError } = await supabase
                .from('accounts')
                .update({ balance: Number(selectedAccount!.balance) + amountChange })
                .eq('id', selectedAccount!.id)
            
            if (accError) throw accError

            // 2. Hareketi sil
            const { error: delError } = await supabase
                .from('account_movements')
                .delete()
                .eq('id', move.id)
            
            if (delError) throw delError

            // 3. Log
            await logActivity('Finans', 'SILME', `Manuel para hareketi silindi: ${move.description}`, {
                detay: `Silinen Tutar (₺${move.amount}) | Tür (${move.movement_type}) | Hesap (${selectedAccount!.name})`
            })

            await showAlert('Kasa hareketi başarıyla silindi ve bakiye güncellendi.', 'success')
            
            setSelectedMovement(null)
            fetchAccounts()
            if (selectedAccount) {
                fetchMovements(selectedAccount.id)
            }

        } catch (error: any) {
            await showAlert('Silme işlemi başarısız: ' + error.message, 'error')
        }
    }

    const handleRedirectToModule = async (move: AccountMovement) => {
        let path = ''
        let moduleName = ''
        
        if (move.source_type === 'z_report') {
            path = '/dashboard/raporlar/gecmis'
            moduleName = 'Z-Raporu Geçmişi'
        } else if (move.source_type === 'supplier_payment' || move.source_type === 'supplier') {
            path = '/dashboard/raporlar/tedarikci-gecmisi'
            moduleName = 'Tedarikçi Geçmişi'
        } else if (move.source_type === 'expense') {
            path = '/dashboard/giderler'
            moduleName = 'Giderler Modülü'
        } else if (move.source_type === 'investment' || move.source_type === 'investment_rent') {
            path = '/dashboard/raporlar/yatirim-gecmisi'
            moduleName = 'Yatırım Geçmişi'
        }

        if (path) {
            const confirmed = await showConfirm(
                `Bu işlem otomatik olarak oluşturulmuştur.\n\nİşlemi silmek veya düzenlemek için ${moduleName} sayfasına gitmek ister misiniz?`,
                'Modüle Git 🚀'
            )
            if (confirmed) {
                setSelectedMovement(null)
                router.push(path)
            }
        } else {
            await showAlert('Bu işlemin ait olduğu kaynak modül bulunamadı.', 'warning')
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
                        
                        <div className="space-y-4 p-4 pt-0">
                            {movements.length === 0 ? (
                                <div className="p-8 text-center text-stone-500 bg-stone-950/50 rounded-xl border border-stone-800">
                                    Henüz bir hesap hareketi bulunmuyor.
                                </div>
                            ) : (
                                Object.entries(groupedMovements).map(([dateKey, groupMoves]) => {
                                    const isExpanded = expandedDates.includes(dateKey)
                                    return (
                                        <div key={dateKey} className="bg-stone-950/50 rounded-xl border border-stone-800 overflow-hidden">
                                            <button 
                                                onClick={() => toggleDate(dateKey)}
                                                className="w-full flex items-center justify-between px-6 py-4 hover:bg-stone-800/30 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-lg">{dateKey === 'Bugün' ? '📅' : dateKey === 'Dün' ? '⏱️' : '🗓️'}</span>
                                                    <h3 className="font-bold text-stone-200">{dateKey}</h3>
                                                    <span className="bg-stone-900 text-xs px-2 py-1 rounded-full text-stone-500 border border-stone-800">{groupMoves.length} işlem</span>
                                                </div>
                                                <span className="text-stone-500 text-sm font-bold bg-stone-900 w-8 h-8 flex items-center justify-center rounded-lg border border-stone-800">{isExpanded ? '▲' : '▼'}</span>
                                            </button>
                                            
                                            {isExpanded && (
                                                <div className="overflow-x-auto border-t border-stone-800/50">
                                                    <table className="w-full text-left text-sm">
                                                        <thead className="bg-stone-900/30 text-stone-500 text-xs uppercase tracking-wider">
                                                            <tr>
                                                                <th className="px-6 py-3 font-medium">Saat</th>
                                                                <th className="px-6 py-3 font-medium">İşlem Özeti</th>
                                                                <th className="px-6 py-3 font-medium text-right">Tutar</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-stone-800/30">
                                                            {groupMoves.map(move => {
                                                                const isGiris = move.movement_type === 'giris'
                                                                return (
                                                                    <tr 
                                                                        key={move.id} 
                                                                        onClick={() => setSelectedMovement(move)}
                                                                        className="hover:bg-stone-800/30 transition-colors cursor-pointer group"
                                                                    >
                                                                        <td className="px-6 py-4 text-stone-400 whitespace-nowrap group-hover:text-amber-400/70 transition-colors">
                                                                            {new Date(move.created_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </td>
                                                                        <td className="px-6 py-4">
                                                                            <p className="font-medium text-stone-300 group-hover:text-amber-400 transition-colors">{move.description}</p>
                                                                            <p className="text-xs text-stone-500 mt-1">
                                                                                {move.source_type === 'z_report' ? 'Z-Raporu' :
                                                                                 move.source_type === 'supplier_payment' ? 'Tedarikçi Ödemesi' :
                                                                                 move.source_type === 'expense' ? 'Masraf/Gider' : 'Manuel İşlem'}
                                                                            </p>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                                                            <span className={`font-bold px-3 py-1.5 rounded-lg ${isGiris ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                                {isGiris ? '+' : '-'} ₺{move.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
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
            {/* E-Dekont Modalı */}
            {selectedMovement && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setSelectedMovement(null)}>
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setSelectedMovement(null)}
                            className="absolute top-4 right-4 text-stone-500 hover:text-white text-2xl leading-none"
                        >
                            &times;
                        </button>
                        
                        <div className="text-center mb-8 mt-2">
                            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-4 shadow-lg ${selectedMovement.movement_type === 'giris' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                {selectedMovement.movement_type === 'giris' ? '⬇️' : '⬆️'}
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-1">
                                {selectedMovement.movement_type === 'giris' ? '+' : '-'} ₺{selectedMovement.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </h2>
                            <p className="text-stone-400 text-sm font-medium">İşlem Tutarı</p>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="bg-stone-950/50 p-4 rounded-xl border border-stone-800/80 space-y-3">
                                <div className="flex justify-between items-center pb-3 border-b border-stone-800/50">
                                    <span className="text-stone-500 text-xs font-bold uppercase tracking-wider">İşlem Tarihi</span>
                                    <span className="text-stone-200 text-sm font-medium">
                                        {new Date(selectedMovement.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-stone-800/50">
                                    <span className="text-stone-500 text-xs font-bold uppercase tracking-wider">İşlem Türü</span>
                                    <span className={`text-sm font-bold ${selectedMovement.movement_type === 'giris' ? 'text-green-400' : 'text-red-400'}`}>
                                        {selectedMovement.movement_type === 'giris' ? 'Para Girişi' : 'Para Çıkışı'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pb-3 border-b border-stone-800/50">
                                    <span className="text-stone-500 text-xs font-bold uppercase tracking-wider">Kaynak</span>
                                    <span className="text-stone-200 text-sm font-medium">
                                        {selectedMovement.source_type === 'z_report' ? 'Z-Raporu' :
                                         selectedMovement.source_type === 'supplier_payment' ? 'Tedarikçi Ödemesi' :
                                         selectedMovement.source_type === 'expense' ? 'Masraf/Gider' : 'Manuel İşlem'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-stone-500 text-xs font-bold uppercase tracking-wider">Hesap</span>
                                    <span className="text-amber-400 text-sm font-bold">
                                        {selectedAccount?.name}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-stone-950/50 p-4 rounded-xl border border-stone-800/80">
                                <span className="text-stone-500 text-xs font-bold uppercase tracking-wider block mb-2">Açıklama</span>
                                <p className="text-stone-200 text-sm leading-relaxed">
                                    {selectedMovement.description}
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 flex gap-3">
                            {selectedMovement.source_type === 'manual' ? (
                                <button 
                                    onClick={() => handleDeleteMovement(selectedMovement)}
                                    className="flex-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 py-3 rounded-xl text-sm font-bold transition-colors active:scale-95 flex items-center justify-center gap-2"
                                >
                                    🗑️ İşlemi Sil
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleRedirectToModule(selectedMovement)}
                                    className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 py-3 rounded-xl text-sm font-bold transition-colors active:scale-95 flex items-center justify-center gap-2"
                                    title="Sistem tarafından otomatik oluşturulan işlemlerin kaynağına git"
                                >
                                    🔗 Kaynağa Git
                                </button>
                            )}
                            <button 
                                onClick={() => setSelectedMovement(null)}
                                className="flex-1 bg-stone-800 hover:bg-stone-700 text-white py-3 rounded-xl text-sm font-bold transition-colors"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

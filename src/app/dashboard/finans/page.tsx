'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devError } from '@/lib/debug'
import { formatCurrency, formatDate } from "@/lib/format"
import { HistoryAccordion } from '@/components/ui/HistoryAccordion'

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
    z_details?: {
        hasilat: number
        gider: number
        acikFazla: number
        acikFazlaTipi: string
        net: number
    }
}

const getErrorMessage = (error: unknown) =>
    error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Bilinmeyen hata'

export default function FinansPage() {
    const { showAlert, showConfirm } = useNotification()
    const router = useRouter()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [movements, setMovements] = useState<AccountMovement[]>([])
    const [loading, setLoading] = useState(true)
    
    // Search & Filter states
    const [searchQuery, setSearchQuery] = useState('')
    const [filterType, setFilterType] = useState<'all' | 'giris' | 'cikis'>('all')
    const [filterSource, setFilterSource] = useState<string>('all')
    
    // UI Modal states
    const [selectedMovement, setSelectedMovement] = useState<AccountMovement | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [manualForm, setManualForm] = useState({ movement_type: 'giris', amount: '', description: '' })
    const [saving, setSaving] = useState(false)

    const supabase = useMemo(() => createClient(), [])

    const fetchAccounts = useCallback(async () => {
        setLoading(true)
        const { data, error } = await supabase.from('accounts').select('*').order('created_at', { ascending: true })
        if (error) {
            devError('Hesaplar çekilemedi', error)
        } else {
            setAccounts(data || [])
            if (data && data.length > 0 && !selectedAccount) {
                setSelectedAccount(data[0])
            }
        }
        setLoading(false)
    }, [selectedAccount, supabase])

    const fetchMovements = useCallback(async (accountId: string) => {
        const { data, error } = await supabase
            .from('account_movements')
            .select('*')
            .eq('account_id', accountId)
            .order('created_at', { ascending: false })
            
        if (error) {
            devError('Hareketler çekilemedi', error)
        } else {
            setMovements(data || [])
        }
    }, [supabase])

    useEffect(() => {
        const id = window.setTimeout(() => {
            void fetchAccounts()
        }, 0)
        return () => window.clearTimeout(id)
    }, [fetchAccounts])

    useEffect(() => {
        const id = window.setTimeout(() => {
            if (selectedAccount) {
                void fetchMovements(selectedAccount.id)
            } else {
                setMovements([])
            }
        }, 0)
        return () => window.clearTimeout(id)
    }, [fetchMovements, selectedAccount])

    // Top Executive KPIs
    const totalLiquidity = useMemo(() => {
        return accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }, [accounts])

    const totalCash = useMemo(() => {
        return accounts.filter(acc => acc.type === 'cash').reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }, [accounts])

    const totalBank = useMemo(() => {
        return accounts.filter(acc => acc.type !== 'cash').reduce((sum, acc) => sum + (acc.balance || 0), 0)
    }, [accounts])

    const monthlyNetFlow = useMemo(() => {
        const now = new Date()
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        
        let net = 0
        movements.forEach(m => {
            if (new Date(m.created_at) >= firstDayOfMonth) {
                if (m.movement_type === 'giris') net += Number(m.amount)
                else net -= Number(m.amount)
            }
        })
        return net
    }, [movements])

    // Filtered movements based on search query, movement type, and source
    const filteredMovements = useMemo(() => {
        return movements.filter(m => {
            // Type filter
            if (filterType !== 'all' && m.movement_type !== filterType) return false

            // Source filter
            if (filterSource !== 'all') {
                if (filterSource === 'z_report' && !['z_report', 'z_report_group', 'reconciliation'].includes(m.source_type)) return false
                if (filterSource === 'supplier' && !['supplier_payment', 'supplier'].includes(m.source_type)) return false
                if (filterSource === 'expense' && m.source_type !== 'expense') return false
                if (filterSource === 'manual' && m.source_type !== 'manual') return false
            }

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase()
                const desc = (m.description || '').toLowerCase()
                const src = (m.source_type || '').toLowerCase()
                const amt = String(m.amount)
                return desc.includes(q) || src.includes(q) || amt.includes(q)
            }

            return true
        })
    }, [movements, filterType, filterSource, searchQuery])

    const groupedMovements = useMemo(() => {
        const groups: Record<string, AccountMovement[]> = {}
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        const processedMovements: AccountMovement[] = []
        const zReportMap: Record<string, AccountMovement[]> = {}

        filteredMovements.forEach(move => {
            if (move.source_type === 'z_report' || move.source_type === 'reconciliation') {
                const match = move.description.match(/^\d{4}-\d{2}-\d{2}/)
                const reportDateStr = match ? match[0] : new Date(move.created_at).toISOString().split('T')[0]
                
                if (!zReportMap[reportDateStr]) zReportMap[reportDateStr] = []
                zReportMap[reportDateStr].push(move)
            } else {
                processedMovements.push(move)
            }
        })

        Object.keys(zReportMap).forEach(reportDateStr => {
            const zMoves = zReportMap[reportDateStr]
            let totalHasilat = 0
            let totalGider = 0
            let acikFazla = 0
            let acikFazlaTipi = ''
            
            zMoves.forEach(m => {
                const desc = m.description || ''
                if (desc.includes('Giderler')) {
                    totalGider += Number(m.amount)
                } else if (desc.includes('Hasılat')) {
                    totalHasilat += Number(m.amount)
                } else if (desc.includes('Sayım Açığı')) {
                    acikFazla -= Number(m.amount)
                    acikFazlaTipi = 'Açık'
                } else if (desc.includes('Sayım Fazlası')) {
                    acikFazla += Number(m.amount)
                    acikFazlaTipi = 'Fazla'
                } else {
                    if (m.movement_type === 'giris') totalHasilat += Number(m.amount)
                    else totalGider += Number(m.amount)
                }
            })
            
            const netAmount = totalHasilat - totalGider + acikFazla
            if (netAmount === 0 && totalHasilat === 0 && totalGider === 0 && acikFazla === 0) return

            let descText = `${reportDateStr} Gün Sonu Net Kasa Hareketi (Giriş: ${formatCurrency(totalHasilat)} | Gider: ${formatCurrency(totalGider)}`
            if (acikFazlaTipi) {
                descText += ` | Sayım ${acikFazlaTipi}: ${acikFazla > 0 ? '+ ' : '- '}${formatCurrency(Math.abs(acikFazla))}`
            }
            descText += ')'

            const combinedMove: AccountMovement = {
                id: `grouped-z-${reportDateStr}`,
                account_id: zMoves[0].account_id,
                movement_type: netAmount >= 0 ? 'giris' : 'cikis',
                amount: Math.abs(netAmount),
                description: descText,
                source_type: 'z_report_group',
                created_at: zMoves[0].created_at,
                z_details: {
                    hasilat: totalHasilat,
                    gider: totalGider,
                    acikFazla: acikFazla,
                    acikFazlaTipi: acikFazlaTipi,
                    net: netAmount
                }
            }
            
            processedMovements.push(combinedMove)
        })

        processedMovements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        processedMovements.forEach(move => {
            const date = new Date(move.created_at)
            let dateKey = formatDate(date)
            
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
    }, [filteredMovements])

    const handleManualEntry = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAccount || !manualForm.amount || !manualForm.description) return

        setSaving(true)
        try {
            const amount = parseFloat(manualForm.amount)
            
            const { error: moveError } = await supabase.from('account_movements').insert({
                account_id: selectedAccount.id,
                movement_type: manualForm.movement_type,
                amount: amount,
                description: manualForm.description,
                source_type: 'manual'
            })
            if (moveError) throw moveError

            const amountChange = manualForm.movement_type === 'giris' ? amount : -amount
            const { error: accError } = await supabase.from('accounts').update({
                balance: selectedAccount.balance + amountChange
            }).eq('id', selectedAccount.id)
            if (accError) throw accError

            setManualForm({ movement_type: 'giris', amount: '', description: '' })
            setIsModalOpen(false)
            fetchAccounts()
            fetchMovements(selectedAccount.id)
            
            setSelectedAccount({ ...selectedAccount, balance: selectedAccount.balance + amountChange })

            const changeDesc = `Manuel ${manualForm.movement_type === 'giris' ? 'Para Girişi' : 'Para Çıkışı'} İşlemi (${selectedAccount.name})`
            await logActivity('Finans', 'EKLEME', changeDesc, {
                detay: `Tutar (${manualForm.movement_type === 'giris' ? '+' : '-'}₺${amount}) | Açıklama (${manualForm.description})`
            })

            await showAlert('Manuel işlem başarıyla eklendi ve hesap bakiyesi güncellendi.', 'success')

        } catch (error: unknown) {
            await showAlert('İşlem başarısız: ' + getErrorMessage(error), 'error')
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
            const amountChange = move.movement_type === 'giris' ? -Number(move.amount) : Number(move.amount)
            
            const { error: accError } = await supabase
                .from('accounts')
                .update({ balance: Number(selectedAccount!.balance) + amountChange })
                .eq('id', selectedAccount!.id)
            
            if (accError) throw accError

            const { error: delError } = await supabase
                .from('account_movements')
                .delete()
                .eq('id', move.id)
            
            if (delError) throw delError

            await logActivity('Finans', 'SILME', `Manuel para hareketi silindi: ${move.description}`, {
                detay: `Silinen Tutar (₺${move.amount}) | Tür (${move.movement_type}) | Hesap (${selectedAccount!.name})`
            })

            await showAlert('Kasa hareketi başarıyla silindi ve bakiye güncellendi.', 'success')
            
            setSelectedMovement(null)
            fetchAccounts()
            if (selectedAccount) {
                fetchMovements(selectedAccount.id)
            }

        } catch (error: unknown) {
            await showAlert('Silme işlemi başarısız: ' + getErrorMessage(error), 'error')
        }
    }

    const handleRedirectToModule = async (move: AccountMovement) => {
        let path = ''
        let moduleName = ''
        
        if (move.source_type === 'z_report' || move.source_type === 'reconciliation' || move.source_type === 'z_report_group') {
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
        <div className="min-h-full bg-stone-950 text-white pb-24 selection:bg-amber-500/30 selection:text-amber-300">
            {/* Header Banner */}
            <header className="border-b border-stone-800/80 bg-stone-900/50 backdrop-blur-xl sticky top-0 z-20 px-6 py-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/30 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                                💳
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                                    Finans ve Hesaplar Komut Merkezi
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                        ● Canlı Bakiye
                                    </span>
                                </h1>
                                <p className="text-stone-400 text-sm mt-0.5">
                                    Kasa, banka hesapları, nakit akışı ve otomatik modül entegrasyon yönetimi
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Executive Action Buttons */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={() => router.push('/dashboard/kasa/sayim')}
                            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 border border-stone-700/80 text-stone-200 text-sm font-semibold transition-all duration-200 hover:border-amber-500/40 flex items-center justify-center gap-2 group shadow-sm active:scale-95"
                            aria-label="Kasa Sayımı Yap"
                        >
                            <span className="group-hover:rotate-12 transition-transform">📊</span>
                            <span>Kasa Sayımı Yap</span>
                        </button>

                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 md:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 text-sm font-bold transition-all duration-200 shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.35)] flex items-center justify-center gap-2 active:scale-95"
                            aria-label="Manuel İşlem Ekle"
                        >
                            <span>✍️</span>
                            <span>Manuel İşlem Ekle</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-6 space-y-8 mt-4">
                {/* Executive Finance KPI Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* KPI 1: Toplam Likidite */}
                    <div className="bg-gradient-to-br from-stone-900/90 via-stone-900/60 to-stone-950/80 rounded-2xl p-5 border border-amber-500/30 shadow-[0_4px_25px_rgba(245,158,11,0.05)] relative overflow-hidden group hover:border-amber-500/50 transition-all">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-all pointer-events-none"></div>
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-amber-400/90 tracking-wider uppercase">Toplam Varlık (Likidite)</span>
                            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-lg">💰</span>
                        </div>
                        <h3 className="text-3xl font-black bg-gradient-to-r from-amber-300 via-amber-100 to-amber-400 bg-clip-text text-transparent tracking-tight">
                            {formatCurrency(totalLiquidity)}
                        </h3>
                        <p className="text-xs text-stone-500 mt-2 flex items-center gap-1">
                            <span className="text-amber-500/80">⚡</span> Tüm hesapların anlık toplamı
                        </p>
                    </div>

                    {/* KPI 2: Nakit Kasa */}
                    <div className="bg-stone-900/80 rounded-2xl p-5 border border-stone-800/80 hover:border-stone-700/80 shadow-md transition-all group relative overflow-hidden">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-stone-400 tracking-wider uppercase">Nakit Kasa Mevcudu</span>
                            <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-lg">💵</span>
                        </div>
                        <h3 className="text-2xl font-bold text-emerald-400 tracking-tight">
                            {formatCurrency(totalCash)}
                        </h3>
                        <p className="text-xs text-stone-500 mt-2">
                            Restoran içi fiziksel nakit
                        </p>
                    </div>

                    {/* KPI 3: Banka ve POS */}
                    <div className="bg-stone-900/80 rounded-2xl p-5 border border-stone-800/80 hover:border-stone-700/80 shadow-md transition-all group relative overflow-hidden">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-stone-400 tracking-wider uppercase">Banka & POS Hesapları</span>
                            <span className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-lg">🏦</span>
                        </div>
                        <h3 className="text-2xl font-bold text-blue-400 tracking-tight">
                            {formatCurrency(totalBank)}
                        </h3>
                        <p className="text-xs text-stone-500 mt-2">
                            Banka vadesiz & POS bakiyesi
                        </p>
                    </div>

                    {/* KPI 4: Bu Ayki Net Akış */}
                    <div className="bg-stone-900/80 rounded-2xl p-5 border border-stone-800/80 hover:border-stone-700/80 shadow-md transition-all group relative overflow-hidden">
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-stone-400 tracking-wider uppercase">Bu Ayki Net Akış</span>
                            <span className={`p-2 rounded-lg border text-lg ${monthlyNetFlow >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                                {monthlyNetFlow >= 0 ? '📈' : '📉'}
                            </span>
                        </div>
                        <h3 className={`text-2xl font-bold tracking-tight ${monthlyNetFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {monthlyNetFlow >= 0 ? '+ ' : ''}{formatCurrency(monthlyNetFlow)}
                        </h3>
                        <p className="text-xs text-stone-500 mt-2">
                            Ay başından itibaren giriş-çıkış farkı
                        </p>
                    </div>
                </div>

                {/* Symmetrical Account Cards (Cüzdanlar) Grid */}
                <section aria-labelledby="accounts-heading">
                    <div className="flex justify-between items-center mb-4">
                        <h2 id="accounts-heading" className="text-lg font-bold text-white flex items-center gap-2">
                            <span>💳</span> Hesap Yönetimi & Cüzdanlar
                        </h2>
                        <span className="text-xs text-stone-500 font-mono">
                            {accounts.length} Aktif Hesap
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, idx) => (
                                <div key={idx} className="bg-stone-900/50 border border-stone-800 rounded-2xl p-6 h-36 animate-pulse"></div>
                            ))
                        ) : accounts.map(acc => {
                            const isSelected = selectedAccount?.id === acc.id
                            const isCash = acc.type === 'cash'

                            return (
                                <div 
                                    key={acc.id}
                                    onClick={() => setSelectedAccount(acc)}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${acc.name} hesabı, Bakiye: ${formatCurrency(acc.balance)}`}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedAccount(acc) }}
                                    className={`cursor-pointer transition-all duration-300 rounded-2xl p-6 border relative overflow-hidden group ${
                                        isSelected 
                                        ? 'bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-stone-900 border-amber-500/60 shadow-[0_0_25px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40' 
                                        : 'bg-stone-900/70 border-stone-800/90 hover:border-stone-700 hover:bg-stone-850 hover:shadow-lg'
                                    }`}
                                >
                                    {/* Active Top Line */}
                                    {isSelected && (
                                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-300"></div>
                                    )}

                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`p-2.5 rounded-xl border text-xl transition-all ${
                                            isSelected 
                                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-300 shadow-sm' 
                                            : 'bg-stone-950 border-stone-800 text-stone-300'
                                        }`}>
                                            {isCash ? '💵' : '🏦'}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                                                isCash ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                            }`}>
                                                {isCash ? 'Nakit Kasa' : 'Banka Hesabı'}
                                            </span>

                                            {isSelected && (
                                                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.8)] animate-pulse"></span>
                                            )}
                                        </div>
                                    </div>

                                    <p className={`text-sm font-semibold mb-1 truncate ${isSelected ? 'text-amber-200' : 'text-stone-400 group-hover:text-stone-200'}`}>
                                        {acc.name}
                                    </p>
                                    
                                    <h3 className={`text-2xl font-black tracking-tight ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                                        {formatCurrency(acc.balance)}
                                    </h3>
                                </div>
                            )
                        })}
                    </div>
                </section>

                {/* Selected Account Ledger & Filter Controls */}
                {selectedAccount && (
                    <section className="bg-stone-900/90 rounded-2xl border border-stone-800/90 shadow-2xl overflow-hidden backdrop-blur-md">
                        {/* Account Ledger Header */}
                        <div className="p-6 border-b border-stone-800/80 bg-stone-900/80 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{selectedAccount.type === 'cash' ? '💵' : '🏦'}</span>
                                    <div>
                                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                            {selectedAccount.name} Ekstresi
                                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                {formatCurrency(selectedAccount.balance)}
                                            </span>
                                        </h2>
                                        <p className="text-stone-400 text-xs mt-0.5">
                                            Seçili hesaba ait gerçekleşen tüm finansal hareketler
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Search & Filter Pills */}
                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                {/* Search input */}
                                <div className="relative flex-1 sm:w-64">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-500 text-sm pointer-events-none">
                                        🔍
                                    </span>
                                    <input 
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Hareketlerde ara..."
                                        className="w-full pl-9 pr-4 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500/50 transition-colors"
                                    />
                                    {searchQuery && (
                                        <button 
                                            onClick={() => setSearchQuery('')}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-stone-500 hover:text-stone-300 text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Movement Type Selector */}
                                <div className="flex items-center bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs font-semibold">
                                    <button
                                        onClick={() => setFilterType('all')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'all' ? 'bg-amber-500 text-stone-950 font-bold shadow-sm' : 'text-stone-400 hover:text-white'}`}
                                    >
                                        Tümü
                                    </button>
                                    <button
                                        onClick={() => setFilterType('giris')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'giris' ? 'bg-emerald-500 text-stone-950 font-bold shadow-sm' : 'text-stone-400 hover:text-white'}`}
                                    >
                                        Giriş (+)
                                    </button>
                                    <button
                                        onClick={() => setFilterType('cikis')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${filterType === 'cikis' ? 'bg-rose-500 text-stone-950 font-bold shadow-sm' : 'text-stone-400 hover:text-white'}`}
                                    >
                                        Çıkış (-)
                                    </button>
                                </div>

                                {/* Source Filter Dropdown */}
                                <select
                                    value={filterSource}
                                    onChange={(e) => setFilterSource(e.target.value)}
                                    className="bg-stone-950 border border-stone-800 text-stone-300 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500/50"
                                >
                                    <option value="all">Tüm Kaynaklar</option>
                                    <option value="z_report">Z-Raporları</option>
                                    <option value="supplier">Tedarikçi Ödemeleri</option>
                                    <option value="expense">Masraf & Giderler</option>
                                    <option value="manual">Manuel İşlemler</option>
                                </select>
                            </div>
                        </div>
                        
                        {/* Transaction Accordion Table */}
                        <div className="p-6">
                            {movements.length === 0 ? (
                                <div className="p-12 text-center text-stone-500 bg-stone-950/40 rounded-2xl border border-stone-800/60">
                                    <span className="text-4xl mb-3 block opacity-40">📂</span>
                                    <p className="font-semibold text-stone-400">Henüz bu hesaba ait kayıtlı bir işlem bulunmuyor.</p>
                                    <button 
                                        onClick={() => setIsModalOpen(true)}
                                        className="mt-4 px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl text-xs font-bold hover:bg-amber-500/20 transition-colors"
                                    >
                                        + İlk Manuel İşlemi Ekle
                                    </button>
                                </div>
                            ) : Object.keys(groupedMovements).length === 0 ? (
                                <div className="p-12 text-center text-stone-500 bg-stone-950/40 rounded-2xl border border-stone-800/60">
                                    <span className="text-3xl mb-2 block">🔍</span>
                                    <p className="font-medium text-stone-400">Arama kriterlerine uygun işlem bulunamadı.</p>
                                </div>
                            ) : (
                                <HistoryAccordion
                                    groups={Object.entries(groupedMovements).map(([dateKey, groupMoves]) => ({
                                        id: dateKey,
                                        title: dateKey,
                                        subtitle: `${groupMoves.length} İşlem Hareket Kaydı`,
                                        icon: <span className="text-xl">{dateKey === 'Bugün' ? '📅' : dateKey === 'Dün' ? '⏱️' : '🗓️'}</span>,
                                        items: groupMoves
                                    }))}
                                    defaultExpandedIds={['Bugün']}
                                    renderContent={(groupMoves: AccountMovement[]) => (
                                        <div className="overflow-x-auto border-t border-stone-800/60">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-stone-950/80 text-stone-400 text-xs font-bold uppercase tracking-wider border-b border-stone-800">
                                                    <tr>
                                                        <th className="px-6 py-3.5">İşlem Tarihi / Saat</th>
                                                        <th className="px-6 py-3.5">Kaynak & Modül</th>
                                                        <th className="px-6 py-3.5">Açıklama</th>
                                                        <th className="px-6 py-3.5 text-right">Tutar (₺)</th>
                                                        <th className="px-6 py-3.5 text-center">Detay</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-stone-800/40">
                                                    {groupMoves.map((move: AccountMovement) => {
                                                        const isGiris = move.movement_type === 'giris'
                                                        
                                                        let sourceBadgeClass = 'bg-stone-800 text-stone-300 border-stone-700'
                                                        let sourceLabel = 'Manuel İşlem'

                                                        if (move.source_type === 'z_report' || move.source_type === 'z_report_group') {
                                                            sourceBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                            sourceLabel = move.source_type === 'z_report_group' ? 'Gün Sonu Net İşlem' : 'Z-Raporu'
                                                        } else if (move.source_type === 'supplier_payment' || move.source_type === 'supplier') {
                                                            sourceBadgeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                                                            sourceLabel = 'Tedarikçi Ödemesi'
                                                        } else if (move.source_type === 'expense') {
                                                            sourceBadgeClass = 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                                            sourceLabel = 'Masraf/Gider'
                                                        } else if (move.source_type === 'investment' || move.source_type === 'investment_rent') {
                                                            sourceBadgeClass = 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                                            sourceLabel = 'Yatırım Kaydı'
                                                        }

                                                        return (
                                                            <tr 
                                                                key={move.id} 
                                                                onClick={() => setSelectedMovement(move)}
                                                                className="hover:bg-stone-800/60 transition-colors cursor-pointer group"
                                                            >
                                                                <td className="px-6 py-4 text-stone-400 whitespace-nowrap text-xs font-mono group-hover:text-amber-400/90 transition-colors">
                                                                    {formatDate(new Date(move.created_at))}
                                                                </td>
                                                                
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${sourceBadgeClass}`}>
                                                                        {sourceLabel}
                                                                    </span>
                                                                </td>

                                                                <td className="px-6 py-4">
                                                                    <p className="font-medium text-stone-200 text-sm group-hover:text-white transition-colors">
                                                                        {move.description}
                                                                    </p>
                                                                </td>

                                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                                    <span className={`inline-flex items-center font-bold px-3 py-1.5 rounded-xl border text-sm ${
                                                                        isGiris 
                                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]' 
                                                                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30 shadow-[0_0_10px_rgba(244,63,94,0.1)]'
                                                                    }`}>
                                                                        {isGiris ? '+ ' : '- '}{formatCurrency(move.amount)}
                                                                    </span>
                                                                </td>

                                                                <td className="px-6 py-4 text-center whitespace-nowrap">
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setSelectedMovement(move)
                                                                        }}
                                                                        className="p-1.5 rounded-lg bg-stone-800 text-stone-400 hover:text-white hover:bg-stone-700 transition-colors text-xs font-medium"
                                                                        aria-label="Dekont Detayı Görüntüle"
                                                                    >
                                                                        👁️ Dekont
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                />
                            )}
                        </div>
                    </section>
                )}
            </main>

            {/* Manuel İşlem Ekle Modalı */}
            {isModalOpen && selectedAccount && (
                <div 
                    className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="manual-entry-modal-title"
                >
                    <div className="bg-stone-900 border border-stone-700/80 rounded-2xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Header gradient bar */}
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600"></div>

                        <div className="flex justify-between items-center mb-6 pt-1">
                            <h3 id="manual-entry-modal-title" className="text-xl font-bold text-white flex items-center gap-2">
                                <span>✍️</span> Manuel Kasa İşlemi Ekle
                            </h3>
                            <button 
                                onClick={() => {
                                    setIsModalOpen(false)
                                    setManualForm({ movement_type: 'giris', amount: '', description: '' })
                                }} 
                                className="w-8 h-8 rounded-full bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center transition-colors"
                                aria-label="Kapat"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <form onSubmit={handleManualEntry} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">İşlem Yapılacak Hesap</label>
                                <div className="bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-amber-400 font-bold flex items-center justify-between">
                                    <span>{selectedAccount.name}</span>
                                    <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full font-normal">
                                        Mevcut: {formatCurrency(selectedAccount.balance)}
                                    </span>
                                </div>
                            </div>
                            
                            <div>
                                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">İşlem Yönü</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        type="button"
                                        onClick={() => setManualForm({...manualForm, movement_type: 'giris'})}
                                        className={`py-3 px-4 rounded-xl font-bold border transition-all text-sm flex items-center justify-center gap-2 ${
                                            manualForm.movement_type === 'giris' 
                                            ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                                        }`}
                                    >
                                        <span>🟢</span> Para Girişi (+)
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setManualForm({...manualForm, movement_type: 'cikis'})}
                                        className={`py-3 px-4 rounded-xl font-bold border transition-all text-sm flex items-center justify-center gap-2 ${
                                            manualForm.movement_type === 'cikis' 
                                            ? 'bg-rose-500/20 border-rose-500/60 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)]' 
                                            : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200'
                                        }`}
                                    >
                                        <span>🔴</span> Para Çıkışı (-)
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Tutar (₺)</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-amber-500 font-bold text-lg pointer-events-none">
                                        ₺
                                    </span>
                                    <input 
                                        type="number"
                                        required
                                        step="0.01"
                                        min="0.01"
                                        value={manualForm.amount}
                                        onChange={(e) => setManualForm({...manualForm, amount: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-700/80 rounded-xl pl-9 pr-4 py-3 text-white focus:outline-none focus:border-amber-400 text-xl font-black tracking-tight"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Açıklama</label>
                                <input 
                                    type="text"
                                    required
                                    value={manualForm.description}
                                    onChange={(e) => setManualForm({...manualForm, description: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-700/80 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 text-sm font-medium"
                                    placeholder="Örn: Kasaya nakit takviyesi, Patron avans..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !manualForm.amount || !manualForm.description}
                                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold py-3.5 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.25)] disabled:opacity-50 mt-4 active:scale-95 text-sm"
                            >
                                {saving ? 'Kaydediliyor...' : 'İşlemi Onayla ve Kaydet 🚀'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* E-Dekont (Transaction Details) Modalı */}
            {selectedMovement && (
                <div 
                    className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md animate-in fade-in duration-200" 
                    onClick={() => setSelectedMovement(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="receipt-modal-title"
                >
                    <div 
                        className="bg-stone-900 border border-stone-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden" 
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Receipt Top Pattern Line */}
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-purple-500"></div>

                        <button 
                            onClick={() => setSelectedMovement(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center transition-colors text-sm"
                            aria-label="Kapat"
                        >
                            ✕
                        </button>
                        
                        {/* Dekont Header */}
                        <div className="text-center mb-6 mt-2">
                            <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-3 shadow-lg ${
                                selectedMovement.movement_type === 'giris' 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                                {selectedMovement.movement_type === 'giris' ? '⬇️' : '⬆️'}
                            </div>
                            <span id="receipt-modal-title" className="text-stone-400 text-xs font-bold uppercase tracking-widest block mb-1">
                                Dijital İşlem Dekontu
                            </span>
                            <h2 className={`text-3xl font-black tracking-tight ${selectedMovement.movement_type === 'giris' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {selectedMovement.movement_type === 'giris' ? '+ ' : '- '}{formatCurrency(selectedMovement.amount)}
                            </h2>
                        </div>
                        
                        {/* Key-Value Details */}
                        <div className="space-y-4">
                            <div className="bg-stone-950/70 p-4 rounded-2xl border border-stone-800/80 space-y-3">
                                <div className="flex justify-between items-center pb-2.5 border-b border-stone-800/60 text-xs">
                                    <span className="text-stone-500 font-bold uppercase tracking-wider">İşlem Tarihi</span>
                                    <span className="text-stone-200 font-mono font-medium">
                                        {formatDate(new Date(selectedMovement.created_at))}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center pb-2.5 border-b border-stone-800/60 text-xs">
                                    <span className="text-stone-500 font-bold uppercase tracking-wider">İşlem Türü</span>
                                    <span className={`font-bold ${selectedMovement.movement_type === 'giris' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {selectedMovement.movement_type === 'giris' ? 'Para Girişi (+)' : 'Para Çıkışı (-)'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center pb-2.5 border-b border-stone-800/60 text-xs">
                                    <span className="text-stone-500 font-bold uppercase tracking-wider">Kaynak Modül</span>
                                    <span className="text-amber-400 font-bold">
                                        {selectedMovement.source_type === 'z_report' ? 'Z-Raporu' :
                                         selectedMovement.source_type === 'z_report_group' ? 'Z-Raporu & Kasa Sayımı' :
                                         selectedMovement.source_type === 'supplier_payment' ? 'Tedarikçi Ödemesi' :
                                         selectedMovement.source_type === 'expense' ? 'Masraf/Gider' : 'Manuel İşlem'}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-stone-500 font-bold uppercase tracking-wider">İşlenen Hesap</span>
                                    <span className="text-white font-bold">
                                        {selectedAccount?.name}
                                    </span>
                                </div>
                            </div>

                            {/* Description & Z-Details */}
                            <div className="bg-stone-950/70 p-4 rounded-2xl border border-stone-800/80">
                                <span className="text-stone-500 text-xs font-bold uppercase tracking-wider block mb-1.5">Açıklama Notu</span>
                                <p className="text-stone-200 text-xs leading-relaxed font-medium">
                                    {selectedMovement.description}
                                </p>
                                
                                {selectedMovement.z_details && (
                                    <div className="mt-4 pt-4 border-t border-stone-800/80 space-y-2.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-stone-400 flex items-center gap-1.5">🟢 <span>Hasılat Toplamı</span></span>
                                            <span className="text-emerald-400 font-bold">+ {formatCurrency(selectedMovement.z_details.hasilat)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-stone-400 flex items-center gap-1.5">🔴 <span>Kasadan Giderler</span></span>
                                            <span className="text-rose-400 font-bold">- {formatCurrency(selectedMovement.z_details.gider)}</span>
                                        </div>
                                        {selectedMovement.z_details.acikFazla !== 0 && (
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-stone-400 flex items-center gap-1.5">🟠 <span>Kasa {selectedMovement.z_details.acikFazlaTipi}</span></span>
                                                <span className={`${selectedMovement.z_details.acikFazla > 0 ? 'text-emerald-400' : 'text-rose-400'} font-bold`}>
                                                    {selectedMovement.z_details.acikFazla > 0 ? '+ ' : '- '}{formatCurrency(Math.abs(selectedMovement.z_details.acikFazla))}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-2.5 border-t border-stone-800/80 mt-2">
                                            <span className="text-stone-300 font-bold text-xs">Kasaya Giren NET Tutar</span>
                                            <span className="text-amber-400 font-black text-lg">
                                                {selectedMovement.z_details.net > 0 ? '+ ' : ''}{formatCurrency(selectedMovement.z_details.net)}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Action Buttons */}
                        <div className="mt-6 flex gap-3">
                            {selectedMovement.source_type === 'manual' ? (
                                <button 
                                    onClick={() => handleDeleteMovement(selectedMovement)}
                                    className="flex-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    🗑️ İşlemi Sil
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleRedirectToModule(selectedMovement)}
                                    className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
                                    title="Sistem tarafından otomatik oluşturulan işlemlerin kaynağına git"
                                >
                                    🔗 Kaynağa Git
                                </button>
                            )}
                            <button 
                                onClick={() => setSelectedMovement(null)}
                                className="flex-1 bg-stone-800 hover:bg-stone-700 text-white py-3 rounded-xl text-xs font-bold transition-colors"
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


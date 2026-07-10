'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency, formatDate } from "@/lib/format";

type Supplier = {
    id: string
    name: string
    contact_info: string
    phone?: string
    iban?: string
    address?: string
    total_debt: number
    created_at: string
}

type Transaction = {
    id: string
    transaction_date: string
    amount: number
    transaction_type: 'invoice' | 'payment'
    note: string
    created_at: string
}

type SupplierMovement = {
    id: string
    created_at: string
    quantity: number
    unit_price: number
    batch_id?: string
    document_url?: string
    materials: { name: string, unit: string }
}

type GroupedReceipt = {
    batchId: string | null
    date: string
    totalAmount: number
    totalItems: number
    documentUrl?: string
    items: SupplierMovement[]
}

export default function Tedarikciler() {
    const { showAlert, showConfirm } = useNotification()
    const [suppliers, setSuppliers] = useState<Supplier[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [groupedReceipts, setGroupedReceipts] = useState<GroupedReceipt[]>([])
    const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<'hareketler' | 'urunler' | 'bilgiler'>('hareketler')
    
    // Modal & Forms
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentAmount, setPaymentAmount] = useState('')
    const [paymentNote, setPaymentNote] = useState('')
    
    const [showAddModal, setShowAddModal] = useState(false)
    const [newSupplier, setNewSupplier] = useState({ name: '', contact_info: '' })

    // Finance / Accounts
    const [accounts, setAccounts] = useState<{id: string, name: string, type: string}[]>([])
    const [paymentAccountId, setPaymentAccountId] = useState<string>('')

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchSuppliers()
        fetchAccounts()
    }, [])

    const fetchAccounts = async () => {
        const { data } = await supabase.from('accounts').select('*').order('created_at')
        if (data && data.length > 0) {
            setAccounts(data)
            setPaymentAccountId(data[0].id)
        }
    }

    const fetchSuppliers = async () => {
        setLoading(true)
        const { data } = await supabase.from('suppliers').select('*').order('name')
        setSuppliers(data || [])
        setLoading(false)
    }

    const viewTransactions = async (supplier: Supplier) => {
        setSelectedSupplier(supplier)
        setActiveTab('hareketler')
        
        const [
            { data: trxData },
            { data: movData }
        ] = await Promise.all([
            supabase
                .from('supplier_transactions')
                .select('*')
                .eq('supplier_id', supplier.id)
                .order('transaction_date', { ascending: false })
                .order('created_at', { ascending: false }),
            supabase
                .from('stock_movements')
                .select('id, created_at, quantity, unit_price, batch_id, materials(name, unit)')
                .eq('supplier_id', supplier.id)
                .order('created_at', { ascending: false })
        ])
        
        setTransactions(trxData || [])
        
        // Group stock movements by batch_id or date
        const movs = movData || []
        const groups: Record<string, GroupedReceipt> = {}
        movs.forEach((item: any) => {
            const dateStr = item.created_at.split('T')[0]
            const key = item.batch_id || dateStr
            
            if (!groups[key]) {
                groups[key] = {
                    batchId: item.batch_id || null,
                    date: dateStr,
                    totalAmount: 0,
                    totalItems: 0,
                    documentUrl: undefined, // Document loaded on demand
                    items: []
                }
            }
            groups[key].items.push(item)
            groups[key].totalAmount += (item.quantity || 0) * (item.unit_price || 0)
            groups[key].totalItems += 1
        })
        
        const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setGroupedReceipts(sortedGroups)
    }

    const viewDocument = async (batchId: string | null) => {
        if (!batchId) {
            await showAlert('Bu işlem için ekli belge bulunamadı.', 'error')
            return
        }
        setLoading(true) // Loading gösterelim ki tıklandığı anlaşılsın
        const { data } = await supabase
            .from('stock_movements')
            .select('document_url')
            .eq('batch_id', batchId)
            .not('document_url', 'is', null)
            .limit(1)
            .single()
            
        setLoading(false)
        if (data?.document_url) {
            setPreviewUrl(data.document_url)
        } else {
            await showAlert('Veritabanında bu kayıt için herhangi bir fatura/fiş görseli bulunamadı.', 'error')
        }
    }

    const handlePayment = async () => {
        if (!selectedSupplier || !paymentAmount) return
        
        const amount = parseFloat(paymentAmount)
        if (amount <= 0) return

        try {
            const { error: rpcError } = await supabase.rpc('add_supplier_payment_transaction', {
                p_supplier_id: selectedSupplier.id,
                p_supplier_name: selectedSupplier.name,
                p_amount: amount,
                p_note: paymentNote || 'Manuel Ödeme',
                p_account_id: paymentAccountId || null
            })
            if (rpcError) throw rpcError

            const newDebt = parseFloat((selectedSupplier.total_debt || 0).toString()) - amount

            // UI Güncelle
            setShowPaymentModal(false)
            setPaymentAmount('')
            setPaymentNote('')
            fetchSuppliers()
            viewTransactions({ ...selectedSupplier, total_debt: newDebt })
            
            logActivity('Tedarikçi', 'EKLEME', `${selectedSupplier.name} firmasına ${amount} TL ödeme eklendi.`, { amount, note: paymentNote })
            await showAlert('Ödeme başarıyla kaydedildi!', 'success')
        } catch (error) {
            await showAlert('Hata oluştu', 'error')
        }
    }

    const handleDeleteTransaction = async (trx: Transaction) => {
        if (!selectedSupplier) return;
        
        let accountName = null;
        if (trx.transaction_type === 'payment') {
            const { data: mov } = await supabase.from('account_movements')
                .select('accounts(name)')
                .eq('source_type', 'supplier_payment')
                .eq('source_id', trx.id)
                .single();
            if (mov && mov.accounts) {
                accountName = (mov.accounts as any).name;
            }
        }
        
        let confirmMessage = `Emin misiniz?\n\n${formatDate(trx.transaction_date)} tarihli ve ${formatCurrency(trx.amount)} tutarındaki bu `;
        if (trx.transaction_type === 'invoice') {
            confirmMessage += `fatura işlemi silindiğinde:\n- ${selectedSupplier.name} bakiyesinden bu borç tutarı SİLİNECEK.`;
        } else {
            confirmMessage += `ödeme işlemi silindiğinde:\n- ${selectedSupplier.name} bakiyesine bu borç tutarı EKLENECEK.`;
            if (accountName) {
                confirmMessage += `\n- Bu ödeme için kasadan çıkan tutar, ${accountName} hesabınıza GERİ İADE EDİLECEK!`;
            } else {
                confirmMessage += `\n- (Uyarı: Bu işlem herhangi bir banka/kasa hesabına bağlı görünmüyor)`;
            }
        }
        confirmMessage += `\n\nBu işlem geri alınamaz!`;

        const confirmed = await showConfirm(confirmMessage, 'İşlemi Sil 🗑️');
        if (!confirmed) return;

        try {
            const { error: rpcError } = await supabase.rpc('delete_supplier_transaction', {
                p_transaction_id: trx.id
            });
            if (rpcError) throw rpcError;

            let debtChange = 0;
            if (trx.transaction_type === 'invoice') debtChange = -trx.amount;
            if (trx.transaction_type === 'payment') debtChange = trx.amount;

            const currentDebt = parseFloat((selectedSupplier.total_debt || 0).toString());
            const newDebt = currentDebt + debtChange;

            // 3. Ekranı Yenile
            fetchSuppliers();
            viewTransactions({ ...selectedSupplier, total_debt: newDebt });
            
            logActivity('Tedarikçi', 'SILME', `${selectedSupplier.name} firmasına ait ${trx.amount} TL tutarındaki cari işlem silindi.`, { transaction: trx })
            await showAlert('İşlem silindi ve bakiye güncellendi!', 'success');
        } catch (error) {
            await showAlert('Silme işlemi başarısız oldu.', 'error');
        }
    }

    const handleUpdateSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedSupplier) return;

        const formData = new FormData(e.currentTarget);
        const updates = {
            name: formData.get('name') as string,
            phone: formData.get('phone') as string,
            iban: formData.get('iban') as string,
            address: formData.get('address') as string,
            contact_info: formData.get('contact_info') as string
        };

        const changes = []
        if (selectedSupplier.name !== updates.name) changes.push(`İsim: ${selectedSupplier.name} -> ${updates.name}`)
        if (selectedSupplier.phone !== updates.phone) changes.push(`Tel: ${selectedSupplier.phone} -> ${updates.phone}`)
        if (selectedSupplier.iban !== updates.iban) changes.push(`IBAN: ${selectedSupplier.iban} -> ${updates.iban}`)
        if (selectedSupplier.address !== updates.address) changes.push(`Adres: ${selectedSupplier.address} -> ${updates.address}`)
        if (selectedSupplier.contact_info !== updates.contact_info) changes.push(`Yetkili: ${selectedSupplier.contact_info} -> ${updates.contact_info}`)

        const details = changes.length > 0 ? changes.join(', ') : 'Değişiklik yapılmadı'

        const { error } = await supabase.from('suppliers').update(updates).eq('id', selectedSupplier.id);
        
        if (error) {
            await showAlert('Güncellenirken hata oluştu.', 'error');
        } else {
            logActivity('Tedarikçi', 'GUNCELLEME', `${selectedSupplier.name} firmasının bilgileri güncellendi.`, { detay: details })
            await showAlert('Tedarikçi bilgileri başarıyla güncellendi!', 'success');
            fetchSuppliers();
            setSelectedSupplier({ ...selectedSupplier, ...updates } as Supplier);
        }
    }

    const handleAddSupplier = async () => {
        if (!newSupplier.name) return
        
        const { data, error } = await supabase.from('suppliers').insert({
            name: newSupplier.name,
            contact_info: newSupplier.contact_info,
            total_debt: 0
        }).select().single()

        if (error) {
            await showAlert('Hata oluştu', 'error')
            return
        }

        setShowAddModal(false)
        setNewSupplier({ name: '', contact_info: '' })
        fetchSuppliers()
        
        logActivity('Tedarikçi', 'EKLEME', `${newSupplier.name} isimli yeni tedarikçi sisteme eklendi.`)
        await showAlert('Tedarikçi başarıyla eklendi!', 'success')
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🏢</span>
                    <h1 className="font-bold text-amber-400">Tedarikçiler ve Cari Takip</h1>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                    + Yeni Tedarikçi
                </button>
            </header>

            <main className="p-6 max-w-7xl mx-auto flex flex-col md:flex-row gap-6">
                
                {/* Sol Panel: Tedarikçi Listesi */}
                <div className="flex-1 bg-stone-900 rounded-xl border border-stone-800 overflow-hidden flex flex-col min-h-[400px] h-auto md:h-[calc(100vh-120px)]">
                    <div className="p-4 border-b border-stone-800 flex justify-between items-center bg-stone-800/30">
                        <h2 className="font-bold text-stone-300">Tedarikçi Listesi</h2>
                        <span className="text-sm text-stone-400">Toplam Borç:{formatCurrency(suppliers.reduce((t, s) => t + parseFloat((s.total_debt || 0).toString()), 0))}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        {loading ? <p className="p-4 text-stone-400">Yükleniyor...</p> : (
                            <div className="overflow-x-auto w-full">
<table className="w-full">
                                <thead>
                                    <tr className="border-b border-stone-800 bg-stone-900">
                                        <th className="text-left px-4 py-3 text-stone-400 text-sm">Firma Adı</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm">Güncel Bakiye (Borç)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suppliers.length === 0 ? (
                                        <tr><td colSpan={2} className="text-center py-8 text-stone-500">Henüz tedarikçi yok. Fiş yükledikçe buraya eklenecektir.</td></tr>
                                    ) : suppliers.map(sup => (
                                        <tr 
                                            key={sup.id} 
                                            onClick={() => viewTransactions(sup)}
                                            className={`border-b border-stone-800 cursor-pointer transition-colors ${selectedSupplier?.id === sup.id ? 'bg-amber-500/10 border-amber-500/30' : 'hover:bg-stone-800'}`}
                                        >
                                            <td className="px-4 py-4 font-medium text-stone-300">{sup.name}</td>
                                            <td className={`px-4 py-4 text-right font-bold ${(sup.total_debt || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(parseFloat((sup.total_debt || 0).toString()))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
</div>
                        )}
                    </div>
                </div>

                {/* Sağ Panel: Hesap Hareketleri */}
                {selectedSupplier ? (
                    <div className="flex-[1.5] bg-stone-900 rounded-xl border border-stone-800 overflow-hidden flex flex-col min-h-[500px] h-auto md:h-[calc(100vh-120px)] mt-4 md:mt-0">
                        <div className="p-6 border-b border-stone-800 bg-stone-800/30 flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-bold text-amber-400 mb-1">{selectedSupplier.name}</h2>
                                <p className="text-stone-400 text-sm">Cari Hesap Hareketleri Dökümü</p>
                            </div>
                            <div className="text-right">
                                <p className="text-stone-400 text-sm mb-1">Kalan Borç</p>
                                <p className={`text-3xl font-bold ${(selectedSupplier.total_debt || 0) > 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(parseFloat((selectedSupplier.total_debt || 0).toString()))}
                                </p>
                            </div>
                        </div>

                        <div className="p-4 border-b border-stone-800 flex justify-between items-center bg-stone-900">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('hareketler')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'hareketler' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                                >
                                    Cari Hareketler
                                </button>
                                <button
                                    onClick={() => setActiveTab('urunler')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'urunler' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                                >
                                    Geçmiş Fişler
                                </button>
                                <button
                                    onClick={() => setActiveTab('bilgiler')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'bilgiler' ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                                >
                                    Tedarikçi Bilgileri
                                </button>
                            </div>
                            <button
                                onClick={() => setShowPaymentModal(true)}
                                className="bg-green-600 hover:bg-green-500 text-white font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm"
                            >
                                <span>💸</span> Ödeme Yap
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {activeTab === 'hareketler' && (
                                <div className="overflow-x-auto w-full">
<table className="w-full">
                                    <thead>
                                        <tr className="border-b border-stone-800 bg-stone-900 sticky top-0">
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm">Tarih</th>
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm">İşlem Türü</th>
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm">Açıklama</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Tutar</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transactions.length === 0 ? (
                                            <tr><td colSpan={5} className="text-center py-12 text-stone-500">Henüz hareket bulunmuyor.</td></tr>
                                        ) : transactions.map(trx => (
                                            <tr key={trx.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                                                <td className="px-4 py-3 text-stone-400 text-sm">
                                                    {formatDate(new Date(trx.transaction_date))}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {trx.transaction_type === 'invoice' ? (
                                                        <span className="inline-block bg-red-900/30 text-red-400 px-2 py-1 rounded text-xs font-bold border border-red-500/20 whitespace-nowrap">Fatura/Alış (+ Borç)</span>
                                                    ) : (
                                                        <span className="inline-block bg-green-900/30 text-green-400 px-2 py-1 rounded text-xs font-bold border border-green-500/20 whitespace-nowrap">Ödeme Yapıldı (- Borç)</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-stone-300 text-sm">{trx.note}</td>
                                                <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${trx.transaction_type === 'invoice' ? 'text-red-400' : 'text-green-400'}`}>
                                                    {trx.transaction_type === 'invoice' ? '+' : '-'}{formatCurrency(parseFloat(trx.amount.toString()))}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(trx); }}
                                                        className="text-red-500 hover:text-red-400 bg-red-950/40 hover:bg-red-900/60 px-3 py-1 rounded-lg text-xs font-bold transition-colors"
                                                    >
                                                        🗑️ Sil
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
</div>
                            )}

                            {activeTab === 'urunler' && (
                                <div className="space-y-3 p-4">
                                    {groupedReceipts.length === 0 ? (
                                        <div className="text-center py-12 text-stone-500">Henüz satın alınan ürün kaydı yok.</div>
                                    ) : groupedReceipts.map(group => {
                                        const isExpanded = expandedBatch === group.batchId || (!group.batchId && expandedBatch === group.date);
                                        const expandKey = group.batchId || group.date;
                                        
                                        return (
                                            <div key={expandKey} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                                                <div 
                                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-800/50 transition-colors cursor-pointer"
                                                    onClick={() => setExpandedBatch(isExpanded ? null : expandKey)}
                                                >
                                                    <div className="flex-1 text-left">
                                                        <h3 className="font-bold text-amber-400">{formatDate(new Date(group.date))}</h3>
                                                        <p className="text-sm text-stone-400 mt-1">
                                                            <span className="font-bold text-white">{group.totalItems}</span> kalem ürün
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <p className="text-xs text-stone-500 uppercase tracking-wider font-bold mb-1">Fiş Toplamı</p>
                                                            <p className="font-bold text-red-400">{formatCurrency(group.totalAmount)}</p>
                                                        </div>
                                                        {group.batchId && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); viewDocument(group.batchId); }}
                                                                className="bg-stone-800 hover:bg-stone-700 text-stone-300 p-2 rounded-lg text-sm flex items-center justify-center transition-colors border border-stone-700 active:scale-95 ml-2"
                                                                title="Belgeyi Gör"
                                                            >
                                                                🖼️
                                                            </button>
                                                        )}
                                                        <div className={`text-stone-500 p-2 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                            ▼
                                                        </div>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="border-t border-stone-800 bg-stone-950/50">
                                                        <div className="overflow-x-auto w-full">
<table className="w-full text-sm text-left">
                                                            <thead className="bg-stone-900/50 text-stone-400 border-b border-stone-800">
                                                                <tr>
                                                                    <th className="px-4 py-2 font-medium">Hammadde</th>
                                                                    <th className="px-4 py-2 font-medium text-right">Miktar</th>
                                                                    <th className="px-4 py-2 font-medium text-right">Birim Fiyat</th>
                                                                    <th className="px-4 py-2 font-medium text-right">Toplam</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-stone-800">
                                                                {group.items.map(item => {
                                                                    const total = (item.quantity || 0) * (item.unit_price || 0)
                                                                    return (
                                                                        <tr key={item.id} className="hover:bg-stone-900 transition-colors">
                                                                            <td className="px-4 py-2 font-medium text-stone-200">{item.materials?.name}</td>
                                                                            <td className="px-4 py-2 text-right">{item.quantity} {item.materials?.unit}</td>
                                                                            <td className="px-4 py-2 text-right text-stone-400">{formatCurrency(parseFloat((item.unit_price || 0).toString()))}</td>
                                                                            <td className="px-4 py-2 text-right font-bold text-red-400">{formatCurrency(total)}</td>
                                                                        </tr>
                                                                    )
                                                                })}
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

                            {activeTab === 'bilgiler' && (
                                <div className="p-6">
                                    <form onSubmit={handleUpdateSupplier} className="space-y-4 max-w-xl">
                                        <div>
                                            <label className="text-stone-400 text-sm mb-1 block">Firma / Tedarikçi Adı</label>
                                            <input name="name" defaultValue={selectedSupplier.name} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" required />
                                        </div>
                                        <div>
                                            <label className="text-stone-400 text-sm mb-1 block">Telefon Numarası</label>
                                            <input name="phone" defaultValue={selectedSupplier.phone || ''} placeholder="05XX XXX XX XX" className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
                                        </div>
                                        <div>
                                            <label className="text-stone-400 text-sm mb-1 block">IBAN</label>
                                            <input name="iban" defaultValue={selectedSupplier.iban || ''} placeholder="TRXX XXXX XXXX XXXX XXXX XXXX XX" className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:border-amber-400" />
                                        </div>
                                        <div>
                                            <label className="text-stone-400 text-sm mb-1 block">Adres</label>
                                            <textarea name="address" defaultValue={selectedSupplier.address || ''} rows={3} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
                                        </div>
                                        <div>
                                            <label className="text-stone-400 text-sm mb-1 block">Ekstra Notlar / İletişim Kişisi</label>
                                            <input name="contact_info" defaultValue={selectedSupplier.contact_info || ''} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400" />
                                        </div>
                                        <div className="pt-4 border-t border-stone-800">
                                            <button type="submit" className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-3 rounded-xl transition-colors">
                                                Bilgileri Güncelle
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-[1.5] bg-stone-900/50 rounded-xl border border-stone-800/50 flex flex-col items-center justify-center text-stone-500 h-[calc(100vh-120px)] border-dashed">
                        <div className="text-6xl mb-4 opacity-50">👈</div>
                        <p>Cari hareketlerini görmek için soldan bir tedarikçi seçin.</p>
                    </div>
                )}
            </main>

            {/* Ödeme Modalı */}
            {showPaymentModal && selectedSupplier && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-8 max-w-md w-full mx-auto">
                        <h3 className="text-2xl font-bold mb-2">Ödeme Gir</h3>
                        <p className="text-stone-400 mb-6">{selectedSupplier.name} firmasına yapılan ödemeyi kaydedin.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Ödenen Tutar (₺)</label>
                                <input
                                    type="number"
                                    value={paymentAmount}
                                    onChange={e => setPaymentAmount(e.target.value)}
                                    placeholder="Örn: 5000"
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-2xl font-bold text-green-400 focus:outline-none focus:border-green-400"
                                />
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Ödemenin Çıkacağı Hesap</label>
                                <select
                                    value={paymentAccountId}
                                    onChange={e => setPaymentAccountId(e.target.value)}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-400"
                                >
                                    <option value="">-- Hesap Seçin (Opsiyonel) --</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.type === 'cash' ? 'Nakit' : 'Banka'})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Açıklama / Not</label>
                                <input
                                    type="text"
                                    value={paymentNote}
                                    onChange={e => setPaymentNote(e.target.value)}
                                    placeholder="Örn: Elden nakit verildi veya Havale"
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-400"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={handlePayment}
                                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                            >
                                Ödemeyi Kaydet
                            </button>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl transition-colors"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Yeni Tedarikçi Modalı */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 w-full max-w-md mx-4">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-amber-400">Yeni Tedarikçi Ekle</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Tedarikçi/Firma Adı *</label>
                                <input
                                    value={newSupplier.name}
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="örn: Ahmet Tesisat, Güven Gıda..."
                                />
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">İletişim / Not (Opsiyonel)</label>
                                <input
                                    value={newSupplier.contact_info}
                                    onChange={e => setNewSupplier({ ...newSupplier, contact_info: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="Telefon veya adres..."
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleAddSupplier}
                            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-lg transition-colors"
                        >
                            Tedarikçiyi Kaydet
                        </button>
                    </div>
                </div>
            )}

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

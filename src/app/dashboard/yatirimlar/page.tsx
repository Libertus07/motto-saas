'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

type Account = {
    id: string
    name: string
    type: string
    balance: number
}

type Investment = {
    id: string
    asset_type: 'gold' | 'usd' | 'eur' | 'real_estate'
    name: string
    quantity: number
    average_cost: number
    current_manual_value?: number
    notes?: string
    purchase_date?: string
    document_url?: string
    created_at?: string
}

type Transaction = {
    id: string
    investment_id: string
    transaction_type: 'buy' | 'sell' | 'rent' | 'value_update'
    total_amount: number
    quantity_changed?: number
    notes?: string
    created_at?: string
}

type Rates = {
    gold: number
    usd: number
    eur: number
} | null

export default function YatirimlarPage() {
    const { showAlert, showConfirm } = useNotification()
    const [accounts, setAccounts] = useState<Account[]>([])
    const [investments, setInvestments] = useState<Investment[]>([])
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [rates, setRates] = useState<Rates>(null)
    const [loading, setLoading] = useState(true)

    // Grouping & Sorting States
    const [groupBy, setGroupBy] = useState<'type' | 'month'>('type')
    const [sortBy, setSortBy] = useState<'date' | 'value'>('date')
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
    
    // UI States
    const [expandedInvestment, setExpandedInvestment] = useState<string | null>(null)

    // Buy Modal States
    const [isBuyModalOpen, setIsBuyModalOpen] = useState(false)
    const [buyForm, setBuyForm] = useState({
        asset_type: 'gold' as 'gold'|'usd'|'eur'|'real_estate',
        quantity: '',
        price_per_unit: '', 
        account_id: '',
        notes: '',
        purchase_date: new Date().toISOString().split('T')[0],
        document_url: ''
    })
    
    // Rent Modal States
    const [isRentModalOpen, setIsRentModalOpen] = useState(false)
    const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null)
    const [rentForm, setRentForm] = useState({
        amount: '',
        account_id: ''
    })

    // Value Update Modal States
    const [isValueModalOpen, setIsValueModalOpen] = useState(false)
    const [valueForm, setValueForm] = useState({
        current_value: ''
    })

    // Edit Modal States
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editForm, setEditForm] = useState({
        name: '',
        quantity: '',
        average_cost: '',
        notes: '',
        purchase_date: '',
        document_url: ''
    })

    // Document Preview Modal State
    const [isDocModalOpen, setIsDocModalOpen] = useState(false)
    const [docPreviewUrl, setDocPreviewUrl] = useState('')

    // Note Preview Modal State
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
    const [notePreviewText, setNotePreviewText] = useState('')

    const [saving, setSaving] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        fetchData()
        fetchRates()
    }, [])

    const fetchRates = async () => {
        try {
            const res = await fetch('/api/exchange-rates')
            const data = await res.json()
            if (data.success) {
                setRates(data.rates)
            }
        } catch (error) {
            console.error('Kurlar çekilemedi', error)
        }
    }

    const fetchData = async () => {
        setLoading(true)
        const { data: invData } = await supabase.from('investments').select('*').order('created_at')
        setInvestments(invData || [])

        const { data: txData } = await supabase.from('investment_transactions').select('*').order('created_at', { ascending: false })
        setTransactions(txData || [])

        const { data: accData } = await supabase.from('accounts').select('*').order('created_at')
        if (accData) {
            setAccounts(accData)
            if (accData.length > 0) {
                setBuyForm(prev => ({ ...prev, account_id: accData[0].id }))
                setRentForm(prev => ({ ...prev, account_id: accData[0].id }))
            }
        }
        setLoading(false)
    }

    useEffect(() => {
        if (rates && buyForm.asset_type && buyForm.asset_type !== 'real_estate') {
            const assetType = buyForm.asset_type as 'gold' | 'usd' | 'eur';
            setBuyForm(prev => ({ ...prev, price_per_unit: rates[assetType].toString() }))
        }
    }, [buyForm.asset_type, rates])

    const handleAnalyzeReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 4 * 1024 * 1024) {
            await showAlert('Dosya çok büyük. Lütfen 4MB altı bir belge yükleyin.', 'warning')
            return
        }

        setIsAnalyzing(true)
        try {
            const fileExt = file.name.split('.').pop()?.toLowerCase()
            const reader = new FileReader()

            reader.onloadend = async (evt) => {
                try {
                    let payload: any = {}
                    let base64data = ''

                    if (fileExt === 'xlsx' || fileExt === 'xls') {
                        const data = new Uint8Array(evt.target?.result as ArrayBuffer)
                        const workbook = XLSX.read(data, { type: 'array' })
                        const firstSheetName = workbook.SheetNames[0]
                        const worksheet = workbook.Sheets[firstSheetName]
                        const json = XLSX.utils.sheet_to_json(worksheet)
                        payload = { fileText: JSON.stringify(json) }
                    } else {
                        base64data = reader.result as string
                        payload = { image: base64data }
                    }
                    
                    const response = await fetch('/api/analyze-investment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })

                    const data = await response.json()
                    if (data.error) throw new Error(data.error)

                    setBuyForm(prev => ({
                        ...prev,
                        asset_type: data.asset_type || prev.asset_type,
                        quantity: data.quantity ? data.quantity.toString() : prev.quantity,
                        price_per_unit: data.price_per_unit ? data.price_per_unit.toString() : prev.price_per_unit,
                        purchase_date: data.purchase_date || prev.purchase_date,
                        notes: data.notes || prev.notes,
                        document_url: base64data || ''
                    }))
                    await showAlert('Belge yapay zeka tarafından başarıyla okundu! Lütfen bilgileri kontrol edin.', 'success')
                    setIsBuyModalOpen(true)
                } catch (error: any) {
                    await showAlert('Hata: ' + error.message, 'error')
                } finally {
                    setIsAnalyzing(false)
                }
            }

            if (fileExt === 'xlsx' || fileExt === 'xls') {
                reader.readAsArrayBuffer(file)
            } else {
                reader.readAsDataURL(file)
            }
        } catch (error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            setIsAnalyzing(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, formSetter: any, formState: any) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                await showAlert('Dosya boyutu çok büyük! Maksimum 2MB yükleyebilirsiniz.', 'warning')
                return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
                formSetter({ ...formState, document_url: reader.result as string })
            }
            reader.readAsDataURL(file)
        }
    }

    const handleBuyInvestment = async (e: React.FormEvent) => {
        e.preventDefault()
        const isRE = buyForm.asset_type === 'real_estate'
        
        const qty = isRE ? 1 : parseFloat(buyForm.quantity)
        const price = parseFloat(buyForm.price_per_unit)
        const totalAmount = isRE ? price : (qty * price)

        if (!qty || !price || !buyForm.account_id) return
        setSaving(true)

        try {
            const selectedAcc = accounts.find(a => a.id === buyForm.account_id)
            if (!selectedAcc) throw new Error('Hesap bulunamadı.')

            let invId = ''
            const existingInv = isRE ? null : investments.find(i => i.asset_type === buyForm.asset_type)
            
            if (existingInv) {
                invId = existingInv.id
                const oldTotalCost = Number(existingInv.quantity) * Number(existingInv.average_cost)
                const newTotalCost = oldTotalCost + totalAmount
                const newQuantity = Number(existingInv.quantity) + qty
                const newAvgCost = newTotalCost / newQuantity

                await supabase.from('investments').update({
                    quantity: newQuantity,
                    average_cost: newAvgCost,
                    updated_at: new Date().toISOString(),
                    notes: existingInv.notes ? `${existingInv.notes}\n${buyForm.purchase_date}: ${buyForm.notes}` : buyForm.notes,
                    document_url: buyForm.document_url || existingInv.document_url,
                }).eq('id', invId)
            } else {
                let invName = 'Yatırım'
                if (buyForm.asset_type === 'gold') invName = 'Gram Altın'
                if (buyForm.asset_type === 'usd') invName = 'Amerikan Doları'
                if (buyForm.asset_type === 'eur') invName = 'Euro'
                if (buyForm.asset_type === 'real_estate') invName = 'Gayrimenkul Mülk'

                const { data: newInv, error: invError } = await supabase.from('investments').insert({
                    asset_type: buyForm.asset_type,
                    name: invName,
                    quantity: qty,
                    average_cost: price,
                    current_manual_value: isRE ? price : 0,
                    notes: buyForm.notes,
                    purchase_date: buyForm.purchase_date || new Date().toISOString().split('T')[0],
                    document_url: buyForm.document_url
                }).select().single()
                
                if (invError) throw invError
                invId = newInv.id
            }

            // Kasa hareketini ekle ve source_id olarak invId ata
            const { error: moveError } = await supabase.from('account_movements').insert({
                account_id: buyForm.account_id,
                movement_type: 'cikis',
                amount: totalAmount,
                description: `Yatırım Alımı: ${isRE ? 'Gayrimenkul' : `${qty} ${buyForm.asset_type.toUpperCase()}`} alındı.`,
                source_type: 'investment',
                source_id: invId
            })
            if (moveError) throw moveError

            await supabase.from('accounts').update({
                balance: selectedAcc.balance - totalAmount
            }).eq('id', buyForm.account_id)

            await supabase.from('investment_transactions').insert({
                investment_id: invId,
                transaction_type: 'buy',
                quantity: qty,
                price_per_unit: price,
                total_amount: totalAmount,
                account_id: buyForm.account_id
            })

            await logActivity('Yatırımlar', 'EKLEME', `Yeni Yatırım Alımı: ${isRE ? 'Gayrimenkul' : `${qty} birim ${buyForm.asset_type.toUpperCase()}`}`, {
                detay: `Tutar (₺${totalAmount}) | Fiyat (₺${price}) | Not (${buyForm.notes || '-'})`
            })

            await showAlert('Yatırım başarıyla eklendi!', 'success')
            setIsBuyModalOpen(false)
            setBuyForm({ 
                ...buyForm, 
                quantity: '', 
                price_per_unit: rates && !isRE ? rates[buyForm.asset_type as 'gold' | 'usd' | 'eur'].toString() : '',
                notes: '',
                document_url: ''
            })
            fetchData()

        } catch (error: any) {
            await showAlert('Hata: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleRentIncome = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedInvestment || !rentForm.amount || !rentForm.account_id) return
        setSaving(true)

        try {
            const amount = parseFloat(rentForm.amount)
            const selectedAcc = accounts.find(a => a.id === rentForm.account_id)
            if (!selectedAcc) throw new Error('Hesap bulunamadı.')

            await supabase.from('account_movements').insert({
                account_id: rentForm.account_id,
                movement_type: 'giris',
                amount: amount,
                description: `Gayrimenkul Kira Geliri Tahsilatı`,
                source_type: 'investment_rent'
            })

            await supabase.from('accounts').update({
                balance: selectedAcc.balance + amount
            }).eq('id', rentForm.account_id)

            await supabase.from('investment_transactions').insert({
                investment_id: selectedInvestment.id,
                transaction_type: 'rent',
                quantity: 1,
                price_per_unit: amount,
                total_amount: amount,
                account_id: rentForm.account_id
            })

            await logActivity('Yatırımlar', 'EKLEME', `Kira Tahsilatı: ${selectedInvestment.name}`, {
                detay: `Kira Bedeli (₺${amount}) | Tahsil Edilen Hesap (${selectedAcc.name})`
            })

            await showAlert('Kira başarıyla tahsil edildi!', 'success')
            setIsRentModalOpen(false)
            setRentForm({ ...rentForm, amount: '' })
            fetchData()

        } catch (error: any) {
            await showAlert('Hata: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleUpdateValue = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedInvestment || !valueForm.current_value) return
        setSaving(true)

        try {
            const newVal = parseFloat(valueForm.current_value)
            await supabase.from('investments').update({
                current_manual_value: newVal,
                updated_at: new Date().toISOString()
            }).eq('id', selectedInvestment.id)

            await logActivity('Yatırımlar', 'GUNCELLEME', `Değer Güncellemesi: ${selectedInvestment.name}`, {
                detay: `Yeni Değer (₺${newVal}) | Eski Değer (₺${selectedInvestment.current_manual_value || 0})`
            })

            await showAlert('Gayrimenkul değeri başarıyla güncellendi!', 'success')
            setIsValueModalOpen(false)
            setValueForm({ current_value: '' })
            fetchData()
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleEditInvestment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedInvestment) return
        setSaving(true)

        try {
            const qty = parseFloat(editForm.quantity)
            const cost = parseFloat(editForm.average_cost)

            await supabase.from('investments').update({
                name: editForm.name,
                quantity: qty,
                average_cost: cost,
                notes: editForm.notes,
                purchase_date: editForm.purchase_date,
                document_url: editForm.document_url,
                updated_at: new Date().toISOString()
            }).eq('id', selectedInvestment.id)

            const changes = []
            if (selectedInvestment.name !== editForm.name) changes.push(`İsim: ${selectedInvestment.name} -> ${editForm.name}`)
            if (selectedInvestment.quantity !== qty) changes.push(`Miktar: ${selectedInvestment.quantity} -> ${qty}`)
            if (selectedInvestment.average_cost !== cost) changes.push(`Maliyet: ₺${selectedInvestment.average_cost} -> ₺${cost}`)
            
            const details = changes.length > 0 ? changes.join(' | ') : 'Sadece diğer bilgiler güncellendi'

            await logActivity('Yatırımlar', 'GUNCELLEME', `Yatırım Düzenleme: ${editForm.name}`, {
                detay: details
            })

            await showAlert('Yatırım başarıyla güncellendi!', 'success')
            setIsEditModalOpen(false)
            fetchData()
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteInvestment = async (id: string) => {
        const confirmed = await showConfirm(
            'Bu yatırımı silmek istediğinize emin misiniz?\n\nBu işlem yatırımı cüzdanınızdan kaldıracak ve ödenen tüm tutarları kasalarınıza/bankanıza iade edecektir.',
            'Yatırımı Sil 🗑️'
        )
        if (!confirmed) return
        setLoading(true)
        try {
            // 1. Yatırıma bağlı tüm kasa hareketlerini (account_movements) bul
            const { data: movements, error: movGetError } = await supabase
                .from('account_movements')
                .select('*')
                .eq('source_type', 'investment')
                .eq('source_id', id)
            
            if (movGetError) {
                console.error("Kasa hareketleri bulunamadı:", movGetError)
            }

            // 2. Her bir kasa hareketi için bakiye iadesi yap
            if (movements && movements.length > 0) {
                for (const mov of movements) {
                    const { data: accData } = await supabase
                        .from('accounts')
                        .select('balance')
                        .eq('id', mov.account_id)
                        .single()
                    
                    if (accData) {
                        // Alım çıkış hareketiydi, iade için bakiyeyi arttırıyoruz
                        const newBalance = Number(accData.balance) + Number(mov.amount)
                        await supabase
                            .from('accounts')
                            .update({ balance: newBalance })
                            .eq('id', mov.account_id)
                    }
                    
                    // Kasa hareketini sil
                    await supabase.from('account_movements').delete().eq('id', mov.id)
                }
            }

            // 3. Yatırımı sil
            const invToDelete = investments.find(i => i.id === id)
            const { error: delError } = await supabase.from('investments').delete().eq('id', id)
            if (delError) throw delError
            
            let totalRefunded = 0
            if (movements && movements.length > 0) {
                totalRefunded = movements.reduce((acc, mov) => acc + Number(mov.amount), 0)
            }

            if (invToDelete) {
                await logActivity('Yatırımlar', 'SILME', `Yatırım Silindi (Bakiye İade Edildi): ${invToDelete.name}`, {
                    detay: `Silinen Varlık Tipi (${invToDelete.asset_type}) | Miktar (${invToDelete.quantity}) | Kasaya İade Edilen Toplam Tutar: ₺${totalRefunded.toFixed(2)}`
                })
            }

            await showAlert('Yatırım başarıyla silindi ve ilişkili ödemeler kasalarınıza iade edildi.', 'success')
            fetchData()
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            setLoading(false)
        }
    }

    const openEditModal = (inv: Investment) => {
        setSelectedInvestment(inv)
        setEditForm({
            name: inv.name,
            quantity: inv.quantity.toString(),
            average_cost: inv.average_cost.toString(),
            notes: inv.notes || '',
            purchase_date: inv.purchase_date || new Date().toISOString().split('T')[0],
            document_url: inv.document_url || ''
        })
        setIsEditModalOpen(true)
    }

    // --- DATA PROCESSING & GROUPING ---
    let totalCurrentValue = 0
    let totalCostValue = 0
    let totalRentIncome = 0

    const enhancedInvestments = investments.map(inv => {
        const isRE = inv.asset_type === 'real_estate'
        const currentRate = isRE ? 0 : (rates ? rates[inv.asset_type as keyof Rates] : inv.average_cost)
        
        const currentValue = isRE ? Number(inv.current_manual_value || 0) : (Number(inv.quantity) * currentRate)
        const costValue = Number(inv.quantity) * Number(inv.average_cost)
        
        const invRentIncome = transactions.filter(t => t.investment_id === inv.id && t.transaction_type === 'rent').reduce((t, tx) => t + Number(tx.total_amount), 0)
        
        const profit = (currentValue - costValue) + invRentIncome

        totalCostValue += costValue
        totalCurrentValue += currentValue
        
        return {
            ...inv,
            isRE,
            currentRate,
            currentValue,
            costValue,
            invRentIncome,
            profit,
            isProfit: profit >= 0
        }
    })

    transactions.forEach(tx => {
        if (tx.transaction_type === 'rent') {
            totalRentIncome += Number(tx.total_amount)
        }
    })

    const totalProfit = (totalCurrentValue - totalCostValue) + totalRentIncome
    const profitPercentage = totalCostValue > 0 ? (totalProfit / totalCostValue) * 100 : 0

    // Sorting
    enhancedInvestments.sort((a, b) => {
        if (sortBy === 'value') {
            return sortOrder === 'desc' ? b.currentValue - a.currentValue : a.currentValue - b.currentValue
        } else {
            const dateA = new Date(a.purchase_date || a.created_at || 0).getTime()
            const dateB = new Date(b.purchase_date || b.created_at || 0).getTime()
            return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
        }
    })

    // Grouping
    const groupedInvestments: Record<string, typeof enhancedInvestments> = {}
    enhancedInvestments.forEach(inv => {
        let groupKey = 'Diğer'
        if (groupBy === 'type') {
            if (inv.asset_type === 'gold') groupKey = 'Altın Yatırımları'
            else if (inv.asset_type === 'usd') groupKey = 'Dolar (USD)'
            else if (inv.asset_type === 'eur') groupKey = 'Euro (EUR)'
            else if (inv.asset_type === 'real_estate') groupKey = 'Gayrimenkul Mülkleri'
        } else {
            if (inv.purchase_date) {
                const d = new Date(inv.purchase_date)
                groupKey = d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
            } else {
                groupKey = 'Tarih Belirtilmeyenler'
            }
        }

        if (!groupedInvestments[groupKey]) groupedInvestments[groupKey] = []
        groupedInvestments[groupKey].push(inv)
    })

    const renderInvestmentList = (investmentList: any[]) => {
        return investmentList.map(inv => {
            const isExpanded = expandedInvestment === inv.id;
            const invTransactions = transactions.filter(t => t.investment_id === inv.id);

            return (
            <div key={inv.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                <div 
                    onClick={() => setExpandedInvestment(isExpanded ? null : inv.id)}
                    className="w-full px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-stone-800/30 transition-colors cursor-pointer gap-4"
                >
                    <div className="flex-1 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-center text-2xl shadow-inner shrink-0">
                            {inv.asset_type === 'gold' ? '🥇' : inv.asset_type === 'usd' ? '💵' : inv.asset_type === 'eur' ? '💶' : '🏠'}
                        </div>
                        <div>
                            <h4 className="font-bold text-stone-200 text-lg">{inv.name}</h4>
                            <p className="text-xs text-stone-500 mt-0.5">
                                {!inv.isRE && <span className="font-medium text-stone-400 mr-2">{inv.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {inv.asset_type === 'gold' ? 'Gram' : inv.asset_type === 'usd' ? 'USD' : 'EUR'}</span>}
                                {inv.purchase_date && <span>📅 {new Date(inv.purchase_date).toLocaleDateString('tr-TR')}</span>}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6 justify-between sm:justify-end w-full sm:w-auto pl-16 sm:pl-0">
                        <div className="text-left sm:text-right">
                            <p className="text-stone-400 text-xs font-bold mb-0.5">Güncel Değer</p>
                            <p className="text-lg font-bold text-white">₺{inv.currentValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                            <p className={`text-xs font-bold mt-0.5 ${inv.isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                {inv.isProfit ? 'Kâr: +' : 'Zarar: '}₺{inv.profit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                        
                        <div className={`text-stone-500 p-2 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="border-t border-stone-800 bg-stone-900/50">
                        
                        {/* Aksiyon Butonları Alanı */}
                        <div className="px-5 py-3 border-b border-stone-800 flex flex-wrap gap-2 items-center bg-stone-950/30">
                            {inv.isRE && (
                                <>
                                    <button onClick={() => { setSelectedInvestment(inv); setIsRentModalOpen(true); }} className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>💰</span> Kira Tahsil Et</button>
                                    <button onClick={() => { setSelectedInvestment(inv); setValueForm({ current_value: inv.current_manual_value?.toString() || '' }); setIsValueModalOpen(true); }} className="bg-stone-800 hover:bg-stone-700 text-white border border-stone-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📈</span> Değeri Güncelle</button>
                                </>
                            )}
                            {inv.notes && <button onClick={() => { setNotePreviewText(inv.notes!); setIsNoteModalOpen(true); }} className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📝</span> Notlar</button>}
                            {inv.document_url && <button onClick={() => { setDocPreviewUrl(inv.document_url!); setIsDocModalOpen(true); }} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📎</span> Belge</button>}
                            <button onClick={() => openEditModal(inv)} className="bg-stone-800 hover:bg-amber-500/20 text-stone-400 hover:text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>✏️</span> Düzenle</button>
                            <button onClick={() => handleDeleteInvestment(inv.id)} className="bg-stone-800 hover:bg-red-500/20 text-stone-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>🗑️</span> Sil</button>
                        </div>

                        {/* Tablo Alanı */}
                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-stone-800/30 text-stone-400 border-b border-stone-800">
                                    <tr>
                                        <th className="px-5 py-2.5 font-medium">İşlem Tarihi</th>
                                        <th className="px-5 py-2.5 font-medium">İşlem Türü</th>
                                        <th className="px-5 py-2.5 font-medium">Açıklama / Not</th>
                                        <th className="px-5 py-2.5 font-medium text-right">Tutar / Değer</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-800/50">
                                    {invTransactions.length === 0 ? (
                                        <tr><td colSpan={4} className="px-5 py-4 text-center text-stone-500">Bu yatırıma ait hiçbir hareket bulunamadı.</td></tr>
                                    ) : (
                                        invTransactions.map(tx => (
                                            <tr key={tx.id} className="hover:bg-stone-800/20 transition-colors">
                                                <td className="px-5 py-3 text-stone-400 whitespace-nowrap">
                                                    {tx.created_at ? new Date(tx.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                                        tx.transaction_type === 'buy' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        tx.transaction_type === 'rent' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                        tx.transaction_type === 'value_update' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                        'bg-stone-800 text-stone-400 border-stone-700'
                                                    }`}>
                                                        {tx.transaction_type === 'buy' ? 'İlk Alım' :
                                                         tx.transaction_type === 'rent' ? 'Kira Geliri' :
                                                         tx.transaction_type === 'value_update' ? 'Değer Güncellemesi' :
                                                         tx.transaction_type === 'sell' ? 'Satış' : 'İşlem'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-stone-300">
                                                    {tx.notes || '-'}
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-white whitespace-nowrap">
                                                    {tx.transaction_type === 'value_update' ? '' : (tx.transaction_type === 'buy' ? '-' : '+')}₺{tx.total_amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            )
        })
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="mb-8 p-6 pb-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-amber-500 flex items-center gap-3">
                        📈 Yatırımlar ve Portföy
                    </h1>
                    <p className="text-stone-400 mt-2 max-w-2xl">
                        İşletmenizin varlıklarını döviz, altın ve gayrimenkul olarak koruyun; anlık değerlerini ve kira getirilerini takip edin.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">

                    <button 
                        onClick={() => setIsBuyModalOpen(true)}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-3 rounded-xl transition-colors shadow-[0_0_20px_rgba(245,158,11,0.2)] whitespace-nowrap"
                    >
                        + Yeni Yatırım Yap
                    </button>
                </div>
            </header>

            <main className="p-6 pt-0 space-y-6">
                
                {/* Genel Özet Paneli */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">💰</div>
                        <p className="text-stone-400 text-sm mb-1 font-bold">Toplam Yatırım Maliyeti</p>
                        <h2 className="text-3xl font-bold text-white mb-2">
                            ₺{totalCostValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-xs text-stone-500">Ödediğiniz toplam anapara</p>
                    </div>
                    
                    <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">💎</div>
                        <p className="text-amber-500/80 text-sm mb-1 font-bold">Güncel Varlık Değeri</p>
                        <h2 className="text-3xl font-bold text-amber-500 mb-2">
                            ₺{totalCurrentValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </h2>
                        <p className="text-xs text-amber-500/50">Canlı kurlar ve ekspertiz değerleri</p>
                    </div>

                    <div className={`border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between ${totalProfit >= 0 ? 'bg-green-950/20 border-green-500/30' : 'bg-red-950/20 border-red-500/30'}`}>
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">📈</div>
                        <div>
                            <p className={`text-sm mb-1 font-bold ${totalProfit >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                Toplam Kâr / Zarar
                            </p>
                            <h2 className={`text-3xl font-bold mb-2 flex flex-wrap items-center gap-2 ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {totalProfit >= 0 ? '+' : ''}₺{totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                <span className="text-lg bg-black/20 px-2 py-1 rounded-lg">
                                    {totalProfit >= 0 ? '+' : ''}{profitPercentage.toFixed(2)}%
                                </span>
                            </h2>
                        </div>
                        {totalRentIncome > 0 && (
                            <p className={`text-xs mt-2 ${totalProfit >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                (Bu kâra ₺{totalRentIncome.toLocaleString('tr-TR')} toplam kira geliri dahildir)
                            </p>
                        )}
                    </div>
                </div>

                {/* Varlıklar Listesi & Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-8 mb-4 gap-4">
                    <h3 className="text-xl font-bold">Varlık Portföyünüz</h3>
                    
                    <div className="flex flex-wrap items-center gap-2 bg-stone-900 border border-stone-800 p-2 rounded-xl">
                        <select 
                            value={groupBy} 
                            onChange={e => setGroupBy(e.target.value as 'type'|'month')}
                            className="bg-stone-950 text-sm text-stone-300 font-medium border border-stone-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500"
                        >
                            <option value="type">Türüne Göre Grupla</option>
                            <option value="month">Ay/Yıla Göre Grupla</option>
                        </select>
                        
                        <select 
                            value={sortBy} 
                            onChange={e => setSortBy(e.target.value as 'date'|'value')}
                            className="bg-stone-950 text-sm text-stone-300 font-medium border border-stone-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500"
                        >
                            <option value="date">Tarihe Göre Sırala</option>
                            <option value="value">Değere Göre Sırala</option>
                        </select>
                        
                        <button 
                            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className="bg-stone-950 hover:bg-stone-800 text-stone-400 px-3 py-1.5 text-sm font-bold rounded-lg border border-stone-800 transition-colors flex items-center gap-1"
                            title={sortOrder === 'desc' ? 'Azalan Sıralama (Z-A, Yeni-Eski, Yüksek-Düşük)' : 'Artan Sıralama (A-Z, Eski-Yeni, Düşük-Yüksek)'}
                        >
                            {sortOrder === 'desc' ? '⬇️ Azalan' : '⬆️ Artan'}
                        </button>
                    </div>
                </div>

                <div className="space-y-3">
                    {loading ? (
                        <div className="text-stone-500 py-10 text-center">Yükleniyor...</div>
                    ) : Object.keys(groupedInvestments).length === 0 ? (
                        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-10 text-center text-stone-500">
                            Henüz bir yatırımınız bulunmuyor. "Yeni Yatırım Yap" butonuyla ilk varlığınızı ekleyebilirsiniz.
                        </div>
                    ) : (
                        Object.entries(groupedInvestments).map(([groupName, items], index) => {
                            const groupTotalValue = items.reduce((sum, i) => sum + i.currentValue, 0)
                            const groupTotalCost = items.reduce((sum, i) => sum + i.costValue, 0)
                            const groupTotalRent = items.reduce((sum, i) => sum + i.invRentIncome, 0)
                            const groupProfit = (groupTotalValue - groupTotalCost) + groupTotalRent
                            const isGroupProfit = groupProfit >= 0

                            return (
                                <details key={groupName} className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden" open={index === 0}>
                                    <summary className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 px-4 cursor-pointer hover:bg-stone-800/50 transition-colors list-none select-none">
                                        <div className="flex items-center gap-3">
                                            <span className="text-stone-500 transition-transform duration-300 group-open:rotate-90 text-sm">▶</span>
                                            <h4 className="text-base font-bold text-amber-500">{groupName} <span className="text-stone-500 text-xs ml-2 font-medium">({items.length} Kayıt)</span></h4>
                                        </div>
                                        <div className="flex items-center gap-6 mt-3 sm:mt-0 text-sm pl-7 sm:pl-0">
                                            <div>
                                                <span className="text-stone-500 mr-2 font-medium">Toplam Değer:</span>
                                                <span className="font-bold text-white">₺{groupTotalValue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className={`font-bold px-2 py-1 rounded-md ${isGroupProfit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                {isGroupProfit ? 'Kâr: +' : 'Zarar: '}₺{groupProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </summary>
                                    
                                    <div className="p-3 pt-0 border-t border-stone-800/50 bg-stone-950/30">
                                        {groupName === 'Gayrimenkul Mülkleri' || groupBy === 'month' ? (
                                            <div className="flex flex-col gap-2 mt-3">
                                                {renderInvestmentList(items)}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3 mt-3">
                                                {Object.entries(
                                                    items.reduce((acc, curr) => {
                                                        const dateStr = curr.purchase_date ? new Date(curr.purchase_date).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : 'Tarih Belirtilmeyenler'
                                                        if (!acc[dateStr]) acc[dateStr] = []
                                                        acc[dateStr].push(curr)
                                                        return acc
                                                    }, {} as Record<string, typeof items>)
                                                ).map(([monthName, monthItems]) => (
                                                    <details key={monthName} className="group/month bg-stone-900 border border-stone-800/50 rounded-lg overflow-hidden" open>
                                                        <summary className="flex items-center justify-between p-2 px-4 cursor-pointer hover:bg-stone-800/30 list-none select-none border-b border-stone-800/30">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-stone-600 transition-transform duration-300 group-open/month:rotate-90 text-xs">▶</span>
                                                                <h5 className="font-bold text-stone-300 text-sm">{monthName}</h5>
                                                                <span className="text-xs text-stone-500">({monthItems.length} kayıt)</span>
                                                            </div>
                                                        </summary>
                                                        <div className="p-2 pt-2 flex flex-col gap-2 bg-stone-950/20">
                                                            {renderInvestmentList(monthItems)}
                                                        </div>
                                                    </details>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </details>
                            )
                        })
                    )}
                </div>
            </main>

            {/* Yeni Yatırım Modal */}
            {isBuyModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">Yeni Yatırım Al</h3>
                            <button onClick={() => setIsBuyModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        
                        <form onSubmit={handleBuyInvestment} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Yatırım Aracı</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {['gold', 'usd', 'eur', 'real_estate'].map((type) => (
                                        <button 
                                            key={type}
                                            type="button"
                                            onClick={() => setBuyForm({...buyForm, asset_type: type as any})}
                                            className={`py-3 px-1 rounded-xl font-bold border flex flex-col items-center gap-1 transition-all ${buyForm.asset_type === type ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-stone-950 border-stone-800 text-stone-500 hover:border-stone-700 hover:text-stone-300'}`}
                                        >
                                            <span className="text-2xl">{type === 'gold' ? '🥇' : type === 'usd' ? '💵' : type === 'eur' ? '💶' : '🏠'}</span>
                                            <span className="text-[10px] uppercase">{type === 'gold' ? 'Gr Altın' : type === 'real_estate' ? 'Emlak' : type}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {buyForm.asset_type !== 'real_estate' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Miktar</label>
                                        <input 
                                            type="number"
                                            required
                                            step="0.0001"
                                            min="0.0001"
                                            value={buyForm.quantity}
                                            onChange={(e) => setBuyForm({...buyForm, quantity: e.target.value})}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 text-lg font-bold"
                                            placeholder={buyForm.asset_type === 'gold' ? "Örn: 10" : "Örn: 500"}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block text-amber-500/80">Alış Fiyatı (1 Birim - ₺)</label>
                                        <input 
                                            type="number"
                                            required
                                            step="0.0001"
                                            min="0.0001"
                                            value={buyForm.price_per_unit}
                                            onChange={(e) => setBuyForm({...buyForm, price_per_unit: e.target.value})}
                                            className="w-full bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400 text-lg font-bold"
                                            placeholder="Kuru girin..."
                                        />
                                        <p className="text-[10px] text-stone-500 mt-1">Canlı kur otomatik yansıdı, değiştirebilirsiniz.</p>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block text-amber-500/80">Gayrimenkul Toplam Maliyeti (₺)</label>
                                    <input 
                                        type="number"
                                        required
                                        step="1"
                                        min="1"
                                        value={buyForm.price_per_unit}
                                        onChange={(e) => setBuyForm({...buyForm, price_per_unit: e.target.value})}
                                        className="w-full bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400 text-lg font-bold"
                                        placeholder="Örn: 3000000"
                                    />
                                    <p className="text-[10px] text-stone-500 mt-1">Tapu masrafları dahil toplam cepten çıkan tutarı girin.</p>
                                </div>
                            )}

                            <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 flex justify-between items-center">
                                <span className="text-stone-400 font-bold">Ödenecek Toplam Tutar:</span>
                                <span className="text-xl font-bold text-red-400">
                                    ₺{((buyForm.asset_type === 'real_estate' ? 1 : (parseFloat(buyForm.quantity) || 0)) * (parseFloat(buyForm.price_per_unit) || 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>

                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Ödemenin Çıkacağı Hesap</label>
                                <select 
                                    required
                                    value={buyForm.account_id}
                                    onChange={(e) => setBuyForm({...buyForm, account_id: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 font-medium"
                                >
                                    <option value="" disabled>Hesap Seçin...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} (Bakiye: ₺{acc.balance.toLocaleString('tr-TR')})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-4 border-t border-stone-800 space-y-4 mt-2">
                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Alım/İşlem Tarihi</label>
                                    <input 
                                        type="date"
                                        value={buyForm.purchase_date}
                                        onChange={(e) => setBuyForm({...buyForm, purchase_date: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                                    />
                                </div>

                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Dekont / Belge Yükle (Opsiyonel)</label>
                                    <input 
                                        type="file"
                                        accept="image/*,application/pdf"
                                        onChange={(e) => handleFileUpload(e, setBuyForm, buyForm)}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-400 focus:outline-none focus:border-amber-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-500 file:text-stone-950 hover:file:bg-amber-400"
                                    />
                                    {buyForm.document_url && <p className="text-xs text-green-400 mt-2">✓ Belge eklendi</p>}
                                </div>

                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Açıklama / Notlar (Opsiyonel)</label>
                                    <textarea 
                                        rows={2}
                                        value={buyForm.notes}
                                        onChange={(e) => setBuyForm({...buyForm, notes: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 resize-none"
                                        placeholder="Ada, Parsel, Araç takası gibi notlar..."
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !buyForm.price_per_unit || !buyForm.account_id || (buyForm.asset_type !== 'real_estate' && !buyForm.quantity)}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                            >
                                {saving ? 'İşleniyor...' : 'Yatırımı Onayla ve Hesaptan Düş'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Yatırımı Düzenle Modal */}
            {isEditModalOpen && selectedInvestment && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><span>✏️</span> Yatırımı Düzenle</h3>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        
                        <form onSubmit={handleEditInvestment} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Yatırım Adı</label>
                                <input 
                                    type="text"
                                    required
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {selectedInvestment.asset_type !== 'real_estate' && (
                                    <div>
                                        <label className="text-stone-400 text-sm mb-1 block">Miktar</label>
                                        <input 
                                            type="number"
                                            required
                                            step="0.0001"
                                            min="0"
                                            value={editForm.quantity}
                                            onChange={(e) => setEditForm({...editForm, quantity: e.target.value})}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                                        />
                                    </div>
                                )}
                                
                                <div className={selectedInvestment.asset_type === 'real_estate' ? 'col-span-2' : ''}>
                                    <label className="text-stone-400 text-sm mb-1 block">{selectedInvestment.asset_type === 'real_estate' ? 'Toplam Alış Maliyeti' : 'Ortalama Maliyet (₺)'}</label>
                                    <input 
                                        type="number"
                                        required
                                        step="0.0001"
                                        min="0"
                                        value={editForm.average_cost}
                                        onChange={(e) => setEditForm({...editForm, average_cost: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-stone-800 space-y-4">
                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Alım Tarihi</label>
                                    <input 
                                        type="date"
                                        value={editForm.purchase_date}
                                        onChange={(e) => setEditForm({...editForm, purchase_date: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                                    />
                                </div>

                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Belge Güncelle</label>
                                    <input 
                                        type="file"
                                        accept="image/*,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                        onChange={(e) => handleFileUpload(e, setEditForm, editForm)}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-400 focus:outline-none focus:border-amber-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-500 file:text-stone-950 hover:file:bg-amber-400"
                                    />
                                    {editForm.document_url && !editForm.document_url.startsWith('data:') && (
                                        <p className="text-xs text-amber-500 mt-2">Mevcut bir belge yüklü.</p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-stone-400 text-sm mb-1 block">Açıklama / Notlar</label>
                                    <textarea 
                                        rows={3}
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 resize-none"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4"
                            >
                                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Document Preview Modal */}
            {isDocModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[60] p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center p-4 border-b border-stone-800">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2"><span>📎</span> Belge Görüntüleyici</h3>
                            <button onClick={() => setIsDocModalOpen(false)} className="text-stone-500 hover:text-white text-2xl px-2">✕</button>
                        </div>
                        <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-stone-950/50">
                            {docPreviewUrl.startsWith('data:application/pdf') ? (
                                <iframe src={docPreviewUrl} className="w-full h-[70vh] rounded-lg bg-white" />
                            ) : (
                                <img src={docPreviewUrl} alt="Belge" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg" />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Note Preview Modal */}
            {isNoteModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
                        <div className="flex justify-between items-center p-6 border-b border-stone-800">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><span>📝</span> Yatırım Notları</h3>
                            <button onClick={() => setIsNoteModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        <div className="p-6 overflow-auto max-h-[60vh]">
                            <p className="text-stone-300 leading-relaxed whitespace-pre-wrap">{notePreviewText}</p>
                        </div>
                        <div className="p-6 border-t border-stone-800 flex justify-end">
                            <button onClick={() => setIsNoteModalOpen(false)} className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-2 rounded-xl font-bold transition-colors">Kapat</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kira Tahsil Et Modalı */}
            {isRentModalOpen && selectedInvestment && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">💰 Kira Tahsil Et</h3>
                            <button onClick={() => setIsRentModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        <p className="text-stone-400 text-sm mb-4">
                            {selectedInvestment.name} için aldığınız kira ödemesini girin. Bu tutar işletmenizin nakit akışına (hesap bakiyesine) dahil edilecektir.
                        </p>
                        
                        <form onSubmit={handleRentIncome} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block text-green-500/80">Kira Tutarı (₺)</label>
                                <input 
                                    type="number"
                                    required
                                    step="1"
                                    min="1"
                                    value={rentForm.amount}
                                    onChange={(e) => setRentForm({...rentForm, amount: e.target.value})}
                                    className="w-full bg-green-500/5 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 focus:outline-none focus:border-green-400 text-xl font-bold"
                                    placeholder="Örn: 15000"
                                />
                            </div>
                            
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Kiranın Yattığı Hesap (Giriş)</label>
                                <select 
                                    required
                                    value={rentForm.account_id}
                                    onChange={(e) => setRentForm({...rentForm, account_id: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-400 font-medium"
                                >
                                    <option value="" disabled>Hesap Seçin...</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} (Bakiye: ₺{acc.balance.toLocaleString('tr-TR')})</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !rentForm.amount || !rentForm.account_id}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                            >
                                {saving ? 'İşleniyor...' : 'Kirayı Hesaba Ekle'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Gayrimenkul Değeri Güncelle Modalı */}
            {isValueModalOpen && selectedInvestment && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-white">📈 Güncel Değeri Belirle</h3>
                            <button onClick={() => setIsValueModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>
                        <p className="text-stone-400 text-sm mb-4">
                            {selectedInvestment.name} mülkünün güncel emlak piyasası/ekspertiz değerini güncelleyin. Kâr/Zarar hesabınız buna göre şekillenecektir.
                        </p>
                        
                        <form onSubmit={handleUpdateValue} className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Yeni Ekspertiz / Piyasa Değeri (₺)</label>
                                <input 
                                    type="number"
                                    required
                                    step="1"
                                    min="1"
                                    value={valueForm.current_value}
                                    onChange={(e) => setValueForm({...valueForm, current_value: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 text-xl font-bold"
                                    placeholder="Örn: 4500000"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={saving || !valueForm.current_value}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                            >
                                {saving ? 'İşleniyor...' : 'Değeri Güncelle'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

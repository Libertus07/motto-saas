import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devError } from '@/lib/debug'
import { Investment, InvestmentTransaction } from '@/types/database'
import { Account, Rates, BuyFormState, EditFormState, RentFormState, ValueFormState } from '../types'
import { deleteInvestmentTransactionWithRefund } from '@/lib/investment-transactions'

export function useInvestmentsData() {
    const { showAlert, showConfirm } = useNotification()
    const supabase = createClient()

    const [accounts, setAccounts] = useState<Account[]>([])
    const [investments, setInvestments] = useState<Investment[]>([])
    const [transactions, setTransactions] = useState<InvestmentTransaction[]>([])
    const [rates, setRates] = useState<Rates>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const fetchRates = useCallback(async () => {
        try {
            const res = await fetch('/api/exchange-rates')
            const data = await res.json()
            if (data.success) {
                setRates(data.rates)
            }
        } catch (error) {
            devError('Kurlar çekilemedi', error)
        }
    }, [])

    const fetchData = useCallback(async () => {
        setLoading(true)
        const { data: invData } = await supabase.from('investments').select('*').order('created_at')
        setInvestments(invData || [])

        const { data: txData } = await supabase.from('investment_transactions').select('*').order('created_at', { ascending: false })
        setTransactions(txData || [])

        const { data: accData } = await supabase.from('accounts').select('*').order('created_at')
        if (accData) {
            setAccounts(accData)
        }
        setLoading(false)
    }, [supabase])

    useEffect(() => {
        fetchData()
        fetchRates()
    }, [fetchData, fetchRates])

    const deleteInvestment = async (id: string) => {
        const confirmed = await showConfirm(
            'Bu yatırımı silmek istediğinize emin misiniz?\n\nBu işlem yatırımı cüzdanınızdan kaldıracak ve ödenen tüm tutarları kasalarınıza/bankanıza iade edecektir.',
            'Yatırımı Sil 🗑️'
        )
        if (!confirmed) return false

        setLoading(true)
        try {
            const buyTransactions = transactions.filter(
                tx => tx.investment_id === id && tx.transaction_type === 'buy'
            )

            if (buyTransactions.length === 0) {
                throw new Error('Bu yatırıma bağlı alım işlemi bulunamadı.')
            }

            let totalRefunded = 0
            for (const transaction of buyTransactions) {
                const result = await deleteInvestmentTransactionWithRefund(supabase, transaction.id)
                totalRefunded += result.refundedAmount
            }

            const invToDelete = investments.find(i => i.id === id)
            const { data: remainingInvestment, error: remainingInvestmentError } = await supabase
                .from('investments')
                .select('id')
                .eq('id', id)
                .maybeSingle()

            if (remainingInvestmentError) throw remainingInvestmentError

            if (remainingInvestment) {
                const { error: deleteInvestmentError } = await supabase
                    .from('investments')
                    .delete()
                    .eq('id', id)
                if (deleteInvestmentError) throw deleteInvestmentError
            }

            if (invToDelete) {
                await logActivity('Yatırımlar', 'SILME', `Yatırım Silindi (Bakiye İade Edildi): ${invToDelete.name}`, {
                    detay: `Silinen Varlık Tipi (${invToDelete.asset_type}) | Miktar (${invToDelete.quantity}) | Kasaya İade Edilen Toplam Tutar: ₺${totalRefunded.toFixed(2)}`
                })
            }

            await showAlert('Yatırım başarıyla silindi ve ilişkili ödemeler kasalarınıza iade edildi.', 'success')
            fetchData()
            return true
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            setLoading(false)
            return false
        }
    }

    const buyInvestment = async (form: BuyFormState) => {
        const isRE = form.asset_type === 'real_estate'
        const qty = isRE ? 1 : parseFloat(form.quantity)
        const price = parseFloat(form.price_per_unit)
        const totalAmount = isRE ? price : (qty * price)

        if (!qty || !price || !form.account_id) return false
        setSaving(true)

        try {
            const selectedAcc = accounts.find(a => a.id === form.account_id)
            if (!selectedAcc) throw new Error('Hesap bulunamadı.')

            let invName = 'Yatırım'
            if (form.asset_type === 'gold') invName = 'Gram Altın'
            if (form.asset_type === 'usd') invName = 'Amerikan Doları'
            if (form.asset_type === 'eur') invName = 'Euro'
            if (form.asset_type === 'real_estate') invName = 'Gayrimenkul Mülk'

            const { error: rpcError } = await supabase.rpc('buy_investment_transaction', {
                p_asset_type: form.asset_type,
                p_name: invName,
                p_quantity: qty,
                p_price: price,
                p_account_id: form.account_id,
                p_notes: form.notes || null,
                p_purchase_date: form.purchase_date || new Date().toISOString().split('T')[0],
                p_document_url: form.document_url || null
            });

            if (rpcError) throw rpcError;

            await logActivity('Yatırımlar', 'EKLEME', `Yeni Yatırım Alımı: ${isRE ? 'Gayrimenkul' : `${qty} birim ${form.asset_type.toUpperCase()}`}`, {
                detay: `Tutar (₺${totalAmount}) | Fiyat (₺${price}) | Not (${form.notes || '-'})`
            })

            await showAlert('Yatırım başarıyla eklendi!', 'success')
            fetchData()
            return true
        } catch (error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            return false
        } finally {
            setSaving(false)
        }
    }

    const editInvestment = async (investmentId: string, form: EditFormState, originalInvestment: Investment) => {
        setSaving(true)
        try {
            const qty = parseFloat(form.quantity)
            const cost = parseFloat(form.average_cost)

            await supabase.from('investments').update({
                name: form.name,
                quantity: qty,
                average_cost: cost,
                notes: form.notes,
                purchase_date: form.purchase_date,
                document_url: form.document_url,
                updated_at: new Date().toISOString()
            }).eq('id', investmentId)

            const changes = []
            if (originalInvestment.name !== form.name) changes.push(`İsim: ${originalInvestment.name} -> ${form.name}`)
            if (originalInvestment.quantity !== qty) changes.push(`Miktar: ${originalInvestment.quantity} -> ${qty}`)
            if (originalInvestment.average_cost !== cost) changes.push(`Maliyet: ₺${originalInvestment.average_cost} -> ₺${cost}`)
            
            const details = changes.length > 0 ? changes.join(' | ') : 'Sadece diğer bilgiler güncellendi'

            await logActivity('Yatırımlar', 'GUNCELLEME', `Yatırım Düzenleme: ${form.name}`, {
                detay: details
            })

            await showAlert('Yatırım başarıyla güncellendi!', 'success')
            fetchData()
            return true
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            return false
        } finally {
            setSaving(false)
        }
    }

    const collectRent = async (investmentId: string, investmentName: string, form: RentFormState) => {
        setSaving(true)
        try {
            const amount = parseFloat(form.amount)
            const selectedAcc = accounts.find(a => a.id === form.account_id)
            if (!selectedAcc) throw new Error('Hesap bulunamadı.')

            const { error } = await supabase.rpc('process_investment_rent', {
                p_investment_id: investmentId,
                p_account_id: form.account_id,
                p_amount: amount
            })

            if (error) throw new Error(error.message)

            await logActivity('Yatırımlar', 'EKLEME', `Kira Tahsilatı: ${investmentName}`, {
                detay: `Kira Bedeli (₺${amount}) | Tahsil Edilen Hesap (${selectedAcc.name})`
            })

            await showAlert('Kira başarıyla tahsil edildi!', 'success')
            fetchData()
            return true
        } catch (error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            return false
        } finally {
            setSaving(false)
        }
    }

    const updateValue = async (investmentId: string, investmentName: string, form: ValueFormState, oldManualValue: number) => {
        setSaving(true)
        try {
            const newVal = parseFloat(form.current_value)
            await supabase.from('investments').update({
                current_manual_value: newVal,
                updated_at: new Date().toISOString()
            }).eq('id', investmentId)

            await logActivity('Yatırımlar', 'GUNCELLEME', `Değer Güncellemesi: ${investmentName}`, {
                detay: `Yeni Değer (₺${newVal}) | Eski Değer (₺${oldManualValue})`
            })

            await showAlert('Gayrimenkul değeri başarıyla güncellendi!', 'success')
            fetchData()
            return true
        } catch(error: any) {
            await showAlert('Hata: ' + error.message, 'error')
            return false
        } finally {
            setSaving(false)
        }
    }

    return {
        accounts,
        investments,
        transactions,
        rates,
        loading,
        saving,
        fetchData,
        deleteInvestment,
        buyInvestment,
        editInvestment,
        collectRent,
        updateValue
    }
}

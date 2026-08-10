import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useNotification } from '@/components/NotificationProvider'
import { devError } from '@/lib/debug'
import { Investment, InvestmentTransaction } from '@/types/database'
import { Account, Rates, BuyFormState, EditFormState, RentFormState, ValueFormState } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { persistWithOrganizationDocument } from '../../documents/document-storage-service'

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Bilinmeyen hata'

export function useInvestmentsData() {
  const { showAlert, showConfirm } = useNotification()
  const { activeOrg } = useOrganization()
  const supabase = useMemo(() => createClient(), [])
  const activeOrganizationIdRef = useRef(activeOrg?.id)

  useEffect(() => {
    activeOrganizationIdRef.current = activeOrg?.id
    return () => {
      activeOrganizationIdRef.current = undefined
    }
  }, [activeOrg?.id])

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
    if (!activeOrg) return
    const requestedOrganizationId = activeOrg.id
    setLoading(true)
    const { data: invData } = await supabase
      .from('investments')
      .select('*')
      .eq('organization_id', activeOrg.id)
      .order('created_at')
    if (activeOrganizationIdRef.current !== requestedOrganizationId) return
    setInvestments(invData || [])

    const { data: txData } = await supabase
      .from('investment_transactions')
      .select('*')
      .eq('organization_id', activeOrg.id)
      .order('created_at', { ascending: false })
    if (activeOrganizationIdRef.current !== requestedOrganizationId) return
    setTransactions(txData || [])

    const { data: accData } = await supabase
      .from('accounts')
      .select('*')
      .eq('organization_id', activeOrg.id)
      .order('created_at')
    if (activeOrganizationIdRef.current !== requestedOrganizationId) return
    if (accData) {
      setAccounts(accData)
    }
    setLoading(false)
  }, [supabase, activeOrg])

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchData()
      fetchRates()
    }, 0)
    return () => clearTimeout(id)
  }, [fetchData, fetchRates])

  const deleteInvestment = async (id: string) => {
    const confirmed = await showConfirm(
      'Bu yatırımı silmek istediğinize emin misiniz?\n\nBu işlem yatırımı cüzdanınızdan kaldıracak ve ödenen tüm tutarları kasalarınıza/bankanıza iade edecektir.',
      'Yatırımı Sil 🗑️',
    )
    if (!confirmed) return false

    setLoading(true)
    try {
      if (!activeOrg?.id) throw new Error('Aktif organizasyon bulunamadı.')
      const { error } = await supabase.rpc('delete_investment_with_refund', {
        p_investment_id: id,
        p_organization_id: activeOrg.id,
      })
      if (error) throw error

      await showAlert('Yatırım başarıyla silindi ve ilişkili ödemeler kasalarınıza iade edildi.', 'success')
      await fetchData()
      return true
    } catch (error: unknown) {
      await showAlert('Hata: ' + getErrorMessage(error), 'error')
      setLoading(false)
      return false
    }
  }

  const buyInvestment = async (form: BuyFormState) => {
    const isRE = form.asset_type === 'real_estate'
    const qty = isRE ? 1 : parseFloat(form.quantity)
    const price = parseFloat(form.price_per_unit)

    if (!qty || !price || !form.account_id) return false
    setSaving(true)

    try {
      if (!activeOrg?.id) throw new Error('Aktif organizasyon bulunamadı.')
      if (form.document_file && form.document_organization_id !== activeOrg.id) {
        throw new Error('Belge farklı bir işletme için hazırlandı.')
      }
      const selectedAcc = accounts.find((a) => a.id === form.account_id)
      if (!selectedAcc) throw new Error('Hesap bulunamadı.')

      let invName = 'Yatırım'
      if (form.asset_type === 'gold') invName = 'Gram Altın'
      if (form.asset_type === 'usd') invName = 'Amerikan Doları'
      if (form.asset_type === 'eur') invName = 'Euro'
      if (form.asset_type === 'real_estate') invName = 'Gayrimenkul Mülk'

      await persistWithOrganizationDocument(
        supabase,
        form.document_file
          ? {
              organizationId: activeOrg.id,
              bucket: 'motto_assets',
              kind: 'investment-document',
              file: form.document_file,
            }
          : null,
        form.document_url || null,
        async (documentReference) => {
          const { error: rpcError } = await supabase.rpc('buy_investment_transaction', {
            p_asset_type: form.asset_type,
            p_name: invName,
            p_quantity: qty,
            p_price: price,
            p_account_id: form.account_id,
            p_notes: form.notes || null,
            p_purchase_date: form.purchase_date || new Date().toISOString().split('T')[0],
            p_document_url: documentReference,
            p_organization_id: activeOrg.id,
          })

          if (rpcError) throw rpcError
        },
      )

      await showAlert('Yatırım başarıyla eklendi!', 'success')
      fetchData()
      return true
    } catch (error: unknown) {
      devError('Yatırım kaydedilemedi.', error)
      await showAlert('Yatırım kaydedilemedi. Lütfen tekrar deneyin.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const editInvestment = async (investmentId: string, form: EditFormState) => {
    setSaving(true)
    try {
      const qty = parseFloat(form.quantity)
      const cost = parseFloat(form.average_cost)

      if (!activeOrg?.id) throw new Error('Aktif organizasyon bulunamadı.')
      if (form.document_file && form.document_organization_id !== activeOrg.id) {
        throw new Error('Belge farklı bir işletme için hazırlandı.')
      }
      await persistWithOrganizationDocument(
        supabase,
        form.document_file
          ? {
              organizationId: activeOrg.id,
              bucket: 'motto_assets',
              kind: 'investment-document',
              file: form.document_file,
            }
          : null,
        form.document_url || null,
        async (documentReference) => {
          const { error: updateError } = await supabase.rpc('update_investment', {
            p_investment_id: investmentId,
            p_organization_id: activeOrg.id,
            p_name: form.name,
            p_quantity: qty,
            p_average_cost: cost,
            p_notes: form.notes || null,
            p_purchase_date: form.purchase_date || null,
            p_document_url: documentReference,
          })
          if (updateError) throw updateError
        },
      )

      await showAlert('Yatırım başarıyla güncellendi!', 'success')
      await fetchData()
      return true
    } catch (error: unknown) {
      devError('Yatırım güncellenemedi.', error)
      await showAlert('Yatırım güncellenemedi. Lütfen tekrar deneyin.', 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const collectRent = async (investmentId: string, form: RentFormState) => {
    setSaving(true)
    try {
      const amount = parseFloat(form.amount)
      if (!accounts.some((account) => account.id === form.account_id)) throw new Error('Hesap bulunamadı.')

      const { error } = await supabase.rpc('process_investment_rent', {
        p_investment_id: investmentId,
        p_account_id: form.account_id,
        p_amount: amount,
        p_organization_id: activeOrg?.id,
      })

      if (error) throw new Error(error.message)

      await showAlert('Kira başarıyla tahsil edildi!', 'success')
      await fetchData()
      return true
    } catch (error: unknown) {
      await showAlert('Hata: ' + getErrorMessage(error), 'error')
      return false
    } finally {
      setSaving(false)
    }
  }

  const updateValue = async (investmentId: string, form: ValueFormState) => {
    setSaving(true)
    try {
      const newVal = parseFloat(form.current_value)
      if (!activeOrg?.id) throw new Error('Aktif organizasyon bulunamadı.')
      const { error: updateError } = await supabase.rpc('update_investment_value', {
        p_investment_id: investmentId,
        p_organization_id: activeOrg.id,
        p_current_value: newVal,
      })
      if (updateError) throw updateError

      await showAlert('Gayrimenkul değeri başarıyla güncellendi!', 'success')
      await fetchData()
      return true
    } catch (error: unknown) {
      await showAlert('Hata: ' + getErrorMessage(error), 'error')
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
    activeOrganizationId: activeOrg?.id,
    loading,
    saving,
    fetchData,
    deleteInvestment,
    buyInvestment,
    editInvestment,
    collectRent,
    updateValue,
  }
}

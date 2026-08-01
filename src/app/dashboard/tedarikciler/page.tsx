'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { DocumentPreviewModal } from '@/components/DocumentPreviewModal'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { useOrganization } from '@/context/OrganizationContext'
import { formatCurrency, formatDate } from '@/lib/format'
import { useAppTour } from '@/hooks/useAppTour'

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
  batch_id?: string | null
}

type SupplierMovement = {
  id: string
  created_at: string
  quantity: number
  unit_price: number
  batch_id?: string
  document_url?: string
  materials: { name: string; unit: string }
}

type GroupedReceipt = {
  batchId: string | null
  date: string
  totalAmount: number
  totalItems: number
  documentUrl?: string
  items: SupplierMovement[]
}

type AccountNameResult = { name: string } | { name: string }[]

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Bilinmeyen hata'

export default function Tedarikciler() {
  useAppTour('tedarikciler', [
    {
      element: '#tour-suppliers-create',
      popover: {
        title: 'Tedarikçi kartı açın',
        description: 'Firma, yetkili ve iletişim bilgisini ekleyerek cari takibi bu noktadan başlatın.',
      },
    },
    {
      element: '#tour-suppliers-list',
      popover: {
        title: 'Cari hesabı inceleyin',
        description: 'Firmayı arayın, seçin ve alış–ödeme hareketlerini sağ panelde detaylandırın.',
      },
    },
    {
      element: '#tour-suppliers-kpis',
      popover: {
        title: 'Ödeme önceliklerini görün',
        description: 'Toplam borç ve borçlu firma sayısı, nakit planlaması için hızlı bir özet sunar.',
      },
    },
  ])
  const { showAlert, showConfirm } = useNotification()
  const { activeOrg } = useOrganization()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [groupedReceipts, setGroupedReceipts] = useState<GroupedReceipt[]>([])
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'hareketler' | 'urunler' | 'bilgiler'>('hareketler')
  const [supplierSearch, setSupplierSearch] = useState('')

  // Modal & Forms
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')

  const [showAddModal, setShowAddModal] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ name: '', contact_info: '' })

  // Finance / Accounts
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string }[]>([])
  const [paymentAccountId, setPaymentAccountId] = useState<string>('')

  const supabase = useMemo(() => createClient(), [])

  const fetchAccounts = useCallback(async () => {
    if (!activeOrg) return
    const { data } = await supabase.from('accounts').select('*').eq('organization_id', activeOrg.id).order('created_at')
    if (data && data.length > 0) {
      setAccounts(data)
      setPaymentAccountId(data[0].id)
    }
  }, [activeOrg, supabase])

  const fetchSuppliers = useCallback(async () => {
    if (!activeOrg) return
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').eq('organization_id', activeOrg.id).order('name')
    setSuppliers(data || [])
    setLoading(false)
  }, [activeOrg, supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchSuppliers()
      void fetchAccounts()
    }, 0)
    return () => window.clearTimeout(id)
  }, [fetchAccounts, fetchSuppliers])

  const viewTransactions = async (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setActiveTab('hareketler')

    const [{ data: trxData }, { data: movData }] = await Promise.all([
      supabase
        .from('supplier_transactions')
        .select('*')
        .eq('supplier_id', supplier.id)
        .eq('organization_id', activeOrg?.id)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('stock_movements')
        .select(
          'id, created_at, quantity, unit_price, batch_id, materials!stock_movements_material_id_fkey(name, unit)',
        )
        .eq('supplier_id', supplier.id)
        .eq('organization_id', activeOrg?.id)
        .order('created_at', { ascending: false }),
    ])

    setTransactions(trxData || [])

    // Group stock movements by batch_id or date
    const movs = movData || []
    const groups: Record<string, GroupedReceipt> = {}
    ;(movs as unknown as SupplierMovement[]).forEach((item) => {
      const dateStr = item.created_at.split('T')[0]
      const key = item.batch_id || dateStr

      if (!groups[key]) {
        groups[key] = {
          batchId: item.batch_id || null,
          date: dateStr,
          totalAmount: 0,
          totalItems: 0,
          documentUrl: undefined,
          items: [],
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
    setLoading(true)
    const { data } = await supabase
      .from('stock_movements')
      .select('document_url')
      .eq('batch_id', batchId)
      .eq('organization_id', activeOrg?.id)
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
        p_account_id: paymentAccountId || null,
        p_organization_id: activeOrg?.id,
      })
      if (rpcError) throw rpcError

      const newDebt = parseFloat((selectedSupplier.total_debt || 0).toString()) - amount

      setShowPaymentModal(false)
      setPaymentAmount('')
      setPaymentNote('')
      fetchSuppliers()
      viewTransactions({ ...selectedSupplier, total_debt: newDebt })

      logActivity('Tedarikçi', 'EKLEME', `${selectedSupplier.name} firmasına ${amount} TL ödeme eklendi.`, {
        amount,
        note: paymentNote,
      })
      await showAlert('Ödeme başarıyla kaydedildi!', 'success')
    } catch (error: unknown) {
      console.error('Ödeme ekleme hatası:', error)
      await showAlert('Hata oluştu: ' + getErrorMessage(error), 'error')
    }
  }

  const handleDeleteTransaction = async (trx: Transaction) => {
    if (!selectedSupplier) return

    let accountName = null
    if (trx.transaction_type === 'payment') {
      const { data: mov } = await supabase
        .from('account_movements')
        .select('accounts(name)')
        .eq('source_type', 'supplier_payment')
        .eq('source_id', trx.id)
        .single()
      if (mov && mov.accounts) {
        const account = mov.accounts as unknown as AccountNameResult
        accountName = Array.isArray(account) ? (account[0]?.name ?? null) : account.name
      }
    }

    let confirmMessage = `Emin misiniz?\n\n${formatDate(new Date(trx.transaction_date))} tarihli ve ${formatCurrency(
      trx.amount,
    )} tutarındaki bu `
    if (trx.transaction_type === 'invoice') {
      confirmMessage += `fatura işlemi silindiğinde:\n- ${selectedSupplier.name} bakiyesinden bu borç tutarı SİLİNECEK.`
      if (trx.batch_id) {
        confirmMessage += `\n- Bu fişe bağlı stok girişleri de GERİ ALINACAK.`
      }
    } else {
      confirmMessage += `ödeme işlemi silindiğinde:\n- ${selectedSupplier.name} bakiyesine bu borç tutarı EKLENECEK.`
      if (accountName) {
        confirmMessage += `\n- Bu ödeme için kasadan çıkan tutar, ${accountName} hesabınıza GERİ İADE EDİLECEK!`
      } else {
        confirmMessage += `\n- (Uyarı: Bu işlem herhangi bir banka/kasa hesabına bağlı görünmüyor)`
      }
    }
    confirmMessage += `\n\nBu işlem geri alınamaz!`

    const confirmed = await showConfirm(confirmMessage, 'İşlemi Sil 🗑️')
    if (!confirmed) return

    try {
      if (trx.transaction_type === 'invoice' && trx.batch_id) {
        const response = await fetch('/api/delete-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: trx.batch_id, organization_id: activeOrg?.id }),
        })

        const data = await response.json()
        if (!response.ok || data.error) {
          throw new Error(data.error || 'Fiş silme işlemi başarısız oldu.')
        }
      } else {
        const { error: rpcError } = await supabase.rpc('delete_supplier_transaction', {
          p_transaction_id: trx.id,
          p_organization_id: activeOrg?.id,
        })
        if (rpcError) throw rpcError
      }

      let debtChange = 0
      if (trx.transaction_type === 'invoice') debtChange = -trx.amount
      if (trx.transaction_type === 'payment') debtChange = trx.amount

      const currentDebt = parseFloat((selectedSupplier.total_debt || 0).toString())
      const newDebt = currentDebt + debtChange

      fetchSuppliers()
      viewTransactions({ ...selectedSupplier, total_debt: newDebt })

      logActivity(
        'Tedarikçi',
        'SILME',
        `${selectedSupplier.name} firmasına ait ${trx.amount} TL tutarındaki cari işlem silindi.`,
        { transaction: trx },
      )
      await showAlert('İşlem silindi ve bakiye güncellendi!', 'success')
    } catch (error: unknown) {
      await showAlert('Silme işlemi başarısız oldu: ' + getErrorMessage(error), 'error')
    }
  }

  const handleUpdateSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedSupplier) return

    const formData = new FormData(e.currentTarget)
    const updates = {
      name: formData.get('name') as string,
      phone: formData.get('phone') as string,
      iban: formData.get('iban') as string,
      address: formData.get('address') as string,
      contact_info: formData.get('contact_info') as string,
    }

    const changes = []
    if (selectedSupplier.name !== updates.name) changes.push(`İsim: ${selectedSupplier.name} -> ${updates.name}`)
    if (selectedSupplier.phone !== updates.phone) changes.push(`Tel: ${selectedSupplier.phone} -> ${updates.phone}`)
    if (selectedSupplier.iban !== updates.iban) changes.push(`IBAN: ${selectedSupplier.iban} -> ${updates.iban}`)
    if (selectedSupplier.address !== updates.address)
      changes.push(`Adres: ${selectedSupplier.address} -> ${updates.address}`)
    if (selectedSupplier.contact_info !== updates.contact_info)
      changes.push(`Yetkili: ${selectedSupplier.contact_info} -> ${updates.contact_info}`)

    const details = changes.length > 0 ? changes.join(', ') : 'Değişiklik yapılmadı'

    const { error } = await supabase.from('suppliers').update(updates).eq('id', selectedSupplier.id)

    if (error) {
      await showAlert('Güncellenirken hata oluştu.', 'error')
    } else {
      logActivity('Tedarikçi', 'GUNCELLEME', `${selectedSupplier.name} firmasının bilgileri güncellendi.`, {
        detay: details,
      })
      await showAlert('Tedarikçi bilgileri başarıyla güncellendi!', 'success')
      fetchSuppliers()
      setSelectedSupplier({ ...selectedSupplier, ...updates } as Supplier)
    }
  }

  const handleAddSupplier = async () => {
    if (!newSupplier.name) return

    const { error } = await supabase
      .from('suppliers')
      .insert({
        name: newSupplier.name,
        contact_info: newSupplier.contact_info,
        total_debt: 0,
        organization_id: activeOrg?.id,
      })
      .select()
      .single()

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

  // ─── Computed Stats ──────────────────────────────────────────
  const totalDebtSum = useMemo(() => {
    return suppliers.reduce((t, s) => t + parseFloat((s.total_debt || 0).toString()), 0)
  }, [suppliers])

  const activeDebtedSuppliersCount = useMemo(() => {
    return suppliers.filter((s) => parseFloat((s.total_debt || 0).toString()) > 0).length
  }, [suppliers])

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers
    const q = supplierSearch.toLowerCase()
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.contact_info || '').toLowerCase().includes(q))
  }, [suppliers, supplierSearch])

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              🏢
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                  Tedarikçiler ve Cari Takip
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Toptancı Borç-Alacak
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Tedarikçi firma hesapları, alış faturaları, ödeme kayıtları ve cari ekstre takibi.
              </p>
            </div>
          </div>

          <button
            id="tour-suppliers-create"
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>➕</span>
            <span>Yeni Tedarikçi Ekle</span>
          </button>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE KPI METRIC CARDS */}
        <div id="tour-suppliers-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam Tedarikçi</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                🏢
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{suppliers.length} Firma</div>
            <div className="text-stone-400 text-[11px] mt-1">Kayıtlı Toptancı & Tedarikçi</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam Cari Borç</span>
              <span
                className={`p-2 rounded-xl text-base ${
                  totalDebtSum > 0
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                🔴
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black ${totalDebtSum > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
            >
              {formatCurrency(totalDebtSum)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Tedarikçilere Olan Borç Tutarı</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Borçlu Tedarikçi</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                ⚠️
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">{activeDebtedSuppliersCount} Firma</div>
            <div className="text-stone-400 text-[11px] mt-1">Ödemesi Bekleyen Toptancılar</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Kasa / Banka Bağlantısı</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
                🏦
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{accounts.length} Hesap</div>
            <div className="text-stone-400 text-[11px] mt-1">Aktif Ödeme Çıkış Hesapları</div>
          </div>
        </div>

        {/* ──────────────── DUAL PANEL CONTENT ──────────────── */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* SOL PANEL: Tedarikçi Listesi */}
          <div
            id="tour-suppliers-list"
            className="w-full lg:w-96 bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl flex flex-col h-auto lg:h-[calc(100vh-260px)]"
          >
            <div className="p-4 border-b border-stone-800/80 bg-stone-950/60 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-stone-100 text-sm sm:text-base flex items-center gap-2">
                  <span>🏢</span>
                  <span>Tedarikçi Listesi</span>
                </h2>
                <span className="text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  {suppliers.length} firma
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs">🔍</span>
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  placeholder="Firma veya yetkili ara..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>

            {/* Suppliers List Items */}
            <div className="flex-1 overflow-y-auto divide-y divide-stone-800/50">
              {loading ? (
                <div className="p-8 text-center text-stone-400 text-xs">
                  <div className="animate-spin text-amber-500 text-2xl mb-2">🏢</div>
                  Tedarikçiler Yükleniyor...
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <div className="p-8 text-center text-stone-500 text-xs">Aramanıza uygun tedarikçi bulunamadı.</div>
              ) : (
                filteredSuppliers.map((sup) => {
                  const debt = parseFloat((sup.total_debt || 0).toString())
                  const isSelected = selectedSupplier?.id === sup.id

                  return (
                    <div
                      key={sup.id}
                      onClick={() => viewTransactions(sup)}
                      className={`p-4 cursor-pointer transition-all ${
                        isSelected ? 'bg-amber-500/10 border-l-4 border-amber-500' : 'hover:bg-stone-800/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-extrabold text-stone-100 text-xs sm:text-sm">{sup.name}</h4>
                        <span
                          className={`font-black text-xs sm:text-sm ${debt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
                        >
                          {formatCurrency(debt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400 line-clamp-1">
                        {sup.contact_info || sup.phone || 'Yetkili bilgisi yok'}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* SAĞ PANEL: Tedarikçi Detayı ve Cari Ekstre */}
          {selectedSupplier ? (
            <div className="flex-1 bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl flex flex-col h-auto lg:h-[calc(100vh-260px)]">
              {/* Header Info Bar */}
              <div className="p-5 sm:p-6 border-b border-stone-800/80 bg-stone-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-black text-white">{selectedSupplier.name}</h2>
                    {selectedSupplier.phone && (
                      <span className="text-xs text-stone-400 bg-stone-800 px-2 py-0.5 rounded-md border border-stone-700 font-mono">
                        📞 {selectedSupplier.phone}
                      </span>
                    )}
                  </div>
                  <p className="text-stone-400 text-xs mt-1">Cari Hesap Hareketleri Dökümü & Alış Belgeleri</p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 bg-stone-900/90 p-3 rounded-2xl border border-stone-800">
                  <div className="text-right">
                    <span className="text-[10px] text-stone-400 block uppercase font-bold">Kalan Borç</span>
                    <span
                      className={`text-xl sm:text-2xl font-black ${
                        parseFloat((selectedSupplier.total_debt || 0).toString()) > 0
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(parseFloat((selectedSupplier.total_debt || 0).toString()))}
                    </span>
                  </div>

                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-stone-950 font-extrabold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all whitespace-nowrap"
                  >
                    <span>💸</span>
                    <span>Ödeme Yap</span>
                  </button>
                </div>
              </div>

              {/* Navigation Tabs Bar */}
              <div className="p-3 border-b border-stone-800/80 flex items-center justify-between bg-stone-950/40">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('hareketler')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'hareketler'
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                    }`}
                  >
                    Cari Hareketler ({transactions.length})
                  </button>

                  <button
                    onClick={() => setActiveTab('urunler')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'urunler'
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                    }`}
                  >
                    Geçmiş Fişler ({groupedReceipts.length})
                  </button>

                  <button
                    onClick={() => setActiveTab('bilgiler')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      activeTab === 'bilgiler'
                        ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                        : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                    }`}
                  >
                    Tedarikçi Bilgileri
                  </button>
                </div>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {activeTab === 'hareketler' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                          <th className="px-4 py-3">Tarih</th>
                          <th className="px-4 py-3">İşlem Türü</th>
                          <th className="px-4 py-3">Açıklama</th>
                          <th className="px-4 py-3 text-right">Tutar</th>
                          <th className="px-4 py-3 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                        {transactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-12 text-stone-500">
                              Henüz cari hareket bulunmuyor.
                            </td>
                          </tr>
                        ) : (
                          transactions.map((trx) => (
                            <tr key={trx.id} className="hover:bg-stone-800/30 transition-colors">
                              <td className="px-4 py-3 text-stone-400 font-medium">
                                {formatDate(new Date(trx.transaction_date))}
                              </td>
                              <td className="px-4 py-3">
                                {trx.transaction_type === 'invoice' ? (
                                  <span className="inline-block bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full text-xs font-extrabold whitespace-nowrap">
                                    Fatura/Alış (+ Borç)
                                  </span>
                                ) : (
                                  <span className="inline-block bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-xs font-extrabold whitespace-nowrap">
                                    Ödeme Yapıldı (- Borç)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-stone-300">{trx.note || '-'}</td>
                              <td
                                className={`px-4 py-3 text-right font-black whitespace-nowrap ${
                                  trx.transaction_type === 'invoice' ? 'text-rose-400' : 'text-emerald-400'
                                }`}
                              >
                                {trx.transaction_type === 'invoice' ? '+' : '-'}
                                {formatCurrency(parseFloat(trx.amount.toString()))}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteTransaction(trx)
                                  }}
                                  className="text-stone-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                                  title="İşlemi Sil"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'urunler' && (
                  <div className="space-y-3">
                    {groupedReceipts.length === 0 ? (
                      <div className="text-center py-12 text-stone-500 text-xs">
                        Henüz bu tedarikçiden satın alınan ürün kaydı yok.
                      </div>
                    ) : (
                      groupedReceipts.map((group) => {
                        const isExpanded =
                          expandedBatch === group.batchId || (!group.batchId && expandedBatch === group.date)
                        const expandKey = group.batchId || group.date

                        return (
                          <div
                            key={expandKey}
                            className="bg-stone-950/80 border border-stone-800/80 rounded-2xl overflow-hidden transition-all"
                          >
                            <div
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-stone-800/40 transition-colors cursor-pointer select-none"
                              onClick={() => setExpandedBatch(isExpanded ? null : expandKey)}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="text-stone-400 text-xs transition-transform duration-200"
                                  style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                >
                                  ▶
                                </span>
                                <div>
                                  <h4 className="font-extrabold text-amber-400 text-xs sm:text-sm">
                                    {formatDate(new Date(group.date))}
                                  </h4>
                                  <p className="text-stone-400 text-[11px]">
                                    <strong className="text-white">{group.totalItems}</strong> kalem ürün
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold block">
                                    Fiş Toplamı
                                  </span>
                                  <span className="font-black text-rose-400 text-xs sm:text-sm">
                                    {formatCurrency(group.totalAmount)}
                                  </span>
                                </div>

                                {group.batchId && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      viewDocument(group.batchId)
                                    }}
                                    className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl border border-stone-700 text-xs transition-colors"
                                    title="Belgeyi Gör"
                                  >
                                    🖼️ Belge
                                  </button>
                                )}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-stone-800 bg-stone-900/60 p-3">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-stone-800 text-stone-400 text-[10px] uppercase font-semibold">
                                      <th className="px-3 py-2">Hammadde</th>
                                      <th className="px-3 py-2 text-right">Miktar</th>
                                      <th className="px-3 py-2 text-right">Birim Fiyat</th>
                                      <th className="px-3 py-2 text-right">Toplam</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-stone-800/50">
                                    {group.items.map((item) => {
                                      const total = (item.quantity || 0) * (item.unit_price || 0)
                                      return (
                                        <tr key={item.id} className="hover:bg-stone-800/30 transition-colors">
                                          <td className="px-3 py-2 font-semibold text-stone-200">
                                            {item.materials?.name}
                                          </td>
                                          <td className="px-3 py-2 text-right font-bold text-white">
                                            {item.quantity} {item.materials?.unit}
                                          </td>
                                          <td className="px-3 py-2 text-right text-stone-400">
                                            {formatCurrency(parseFloat((item.unit_price || 0).toString()))}
                                          </td>
                                          <td className="px-3 py-2 text-right font-extrabold text-rose-400">
                                            {formatCurrency(total)}
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
                )}

                {activeTab === 'bilgiler' && (
                  <form onSubmit={handleUpdateSupplier} className="space-y-4 max-w-xl">
                    <div>
                      <label className="text-stone-300 text-xs font-semibold mb-1 block">Firma / Tedarikçi Adı *</label>
                      <input
                        name="name"
                        defaultValue={selectedSupplier.name}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 text-xs font-semibold mb-1 block">Telefon Numarası</label>
                      <input
                        name="phone"
                        defaultValue={selectedSupplier.phone || ''}
                        placeholder="05XX XXX XX XX"
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 text-xs font-semibold mb-1 block">IBAN Numarası</label>
                      <input
                        name="iban"
                        defaultValue={selectedSupplier.iban || ''}
                        placeholder="TRXX XXXX XXXX XXXX XXXX XXXX XX"
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 text-xs font-semibold mb-1 block">Adres</label>
                      <textarea
                        name="address"
                        defaultValue={selectedSupplier.address || ''}
                        rows={3}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-stone-300 text-xs font-semibold mb-1 block">
                        Yetkili Kişi / İletişim Notları
                      </label>
                      <input
                        name="contact_info"
                        defaultValue={selectedSupplier.contact_info || ''}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    <div className="pt-3">
                      <button
                        type="submit"
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-5 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                      >
                        Tedarikçi Bilgilerini Güncelle
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-stone-900/40 rounded-2xl border border-dashed border-stone-800/80 flex flex-col items-center justify-center p-12 text-center text-stone-500 h-auto lg:h-[calc(100vh-260px)]">
              <div className="text-6xl mb-3 opacity-40">👈</div>
              <h3 className="text-base font-bold text-stone-300 mb-1">Tedarikçi Seçilmedi</h3>
              <p className="text-xs text-stone-500 max-w-xs">
                Cari hareketlerini, alış fişlerini ve borç durumunu incelemek için soldaki listeden bir tedarikçi seçin.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ──────────────── MODAL: ÖDEME YAP ──────────────── */}
      {showPaymentModal && selectedSupplier && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                  💸
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Tedarikçiye Ödeme Yap</h3>
                  <p className="text-stone-400 text-xs">{selectedSupplier.name} hesabından düşülecek.</p>
                </div>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-stone-300 text-xs font-semibold mb-1 block">Ödenen Tutar (₺) *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Örn: 5000"
                  className="w-full bg-stone-950 border border-emerald-500/40 rounded-xl px-4 py-2.5 text-emerald-400 font-black text-xl focus:outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-stone-300 text-xs font-semibold mb-1 block">
                  Ödemenin Çıkacağı Kasa / Banka Hesabı
                </label>
                <select
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Hesap Seçiniz (Opsiyonel) --</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type === 'cash' ? 'Nakit Kasa' : 'Banka Hesabı'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-stone-300 text-xs font-semibold mb-1 block">Açıklama / Not</label>
                <input
                  type="text"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Örn: Banka havalesi ile ödendi"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handlePayment}
                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
              >
                Ödemeyi Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL: YENİ TEDARİKÇİ ──────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden relative my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  🏢
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Yeni Tedarikçi Ekle</h3>
                  <p className="text-stone-400 text-xs">Toptancı firma tanımlaması yapın.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div>
                <label className="text-stone-300 text-xs font-semibold mb-1 block">Tedarikçi / Firma Adı *</label>
                <input
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  placeholder="örn: Güven Gıda San. Tic. A.Ş."
                  autoFocus
                />
              </div>

              <div>
                <label className="text-stone-300 text-xs font-semibold mb-1 block">
                  Yetkili Kişi / İletişim Bilgisi
                </label>
                <input
                  value={newSupplier.contact_info}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact_info: e.target.value })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  placeholder="örn: Ahmet Bey - 0532 XXX XX XX"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleAddSupplier}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                Tedarikçiyi Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Belge Önizleme Modalı */}
      <DocumentPreviewModal
        isOpen={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        url={previewUrl}
        title="Tedarikçi Belgesi Önizleme"
      />
    </div>
  )
}

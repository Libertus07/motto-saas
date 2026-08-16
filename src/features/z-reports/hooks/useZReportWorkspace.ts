import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import { dataUrlToFile } from '@/lib/imagePreprocess'
import { useNotification } from '@/components/NotificationProvider'
import { useOrganization } from '@/context/OrganizationContext'
import { persistZReportWrite, validateOrganizationDocument } from '@/features/documents'
import { devError } from '@/lib/debug'
import { saveProductWithRecipe } from '@/features/products/services/product-service'
import type { NewZReportProduct, ParsedExpenseItem, ParsedSaleItem, ParsedZReport, ZReportProduct } from '../types'
import { findBestProductMatch, matchExpenseCategory } from '../z-report-utils'
import { findExistingZReportBatch, processZReport } from '../services/z-report-service'

type ZReportFileType = 'image' | 'pdf' | 'xml' | 'json' | null
const DEFAULT_CATEGORIES = ['Sıcak İçecek', 'Soğuk İçecek', 'Tatlı', 'Yemek', 'Genel']
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Bilinmeyen hata')

export function useZReportWorkspace() {
  const { showAlert, showConfirm } = useNotification()
  const { activeOrg } = useOrganization()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const activeOrganizationIdRef = useRef(activeOrg?.id)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileText, setFileText] = useState<string | null>(null)
  const [fileType, setFileType] = useState<ZReportFileType>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [parsedData, setParsedData] = useState<ParsedZReport | null>(null)
  const [products, setProducts] = useState<ZReportProduct[]>([])
  const [newProductModal, setNewProductModal] = useState<NewZReportProduct | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [isPreprocessOpen, setIsPreprocessOpen] = useState(false)
  const [preprocessFiles, setPreprocessFiles] = useState<File[] | File | null>(null)
  const [pendingOrganizationId, setPendingOrganizationId] = useState<string | null>(null)

  useEffect(() => {
    activeOrganizationIdRef.current = activeOrg?.id
    return () => {
      activeOrganizationIdRef.current = undefined
    }
  }, [activeOrg?.id])

  useEffect(() => {
    if (!activeOrg?.id) return
    let active = true
    void supabase
      .from('products')
      .select('id, name, category')
      .eq('organization_id', activeOrg.id)
      .then(({ data }) => {
        if (active) setProducts(data ?? [])
      })
    return () => {
      active = false
    }
  }, [activeOrg?.id, supabase])

  const allCategories = useMemo(
    () => Array.from(new Set([...DEFAULT_CATEGORIES, ...products.map((product) => product.category).filter(Boolean)])),
    [products],
  )

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const file = files[0]
    const organizationId = activeOrg?.id
    if (!organizationId) {
      void showAlert('Aktif işletme bilgisi bulunamadı.', 'error')
      return
    }
    const validationError = validateOrganizationDocument({
      organizationId,
      bucket: 'receipts',
      kind: 'z-report',
      file,
    })
    if (validationError) {
      void showAlert(validationError, 'warning')
      return
    }
    setSelectedFile(file)
    setPendingOrganizationId(organizationId)
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'xml' || extension === 'json') {
      const reader = new FileReader()
      reader.onload = () => {
        setImageUrl(null)
        setFileText(String(reader.result ?? ''))
        setFileType(extension)
      }
      reader.readAsText(file)
      return
    }
    if (extension === 'xlsx' || extension === 'xls') {
      const reader = new FileReader()
      reader.onload = (loadEvent) => {
        const workbook = XLSX.read(new Uint8Array(loadEvent.target?.result as ArrayBuffer), { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        setImageUrl(null)
        setFileText(JSON.stringify(XLSX.utils.sheet_to_json(worksheet)))
        setFileType('json')
      }
      reader.readAsArrayBuffer(file)
      return
    }
    if (file.type === 'application/pdf') {
      if (file.size > 3 * 1024 * 1024) {
        void showAlert('Seçtiğiniz PDF belgesi çok büyük (Max 3MB). Lütfen dosya boyutunu küçültün.', 'warning')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        setFileText(null)
        setImageUrl(String(reader.result ?? ''))
        setFileType('pdf')
      }
      reader.readAsDataURL(file)
      return
    }
    setPreprocessFiles(files)
    setIsPreprocessOpen(true)
  }

  const analyze = async () => {
    if (!imageUrl && !fileText) return
    const organizationId = pendingOrganizationId
    if (!organizationId || activeOrganizationIdRef.current !== organizationId) {
      await showAlert('Belge farklı bir işletme için hazırlandı. Lütfen yeniden seçin.', 'warning')
      return
    }
    setAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageUrl, fileText, fileType }),
      })
      const data = (await response.json()) as ParsedZReport & { error?: string }
      if (activeOrganizationIdRef.current !== organizationId) return
      if (response.status === 429) {
        await showAlert('Günlük limit doldu, yarın tekrar deneyin.', 'warning')
        return
      }
      if (data.error) throw new Error(data.error)
      setParsedData({
        ...data,
        items: data.items.map((item: ParsedSaleItem) => ({
          ...item,
          matchedProductId: findBestProductMatch(item.product_name, products)?.id,
        })),
        expenses: (data.expenses ?? []).map((expense: ParsedExpenseItem) => ({
          ...expense,
          category: matchExpenseCategory(expense.expense_name),
        })),
      })
    } catch (error: unknown) {
      if (activeOrganizationIdRef.current === organizationId) {
        devError('Z Raporu analiz edilemedi.', error)
        await showAlert('Z Raporu analiz edilemedi. Lütfen tekrar deneyin.', 'error')
      }
    } finally {
      if (activeOrganizationIdRef.current === organizationId) {
        setAnalyzing(false)
      }
    }
  }

  const createProduct = async () => {
    if (!newProductModal?.name.trim() || !newProductModal.category.trim()) {
      await showAlert('Lütfen ürün adı ve kategorisini girin.', 'warning')
      return
    }
    if (!activeOrg?.id) return

    setSavingProduct(true)
    try {
      const productId = await saveProductWithRecipe(supabase, activeOrg.id, {
        name: newProductModal.name.trim(),
        category: newProductModal.category.trim(),
        salePrice: newProductModal.price,
        estimatedMonthlySales: 0,
        ingredients: [],
        auditDetails: { source: 'z_report_workspace' },
      })
      const product = { id: productId, name: newProductModal.name.trim(), category: newProductModal.category.trim() }
      setProducts((current) => [...current, product].sort((a, b) => a.name.localeCompare(b.name, 'tr-TR')))
      setParsedData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item, index) =>
                index === newProductModal.itemIndex ? { ...item, matchedProductId: productId } : item,
              ),
            }
          : current,
      )
      setNewProductModal(null)
    } catch (error: unknown) {
      await showAlert(`Ürün eklenirken hata oluştu: ${getErrorMessage(error)}`, 'error')
    } finally {
      setSavingProduct(false)
    }
  }

  const startManualMode = () => {
    if (!activeOrg?.id) {
      void showAlert('Aktif işletme bilgisi bulunamadı.', 'error')
      return
    }
    setPendingOrganizationId(activeOrg.id)
    setSelectedFile(null)
    setParsedData({
      date: new Date().toISOString().split('T')[0],
      total_revenue: 0,
      payment_methods: { cash: 0, credit_card: 0, other: 0 },
      items: [{ product_name: '', quantity: 1, total_price: 0 }],
      expenses: [],
    })
  }

  const addManualExpense = () =>
    setParsedData((current) =>
      current
        ? {
            ...current,
            expenses: [...current.expenses, { expense_name: '', amount: 0, category: 'Genel' }],
          }
        : current,
    )

  const addManualSale = () =>
    setParsedData((current) =>
      current
        ? {
            ...current,
            items: [...current.items, { product_name: '', quantity: 1, total_price: 0 }],
          }
        : current,
    )

  const approve = async () => {
    if (!parsedData || !activeOrg?.id) return
    setLoading(true)
    try {
      const reportDate = parsedData.date || new Date().toISOString().split('T')[0]
      const existingBatchId = await findExistingZReportBatch(supabase, activeOrg.id, reportDate)
      const replaceExisting = existingBatchId
        ? await showConfirm(
            `Bu tarihe (${reportDate}) ait bir Z-Raporu zaten var. Önceki kaydı yenisiyle değiştirmek istiyor musunuz?`,
            'warning',
          )
        : false
      if (existingBatchId && !replaceExisting) return

      await persistZReportWrite(
        supabase,
        activeOrg.id,
        selectedFile,
        (documentUrl) =>
          processZReport(supabase, {
            organizationId: activeOrg.id,
            report: { ...parsedData, date: reportDate },
            documentUrl,
            replaceExisting,
          }),
        pendingOrganizationId,
        () => activeOrganizationIdRef.current,
      )
      await showAlert('Z Raporu başarıyla işlendi ve stoklar düşüldü!', 'success')
      router.push('/dashboard/raporlar')
    } catch (error: unknown) {
      devError('Z Raporu kaydedilemedi.', error)
      await showAlert('Z Raporu kaydedilemedi. Lütfen tekrar deneyin.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setParsedData(null)
    setImageUrl(null)
    setFileText(null)
    setFileType(null)
    setSelectedFile(null)
    setPendingOrganizationId(null)
  }
  const closePreprocess = () => {
    setIsPreprocessOpen(false)
    setPreprocessFiles(null)
  }
  const confirmPreprocess = (results: { dataUrl: string }[]) => {
    closePreprocess()
    if (!results.length) return
    if (!activeOrg?.id) {
      void showAlert('Aktif işletme bilgisi bulunamadı.', 'error')
      return
    }
    setFileText(null)
    setImageUrl(results[0].dataUrl)
    setFileType('image')
    setSelectedFile(dataUrlToFile(results[0].dataUrl, `processed-zreport-${Date.now()}.jpg`))
    setPendingOrganizationId(activeOrg.id)
  }

  return {
    imageUrl,
    fileText,
    fileType,
    loading,
    analyzing,
    parsedData,
    setParsedData,
    products,
    newProductModal,
    setNewProductModal,
    savingProduct,
    allCategories,
    isPreprocessOpen,
    preprocessFiles,
    handleFileUpload,
    analyze,
    createProduct,
    startManualMode,
    addManualExpense,
    addManualSale,
    approve,
    reset,
    closePreprocess,
    confirmPreprocess,
  }
}

export type ZReportWorkspace = ReturnType<typeof useZReportWorkspace>

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { dataUrlToFile } from '@/lib/imagePreprocess'
import { useNotification } from '@/components/NotificationProvider'
import { useOrganization } from '@/context/OrganizationContext'
import { persistZReportWrite, validateOrganizationDocument } from '@/features/documents'
import { devError } from '@/lib/debug'
import { saveProductWithRecipe } from '@/features/products/services/product-service'
import { createSpreadsheetParseCoordinator } from '@/features/spreadsheets/spreadsheet-parse-coordinator'
import { toZReportAnalysisInput } from '../services/z-report-spreadsheet-adapter'
import { findExistingZReportBatch, processZReport } from '../services/z-report-service'
import { createZReportWorkflowSession } from '../services/z-report-workflow-session'
import type { NewZReportProduct, ParsedExpenseItem, ParsedSaleItem, ParsedZReport, ZReportProduct } from '../types'
import { findBestProductMatch, matchExpenseCategory } from '../z-report-utils'

type ZReportFileType = 'image' | 'pdf' | 'xml' | 'json' | null

const DEFAULT_CATEGORIES = ['Sıcak İçecek', 'Soğuk İçecek', 'Tatlı', 'Yemek', 'Genel']
const SPREADSHEET_UNSUPPORTED_MESSAGE = 'Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.'
const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Bilinmeyen hata')

export function useZReportWorkspace() {
  const { showAlert, showConfirm } = useNotification()
  const { activeOrg } = useOrganization()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const activeOrganizationIdRef = useRef(activeOrg?.id)
  const sourceGenerationRef = useRef(0)
  const organizationEffectMountedRef = useRef(false)
  const preprocessSourceRef = useRef<{ generation: number; organizationId: string } | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [, setSelectedFile] = useState<File | null>(null)
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
  const [spreadsheetParseCoordinator] = useState(createSpreadsheetParseCoordinator)
  const [workflow] = useState(createZReportWorkflowSession)

  const invalidateSourceSelection = useCallback(() => {
    const generation = workflow.invalidate()
    sourceGenerationRef.current = generation
    preprocessSourceRef.current = null
    spreadsheetParseCoordinator.cancel()
    setImageUrl(null)
    setSelectedFile(null)
    setFileText(null)
    setFileType(null)
    setParsedData(null)
    setPendingOrganizationId(null)
    setAnalyzing(false)
    setLoading(false)
    setIsPreprocessOpen(false)
    setPreprocessFiles(null)
    return generation
  }, [spreadsheetParseCoordinator, workflow])

  const isCurrentSource = useCallback(
    (generation: number, organizationId: string) => {
      return (
        workflow.isCurrentSource(generation, activeOrganizationIdRef.current) &&
        organizationId === activeOrganizationIdRef.current
      )
    },
    [workflow],
  )

  useEffect(() => {
    const organizationChanged =
      organizationEffectMountedRef.current && activeOrganizationIdRef.current !== activeOrg?.id
    if (organizationChanged) {
      invalidateSourceSelection()
    }
    activeOrganizationIdRef.current = activeOrg?.id
    organizationEffectMountedRef.current = true

    return () => {
      workflow.invalidate()
      spreadsheetParseCoordinator.cancel()
    }
  }, [activeOrg?.id, invalidateSourceSelection, spreadsheetParseCoordinator, workflow])

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

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return

    const file = files[0]
    invalidateSourceSelection()
    const organizationId = activeOrg?.id
    if (!organizationId) {
      await showAlert('Aktif işletme bilgisi bulunamadı.', 'error')
      return
    }
    const sourceGeneration = workflow.beginSource(organizationId)
    sourceGenerationRef.current = sourceGeneration

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'xls' || extension === 'xlsm') {
      await showAlert(SPREADSHEET_UNSUPPORTED_MESSAGE, 'warning')
      return
    }

    if (extension === 'xlsx' || extension === 'csv') {
      if (extension === 'xlsx') {
        const validationError = validateOrganizationDocument({
          organizationId,
          bucket: 'receipts',
          kind: 'z-report',
          file,
        })
        if (validationError) {
          await showAlert(validationError, 'warning')
          return
        }
      }

      try {
        const parsed = await spreadsheetParseCoordinator.run(file, organizationId)
        if (!parsed || !isCurrentSource(sourceGeneration, organizationId)) return
        if (parsed.organizationId !== organizationId) {
          await showAlert('İşletme değiştiği için dosya işlemi iptal edildi.', 'warning')
          return
        }
        if (!parsed.result.ok) {
          await showAlert(parsed.result.message, 'warning')
          return
        }

        const analysisInput = toZReportAnalysisInput(parsed.result.table)
        if (!analysisInput.ok) {
          await showAlert(analysisInput.message, 'warning')
          return
        }
        if (!isCurrentSource(sourceGeneration, organizationId)) return

        workflow.stage(sourceGeneration, parsed.result.table.kind === 'xlsx' ? file : null)
        setSelectedFile(parsed.result.table.kind === 'xlsx' ? file : null)
        setImageUrl(null)
        setFileText(analysisInput.content)
        setFileType('json')
        setPendingOrganizationId(organizationId)
      } catch (error: unknown) {
        if (isCurrentSource(sourceGeneration, organizationId)) {
          devError('Z-Raporu elektronik tablo okunamadı.', error)
          await showAlert('Elektronik tablo okunamadı. Lütfen dosyayı kontrol edip tekrar deneyin.', 'warning')
        }
      }
      return
    }

    const validationError = validateOrganizationDocument({
      organizationId,
      bucket: 'receipts',
      kind: 'z-report',
      file,
    })
    if (validationError) {
      await showAlert(validationError, 'warning')
      return
    }

    if (extension === 'xml' || extension === 'json') {
      workflow.stage(sourceGeneration, file)
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        if (!isCurrentSource(sourceGeneration, organizationId)) return
        setImageUrl(null)
        setFileText(String(reader.result ?? ''))
        setFileType(extension)
        setPendingOrganizationId(organizationId)
      }
      reader.onerror = () => {
        if (isCurrentSource(sourceGeneration, organizationId)) {
          void showAlert('Belge okunamadı. Lütfen dosyayı kontrol edip tekrar deneyin.', 'warning')
        }
      }
      reader.readAsText(file)
      return
    }

    if (file.type === 'application/pdf') {
      if (file.size > 3 * 1024 * 1024) {
        await showAlert('Seçtiğiniz PDF belgesi çok büyük (Max 3MB). Lütfen dosya boyutunu küçültün.', 'warning')
        return
      }
      workflow.stage(sourceGeneration, file)
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        if (!isCurrentSource(sourceGeneration, organizationId)) return
        setFileText(null)
        setImageUrl(String(reader.result ?? ''))
        setFileType('pdf')
        setPendingOrganizationId(organizationId)
      }
      reader.onerror = () => {
        if (isCurrentSource(sourceGeneration, organizationId)) {
          void showAlert('Belge okunamadı. Lütfen dosyayı kontrol edip tekrar deneyin.', 'warning')
        }
      }
      reader.readAsDataURL(file)
      return
    }

    preprocessSourceRef.current = { generation: sourceGeneration, organizationId }
    setPreprocessFiles(files)
    setIsPreprocessOpen(true)
  }

  const analyze = async () => {
    if (!imageUrl && !fileText) return
    const organizationId = pendingOrganizationId
    const sourceGeneration = sourceGenerationRef.current
    if (!organizationId || !isCurrentSource(sourceGeneration, organizationId)) {
      await showAlert('Belge farklı bir işletme için hazırlandı. Lütfen yeniden seçin.', 'warning')
      return
    }
    const analysisAttempt = workflow.beginAnalysis(organizationId)
    if (!analysisAttempt) return
    setAnalyzing(true)
    try {
      const response = await fetch('/api/analyze-z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageUrl, fileText, fileType }),
      })
      const data = (await response.json()) as ParsedZReport & { error?: string }
      if (!workflow.isCurrentAnalysis(analysisAttempt, activeOrganizationIdRef.current)) return
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
      workflow.markReviewed(analysisAttempt, activeOrganizationIdRef.current)
    } catch (error: unknown) {
      if (workflow.isCurrentAnalysis(analysisAttempt, activeOrganizationIdRef.current)) {
        devError('Z Raporu analiz edilemedi.', error)
        await showAlert('Z Raporu analiz edilemedi. Lütfen tekrar deneyin.', 'error')
      }
    } finally {
      if (workflow.finishAnalysis(analysisAttempt, activeOrganizationIdRef.current)) {
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
    invalidateSourceSelection()
    if (!activeOrg?.id) {
      void showAlert('Aktif işletme bilgisi bulunamadı.', 'error')
      return
    }
    const sourceGeneration = workflow.beginSource(activeOrg.id)
    sourceGenerationRef.current = sourceGeneration
    workflow.stage(sourceGeneration, null)
    const analysisAttempt = workflow.beginAnalysis(activeOrg.id)
    if (analysisAttempt) {
      workflow.markReviewed(analysisAttempt, activeOrg.id)
      workflow.finishAnalysis(analysisAttempt, activeOrg.id)
    }
    setPendingOrganizationId(activeOrg.id)
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
    const organizationId = activeOrg.id
    const sourceGeneration = sourceGenerationRef.current
    if (pendingOrganizationId !== organizationId || !isCurrentSource(sourceGeneration, organizationId)) {
      await showAlert('Belge farklı bir işletme için hazırlandı. Lütfen yeniden analiz edin.', 'warning')
      return
    }
    const approvalAttempt = workflow.beginApproval(organizationId)
    if (!approvalAttempt) return
    const persistenceFile = workflow.documentForApproval(approvalAttempt, organizationId)
    if (persistenceFile === undefined) {
      workflow.finishApproval(approvalAttempt, organizationId)
      await showAlert('Belge farklı bir işletme için hazırlandı. Lütfen yeniden analiz edin.', 'warning')
      return
    }

    setLoading(true)
    try {
      const reportDate = parsedData.date || new Date().toISOString().split('T')[0]
      const existingBatchId = await findExistingZReportBatch(supabase, organizationId, reportDate)
      if (!workflow.isCurrentApproval(approvalAttempt, activeOrganizationIdRef.current)) return
      const replaceExisting = existingBatchId
        ? await showConfirm(
            `Bu tarihe (${reportDate}) ait bir Z-Raporu zaten var. Önceki kaydı yenisiyle değiştirmek istiyor musunuz?`,
            'warning',
          )
        : false
      if (
        !workflow.isCurrentApproval(approvalAttempt, activeOrganizationIdRef.current) ||
        (existingBatchId && !replaceExisting)
      )
        return

      await persistZReportWrite(
        supabase,
        organizationId,
        persistenceFile,
        (documentUrl) =>
          processZReport(supabase, {
            organizationId,
            report: { ...parsedData, date: reportDate },
            documentUrl,
            replaceExisting,
          }),
        pendingOrganizationId,
        () => activeOrganizationIdRef.current,
      )
      if (!workflow.isCurrentApproval(approvalAttempt, activeOrganizationIdRef.current)) return
      await showAlert('Z Raporu başarıyla işlendi ve stoklar düşüldü!', 'success')
      if (!workflow.isCurrentApproval(approvalAttempt, activeOrganizationIdRef.current)) return
      router.push('/dashboard/raporlar')
    } catch (error: unknown) {
      if (workflow.isCurrentApproval(approvalAttempt, activeOrganizationIdRef.current)) {
        devError('Z Raporu kaydedilemedi.', error)
        await showAlert('Z Raporu kaydedilemedi. Lütfen tekrar deneyin.', 'error')
      }
    } finally {
      if (workflow.finishApproval(approvalAttempt, activeOrganizationIdRef.current)) {
        setLoading(false)
      }
    }
  }

  const reset = () => {
    invalidateSourceSelection()
  }

  const closePreprocess = () => {
    preprocessSourceRef.current = null
    setIsPreprocessOpen(false)
    setPreprocessFiles(null)
  }

  const confirmPreprocess = (results: { dataUrl: string }[]) => {
    const source = preprocessSourceRef.current
    if (!results.length || !source || !isCurrentSource(source.generation, source.organizationId)) {
      closePreprocess()
      return
    }

    closePreprocess()
    const processedFile = dataUrlToFile(results[0].dataUrl, `processed-zreport-${Date.now()}.jpg`)
    workflow.stage(source.generation, processedFile)
    setFileText(null)
    setImageUrl(results[0].dataUrl)
    setFileType('image')
    setSelectedFile(processedFile)
    setPendingOrganizationId(source.organizationId)
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

import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import { useCallback, useState } from 'react'

import type { NotificationSeverity } from '@/components/NotificationProvider'

import type { BuyFormState } from '../types'

type DocumentForm = { document_url?: string }
type ShowAlert = (message: string, severity?: NotificationSeverity, title?: string) => Promise<void>

type InvestmentAnalysisResponse = {
  error?: string
  asset_type?: BuyFormState['asset_type']
  quantity?: number
  price_per_unit?: number
  notes?: string
  purchase_date?: string
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Bilinmeyen hata'

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

export function useInvestmentDocuments({
  setBuyForm,
  showAlert,
}: {
  setBuyForm: Dispatch<SetStateAction<BuyFormState>>
  showAlert: ShowAlert
}) {
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  const analyzeReceipt = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (file.size > 3 * 1024 * 1024) {
        await showAlert(
          'Seçilen dosya çok büyük. Lütfen 3 MB altı bir dosya seçin veya kırparak tekrar deneyin.',
          'warning',
        )
        return
      }

      setIsAnalyzing(true)
      try {
        const image = await readFileAsDataUrl(file)
        const response = await fetch('/api/analyze-investment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image,
            fileType: file.type === 'application/pdf' ? 'pdf' : 'image',
          }),
        })
        const data = (await response.json()) as InvestmentAnalysisResponse
        if (!response.ok || data.error) throw new Error(data.error || 'Yatırım belgesi analiz edilemedi.')

        setBuyForm((current) => ({
          ...current,
          asset_type: data.asset_type || 'gold',
          quantity: data.quantity?.toString() || current.quantity,
          price_per_unit: data.price_per_unit?.toString() || current.price_per_unit,
          notes: `AI: ${data.notes || ''}`,
          purchase_date: data.purchase_date || current.purchase_date,
        }))
        await showAlert('Fiş başarıyla okundu ve form dolduruldu.', 'success')
      } catch (error) {
        let message = getErrorMessage(error)
        if (message === 'The string did not match the expected pattern.') {
          message = 'Tarayıcı kaynaklı bir hata oluştu. Fotoğraf formatı desteklenmiyor olabilir.'
        }
        await showAlert(message || 'Yapay zeka fişi okuyamadı.', 'error')
      } finally {
        setIsAnalyzing(false)
        event.target.value = ''
      }
    },
    [setBuyForm, showAlert],
  )

  const uploadDocument = useCallback(
    async <T extends DocumentForm>(
      event: ChangeEvent<HTMLInputElement>,
      formSetter: (value: T) => void,
      formState: T,
    ) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (file.size > 2 * 1024 * 1024) {
        await showAlert('Dosya boyutu çok büyük! Maksimum 2 MB yükleyebilirsiniz.', 'warning')
        return
      }

      try {
        const documentUrl = await readFileAsDataUrl(file)
        formSetter({ ...formState, document_url: documentUrl })
      } catch (error) {
        await showAlert(getErrorMessage(error), 'error')
      } finally {
        event.target.value = ''
      }
    },
    [showAlert],
  )

  return { isAnalyzing, analyzeReceipt, uploadDocument }
}

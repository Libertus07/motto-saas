'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { devError } from '@/lib/debug'
import { createClient } from '@/lib/supabase'

import { resolveDocumentPreviewUrl } from './document-storage-service'

const PREVIEW_ERROR_MESSAGE = 'Belge görüntülenemedi. Lütfen tekrar deneyin.'

export function useDocumentPreview() {
  const { showAlert } = useNotification()
  const supabase = useMemo(() => createClient(), [])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewReference, setPreviewReference] = useState<string | null>(null)
  const currentRequest = useRef(0)
  const requestPending = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      currentRequest.current += 1
      requestPending.current = false
    }
  }, [])

  const openDocument = useCallback(
    async (reference: string) => {
      if (!reference || requestPending.current) return

      const requestId = ++currentRequest.current
      requestPending.current = true
      setPreviewLoading(true)
      setPreviewReference(reference)

      try {
        const resolvedUrl = await resolveDocumentPreviewUrl(supabase, reference)
        if (mounted.current && requestId === currentRequest.current) {
          setPreviewUrl(resolvedUrl)
        }
      } catch (error) {
        if (mounted.current && requestId === currentRequest.current) {
          devError('Belge önizleme bağlantısı çözümlenemedi.', error)
          await showAlert(PREVIEW_ERROR_MESSAGE, 'error')
        }
      } finally {
        if (mounted.current && requestId === currentRequest.current) {
          requestPending.current = false
          setPreviewLoading(false)
          setPreviewReference(null)
        }
      }
    },
    [showAlert, supabase],
  )

  const closeDocument = useCallback(() => {
    currentRequest.current += 1
    requestPending.current = false
    setPreviewUrl(null)
    setPreviewLoading(false)
    setPreviewReference(null)
  }, [])

  return { previewUrl, previewLoading, previewReference, openDocument, closeDocument }
}

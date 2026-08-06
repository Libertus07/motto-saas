import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useState } from 'react'

import { fetchMaterialPriceHistory } from '../services/material-service'
import type { Material, PriceHistory } from '../types'

export function useMaterialHistory({
  supabase,
  organizationId,
  onError,
}: {
  supabase: SupabaseClient
  organizationId?: string
  onError: (message: string) => Promise<void>
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedMatName, setSelectedMatName] = useState('')
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const view = useCallback(
    async (material: Material) => {
      if (!organizationId) return
      setSelectedMatName(material.name)
      setIsOpen(true)
      setLoadingHistory(true)
      try {
        setPriceHistory(await fetchMaterialPriceHistory(supabase, organizationId, material.id))
      } catch (error) {
        setPriceHistory([])
        await onError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.')
      } finally {
        setLoadingHistory(false)
      }
    },
    [onError, organizationId, supabase],
  )

  return {
    isOpen,
    onClose: () => setIsOpen(false),
    selectedMatName,
    priceHistory,
    loadingHistory,
    view,
  }
}

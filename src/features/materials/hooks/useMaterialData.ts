import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useOrganization } from '@/context/OrganizationContext'
import { createClient } from '@/lib/supabase'

import { fetchMaterialWorkspace } from '../services/material-service'
import type { Material } from '../types'

export function useMaterialData(onError: (message: string) => Promise<void>) {
  const { activeOrg, loading: organizationLoading } = useOrganization()
  const supabase = useMemo(() => createClient(), [])
  const requestId = useRef(0)
  const [materials, setMaterials] = useState<Material[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const organizationId = activeOrg?.id

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current
    if (!organizationId) {
      if (!organizationLoading) {
        setMaterials([])
        setCategories([])
        setLoading(false)
      }
      return
    }

    setLoading(true)
    try {
      const workspace = await fetchMaterialWorkspace(supabase, organizationId)
      if (currentRequest !== requestId.current) return
      setMaterials(workspace.materials)
      setCategories(workspace.categories)
    } catch (error) {
      if (currentRequest === requestId.current) {
        await onError(error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.')
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [onError, organizationId, organizationLoading, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => {
      window.clearTimeout(timeoutId)
      requestId.current += 1
    }
  }, [refresh])

  return { supabase, organizationId, materials, categories, loading, refresh }
}

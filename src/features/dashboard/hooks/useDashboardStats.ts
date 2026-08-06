'use client'

import { useCallback, useEffect, useState } from 'react'

import { devError } from '@/lib/debug'
import { createClient } from '@/lib/supabase'

import { fetchDashboardStats } from '../services/dashboard-service'
import { initialDashboardStats } from '../types'

export function useDashboardStats() {
  const [supabase] = useState(createClient)
  const [stats, setStats] = useState(initialDashboardStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      setStats(await fetchDashboardStats(supabase))
    } catch (caughtError) {
      devError('Dashboard verileri alınamadı:', caughtError)
      setError('Ana ekran verileri şu anda yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  return { error, loading, refresh, stats }
}

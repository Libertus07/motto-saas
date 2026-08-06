import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { Settings, DEFAULT_SETTINGS, SETTINGS_LABELS } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { getChangedSettings } from '../settings-utils'
import { useNotification } from '@/components/NotificationProvider'
import { fetchSettingsWorkspace, saveSettingsChanges } from '../services/settings-service'

export function useSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [initialSettings, setInitialSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SETTINGS.material_categories)

  const { activeOrg } = useOrganization()
  const { showAlert } = useNotification()
  const organizationId = activeOrg?.id
  const supabase = useMemo(() => createClient(), [])
  const requestIdRef = useRef(0)

  const fetchSettings = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!organizationId) {
      setSettings(DEFAULT_SETTINGS)
      setInitialSettings(DEFAULT_SETTINGS)
      setCategories(DEFAULT_SETTINGS.material_categories)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const loadedSettings = await fetchSettingsWorkspace(supabase, organizationId)
      if (requestId !== requestIdRef.current) return
      setSettings(loadedSettings)
      setInitialSettings(loadedSettings)
      setCategories(loadedSettings.material_categories)
    } catch {
      if (requestId !== requestIdRef.current) return
      await showAlert('Ayarlar yüklenemedi. Lütfen tekrar deneyin.', 'error')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [organizationId, showAlert, supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchSettings()
    }, 0)
    return () => clearTimeout(id)
  }, [fetchSettings])

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async (overrides: Partial<Settings> = {}): Promise<boolean> => {
    if (!organizationId) {
      await showAlert('Ayarları kaydetmek için aktif bir organizasyon gerekli.', 'warning')
      return false
    }

    setSaving(true)
    try {
      const nextSettings = { ...settings, ...overrides }
      const changedEntries = getChangedSettings(nextSettings, initialSettings)

      if (changedEntries.length === 0) {
        await showAlert('Kaydedilecek bir ayar değişikliği bulunamadı.', 'info')
        return true
      }

      await saveSettingsChanges(supabase, organizationId, changedEntries)

      const formatValue = (value: unknown) =>
        value === true ? 'Açık' : value === false ? 'Kapalı' : Array.isArray(value) ? value.join(', ') : value
      const changes = changedEntries.map(([key, value]) => {
        const initialValue = (initialSettings as Record<string, unknown>)[key]
        return `${SETTINGS_LABELS[key] || key} (${formatValue(initialValue)} -> ${formatValue(value)})`
      })
      const changeText = changes.join(' | ')
      await logActivity('Ayarlar', 'GUNCELLEME', 'Sistem genel ayarları güncellendi.', { detay: changeText })
      setSettings(nextSettings)
      setInitialSettings(nextSettings)
      await showAlert('Ayarlar başarıyla kaydedildi.', 'success')
      return true
    } catch (error) {
      await showAlert(
        error instanceof Error ? `Ayarlar kaydedilemedi: ${error.message}` : 'Ayarlar kaydedilemedi.',
        'error',
      )
      return false
    } finally {
      setSaving(false)
    }
  }

  const activeNotificationCount = useMemo(() => {
    let c = 0
    if (settings.notify_critical_stock) c++
    if (settings.notify_low_margin) c++
    if (settings.notify_daily_revenue) c++
    if (settings.notify_supplier_price) c++
    return c
  }, [settings])

  return {
    loading,
    saving,
    settings,
    categories,
    setCategories,
    setSetting,
    handleSave,
    activeNotificationCount,
  }
}

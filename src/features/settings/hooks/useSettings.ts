import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { Settings, DEFAULT_SETTINGS, SETTINGS_LABELS } from '../types'
import { useOrganization } from '@/context/OrganizationContext'
import { buildSettingsRows, getChangedSettings } from '../settings-utils'

export function useSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [initialSettings, setInitialSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SETTINGS.material_categories)
  const [toast, setToast] = useState('')

  const { activeOrg } = useOrganization()
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
    const { data, error } = await supabase.from('settings').select('*').eq('organization_id', organizationId)

    if (requestId !== requestIdRef.current) return
    if (error) {
      setToast('Ayarlar yüklenemedi. Lütfen tekrar deneyin.')
      setLoading(false)
      return
    }

    const merged = { ...DEFAULT_SETTINGS }
    data?.forEach((row) => {
      const key = row.key as keyof Settings
      if (key === 'material_categories') {
        const cats = Array.isArray(row.value) ? row.value : JSON.parse(row.value || '[]')
        ;(merged as Record<string, unknown>)[key] = cats
      } else if (
        key === 'notify_critical_stock' ||
        key === 'notify_low_margin' ||
        key === 'notify_daily_revenue' ||
        key === 'notify_supplier_price'
      ) {
        ;(merged as Record<string, unknown>)[key] = row.value === true || row.value === 'true'
      } else {
        ;(merged as Record<string, unknown>)[key] = row.value
      }
    })

    setSettings(merged)
    setInitialSettings(merged)
    setCategories(merged.material_categories)
    setLoading(false)
  }, [organizationId, supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      fetchSettings()
    }, 0)
    return () => clearTimeout(id)
  }, [fetchSettings])

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    if (!organizationId) {
      setToast('Ayarları kaydetmek için aktif bir organizasyon gerekli.')
      return
    }

    setSaving(true)
    try {
      const changedEntries = getChangedSettings(settings, initialSettings)

      if (changedEntries.length === 0) {
        setToast('Kaydedilecek bir ayar değişikliği bulunamadı.')
        return
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) throw userError || new Error('Oturum bilgisi bulunamadı.')

      const rows = buildSettingsRows(changedEntries, user.id, organizationId)
      const { error: saveError } = await supabase.from('settings').upsert(rows, { onConflict: 'organization_id,key' })
      if (saveError) throw saveError

      const formatValue = (value: unknown) =>
        value === true ? 'Açık' : value === false ? 'Kapalı' : Array.isArray(value) ? value.join(', ') : value
      const changes = changedEntries.map(([key, value]) => {
        const initialValue = (initialSettings as Record<string, unknown>)[key]
        return `${SETTINGS_LABELS[key] || key} (${formatValue(initialValue)} -> ${formatValue(value)})`
      })
      const changeText = changes.join(' | ')
      await logActivity('Ayarlar', 'GUNCELLEME', 'Sistem genel ayarları güncellendi.', { detay: changeText })
      setInitialSettings(settings)
      setToast('Ayarlar başarıyla kaydedildi.')
    } catch (error) {
      setToast(error instanceof Error ? `Ayarlar kaydedilemedi: ${error.message}` : 'Ayarlar kaydedilemedi.')
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
    toast,
    setToast,
    setCategories,
    setSetting,
    handleSave,
    activeNotificationCount,
  }
}

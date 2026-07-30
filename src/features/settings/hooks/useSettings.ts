import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { Settings, DEFAULT_SETTINGS, SETTINGS_LABELS } from '../types'
import { useOrganization } from '@/context/OrganizationContext'

export function useSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [initialSettings, setInitialSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SETTINGS.material_categories)
  const [toast, setToast] = useState('')

  const { activeOrg } = useOrganization()
  const supabase = createClient()

  const fetchSettings = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true)
    const { data } = await supabase.from('settings').select('*').eq('organization_id', activeOrg.id)
    if (data) {
      const merged = { ...DEFAULT_SETTINGS }
      data.forEach(row => {
        const key = row.key as keyof Settings
        if (key === 'material_categories') {
          const cats = Array.isArray(row.value) ? row.value : JSON.parse(row.value || '[]')
          ;(merged as Record<string, unknown>)[key] = cats
          setCategories(cats)
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
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings, activeOrg?.id])

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    const entries = Object.entries(settings).filter(([k]) => k !== 'material_categories')

    const changes: string[] = []
    for (const [key, value] of entries) {
      const initialVal = (initialSettings as Record<string, unknown>)[key]
      if (value !== initialVal) {
        const label = SETTINGS_LABELS[key] || key
        const formatVal = (v: any) =>
          v === true ? 'Açık' : v === false ? 'Kapalı' : v
        changes.push(`${label} (${formatVal(initialVal)} -> ${formatVal(value)})`)
      }
    }

    if (changes.length > 0) {
      const {
        data: { user }
      } = await supabase.auth.getUser()
      for (const [key, value] of entries) {
        await supabase.from('settings').upsert({ key, value, user_id: user?.id, organization_id: activeOrg?.id }, { onConflict: 'organization_id, key' })
      }
      const changeText = changes.join(' | ')
      await logActivity('Ayarlar', 'GUNCELLEME', `Sistem genel ayarları güncellendi.`, { detay: changeText })
      setInitialSettings(settings)
    }

    setToast('Ayarlar başarıyla kaydedildi.')
    setSaving(false)
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
    activeNotificationCount
  }
}

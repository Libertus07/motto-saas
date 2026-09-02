import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, ImagePlus, RotateCcw } from 'lucide-react'

import { createClient } from '@/lib/supabase'
import { useNotification } from '@/components/NotificationProvider'
import { SafeUserImage } from '@/components/ui/SafeUserImage'
import { Input } from '@/components/ui/input'
import { useOrganization } from '@/context/OrganizationContext'

import {
  getManagedLogoObjectPath,
  removeOrganizationLogo,
  uploadOrganizationLogo,
  validateOrganizationLogo,
} from '../../services/organization-logo-service'
import type { Settings } from '../../types'
import { SectionCard } from '../ui/SectionCard'
import { FormRow } from '../ui/FormRow'
import { SaveButton } from '../ui/SaveButton'

type GenelTabProps = {
  s: Settings
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void
  onSave: (overrides?: Partial<Settings>) => Promise<boolean>
  saving: boolean
}

export function GenelTab({ s, set, onSave, saving }: GenelTabProps) {
  const { showAlert } = useNotification()
  const { activeOrg } = useOrganization()
  const [selectedLogo, setSelectedLogo] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [savingLogo, setSavingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = useMemo(() => createClient(), [])
  const canManageBranding = activeOrg?.role === 'owner' || activeOrg?.role === 'admin'
  const previewUrl = useMemo(() => (selectedLogo ? URL.createObjectURL(selectedLogo) : null), [selectedLogo])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleLogoSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validationMessage = validateOrganizationLogo(file)
    if (validationMessage) {
      await showAlert(validationMessage, 'warning')
      e.target.value = ''
      return
    }
    setSelectedLogo(file)
    setRemoveLogo(false)
  }

  const handleSave = async () => {
    if (!activeOrg) {
      await showAlert('Logo ayarını kaydetmek için aktif bir organizasyon gerekli.', 'warning')
      return
    }
    if ((selectedLogo || removeLogo) && !canManageBranding) {
      await showAlert('Giriş logosunu yalnızca organizasyon sahibi veya yöneticisi değiştirebilir.', 'warning')
      return
    }

    setSavingLogo(true)
    let newObjectPath: string | null = null
    try {
      let logoUrl = removeLogo ? '' : s.business_logo
      if (selectedLogo) {
        const uploaded = await uploadOrganizationLogo(supabase, activeOrg.id, selectedLogo)
        newObjectPath = uploaded.objectPath
        logoUrl = uploaded.publicUrl
      }

      const saved = await onSave({ business_logo: logoUrl })
      if (!saved) {
        if (newObjectPath) await removeOrganizationLogo(supabase, newObjectPath)
        return
      }

      const previousObjectPath = getManagedLogoObjectPath(s.business_logo, activeOrg.id)
      if (previousObjectPath && previousObjectPath !== newObjectPath && (selectedLogo || removeLogo)) {
        await removeOrganizationLogo(supabase, previousObjectPath)
      }

      setSelectedLogo(null)
      setRemoveLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch {
      if (newObjectPath) await removeOrganizationLogo(supabase, newObjectPath)
      await showAlert('Logo kaydedilemedi. Lütfen bağlantınızı kontrol edip tekrar deneyin.', 'error')
    } finally {
      setSavingLogo(false)
    }
  }

  const copyLoginLink = async () => {
    if (!activeOrg?.slug) return
    const loginUrl = `${window.location.origin}/login?organization=${encodeURIComponent(activeOrg.slug)}`
    try {
      await navigator.clipboard.writeText(loginUrl)
      await showAlert('Organizasyona özel giriş bağlantısı kopyalandı.', 'success')
    } catch {
      await showAlert('Bağlantı kopyalanamadı. Tarayıcı izinlerini kontrol edin.', 'warning')
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Görünüm ve Marka"
        description="İşletme logonuzu menüde, belgelerde ve organizasyona özel giriş ekranında kullanın."
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-stone-700 bg-stone-950 p-3">
            {previewUrl || (!removeLogo && s.business_logo) ? (
              <SafeUserImage
                src={previewUrl || s.business_logo}
                alt="İşletme logosu önizlemesi"
                width={112}
                height={112}
                className="h-full w-full object-contain"
              />
            ) : (
              <ImagePlus className="size-9 text-stone-600" aria-hidden="true" />
            )}
            {savingLogo && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-950/85 backdrop-blur-sm">
                <span className="size-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap">
              <label
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-extrabold transition-colors ${
                  canManageBranding
                    ? 'cursor-pointer border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15 active:scale-[0.98]'
                    : 'cursor-not-allowed border-stone-800 bg-stone-900 text-stone-600'
                }`}
              >
                <ImagePlus className="size-4" aria-hidden="true" />
                {previewUrl || s.business_logo ? 'Logoyu Değiştir' : 'Logo Seç'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoSelection}
                  disabled={!canManageBranding || savingLogo}
                  className="sr-only"
                />
              </label>
              {(previewUrl || (!removeLogo && s.business_logo)) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLogo(null)
                    setRemoveLogo(true)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  disabled={!canManageBranding || savingLogo}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm font-bold text-stone-300 transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Varsayılana Dön
                </button>
              )}
              <button
                type="button"
                onClick={copyLoginLink}
                disabled={!activeOrg?.slug}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-700 bg-stone-900 px-4 py-2.5 text-sm font-bold text-stone-300 transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Copy className="size-4" aria-hidden="true" />
                Giriş Bağlantısını Kopyala
              </button>
            </div>
            <p className="text-xs leading-5 text-stone-400">
              PNG, JPG veya WebP; en fazla 2 MB. En iyi sonuç için şeffaf arka planlı kare ya da yatay logo kullanın.
            </p>
            {!canManageBranding && (
              <p className="text-xs leading-5 text-amber-400/80">
                Logo değişikliği organizasyon sahibi veya yönetici yetkisi gerektirir.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="İşletme Profili" description="Faturalar ve raporlarda görünecek işletme bilgileri.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="İşletme Adı">
            <Input
              value={s.business_name}
              onChange={(e) => set('business_name', e.target.value)}
              placeholder="Motto Café"
            />
          </FormRow>
          <FormRow label="Telefon Numarası">
            <Input
              value={s.business_phone}
              onChange={(e) => set('business_phone', e.target.value)}
              placeholder="+90 532 000 0000"
            />
          </FormRow>
          <FormRow label="Vergi Numarası">
            <Input
              value={s.business_tax_no}
              onChange={(e) => set('business_tax_no', e.target.value)}
              placeholder="1234567890"
            />
          </FormRow>
          <FormRow label="Dil">
            <select
              value={s.language}
              onChange={(e) => set('language', e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
            </select>
          </FormRow>
          <FormRow label="Adres" hint="Z raporu ve belgeler için kullanılır.">
            <Input
              value={s.business_address}
              onChange={(e) => set('business_address', e.target.value)}
              placeholder="Bağcılar Mah. Atatürk Cad. No:12, İstanbul"
            />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Çalışma Saatleri" description="Saatlik gider hesabı ve raporlama için kullanılır.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FormRow label="Açılış Saati">
            <Input type="time" value={s.work_hours_start} onChange={(e) => set('work_hours_start', e.target.value)} />
          </FormRow>
          <FormRow label="Kapanış Saati">
            <Input type="time" value={s.work_hours_end} onChange={(e) => set('work_hours_end', e.target.value)} />
          </FormRow>
          <FormRow label="Aylık Çalışma Günü" hint="Tatil günleri hariç">
            <Input
              type="number"
              value={s.working_days_per_month}
              onChange={(e) => set('working_days_per_month', e.target.value)}
            />
          </FormRow>
          <FormRow label="Günlük Çalışma Saati" hint="Gider paylaştırma için">
            <Input type="number" value={s.daily_work_hours} onChange={(e) => set('daily_work_hours', e.target.value)} />
          </FormRow>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={handleSave} saving={saving || savingLogo} />
      </div>
    </div>
  )
}

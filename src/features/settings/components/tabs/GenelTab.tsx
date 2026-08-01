import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import { useNotification } from '@/components/NotificationProvider'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../ui/SectionCard'
import { FormRow } from '../ui/FormRow'
import { SaveButton } from '../ui/SaveButton'
import { Settings } from '../../types'

type GenelTabProps = {
  s: Settings
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void
  onSave: () => void
  saving: boolean
}

export function GenelTab({ s, set, onSave, saving }: GenelTabProps) {
  const { showAlert } = useNotification()
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const supabase = createClient()

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error } = await supabase.storage.from('motto_assets').upload(`logos/${fileName}`, file, { upsert: true })

    if (error) {
      showAlert('Logo yüklenirken hata oluştu: ' + error.message, 'error')
      setUploadingLogo(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('motto_assets').getPublicUrl(`logos/${fileName}`)

    set('business_logo', publicUrl)
    setUploadingLogo(false)
  }

  return (
    <div className="space-y-6">
      <SectionCard title="İşletme Logosu" description="Menüde ve faturalarda gösterilecek logonuz.">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-stone-950 border-2 border-dashed border-stone-800 flex items-center justify-center overflow-hidden shrink-0 relative p-2">
            {s.business_logo ? (
              <Image src={s.business_logo} alt="Logo" width={96} height={96} className="w-full h-full object-contain" />
            ) : (
              <span className="text-3xl">🏢</span>
            )}
            {uploadingLogo && (
              <div className="absolute inset-0 bg-stone-950/80 flex items-center justify-center backdrop-blur-sm">
                <span className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="bg-stone-800 hover:bg-stone-700 text-white font-extrabold px-4 py-2 rounded-xl cursor-pointer transition-colors text-xs border border-stone-700 inline-block mb-2 relative overflow-hidden active:scale-95">
              {s.business_logo ? 'Logoyu Değiştir' : 'Logo Yükle'}
              <input
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                onChange={handleLogoUpload}
                disabled={uploadingLogo}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
            <p className="text-stone-400 text-[11px]">PNG, JPG veya SVG. Kare veya yatay format önerilir.</p>
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
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

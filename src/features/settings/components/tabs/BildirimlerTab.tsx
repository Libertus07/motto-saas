import { SectionCard } from '../ui/SectionCard'
import { FormRow } from '../ui/FormRow'
import { Toggle } from '../ui/Toggle'
import { SaveButton } from '../ui/SaveButton'
import { Input } from '@/components/ui/input'
import { Settings } from '../../types'

type BildirimlerTabProps = {
  s: Settings
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void
  onSave: () => void
  saving: boolean
}

export function BildirimlerTab({ s, set, onSave, saving }: BildirimlerTabProps) {
  return (
    <div className="space-y-6">
      <SectionCard title="Uygulama Bildirimleri" description="Dashboard'da hangi uyarı türleri gösterilsin?">
        <div>
          <Toggle
            checked={s.notify_critical_stock}
            onChange={v => set('notify_critical_stock', v)}
            label="Kritik Stok Uyarısı"
            description="Bir hammadde kritik stok seviyesinin altına düştüğünde uyar."
          />
          <Toggle
            checked={s.notify_low_margin}
            onChange={v => set('notify_low_margin', v)}
            label="Düşük Kâr Marjı Uyarısı"
            description="Hedef marjın altında kalan ürünler için uyarı göster."
          />
          <Toggle
            checked={s.notify_daily_revenue}
            onChange={v => set('notify_daily_revenue', v)}
            label="Günlük Ciro Hedefi Bildirimi"
            description="Günlük ciro hedefine ulaşıldığında bildirim al."
          />
          <Toggle
            checked={s.notify_supplier_price}
            onChange={v => set('notify_supplier_price', v)}
            label="Tedarikçi Fiyat Değişimi"
            description="Hammadde fiyatları güncellendiğinde uyarı ver."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="WhatsApp Bildirimleri"
        description="Kritik uyarılar ve stok listeleri WhatsApp'a gönderilebilir."
      >
        <FormRow label="WhatsApp Numarası" hint="Uluslararası formatta girin: +90 532 000 0000">
          <Input
            value={s.whatsapp_number}
            onChange={e => set('whatsapp_number', e.target.value)}
            placeholder="+90 532 000 0000"
          />
        </FormRow>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

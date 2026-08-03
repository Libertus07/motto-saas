import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../ui/SectionCard'
import { FormRow } from '../ui/FormRow'
import { SaveButton } from '../ui/SaveButton'
import { Settings } from '../../types'

type FinansalTabProps = {
  s: Settings
  set: (k: keyof Settings, v: Settings[keyof Settings]) => void
  onSave: () => void
  saving: boolean
  categories: string[]
  setCategories: (cats: string[]) => void
}

export function FinansalTab({ s, set, onSave, saving, categories, setCategories }: FinansalTabProps) {
  const [newCat, setNewCat] = useState('')

  const handleAddCat = () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    const updated = [...categories, newCat.trim()]
    setCategories(updated)
    set('material_categories', updated)
    setNewCat('')
  }

  const handleRemoveCat = (cat: string) => {
    const updated = categories.filter((c) => c !== cat)
    setCategories(updated)
    set('material_categories', updated)
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Fiyat & Maliyet Ayarları" description="Hesaplama motorlarının temel parametreleri.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Hedef Minimum Kâr Marjı (%)" hint="Bu değerin altındaki ürünler kırmızı uyarı verir.">
            <div className="flex gap-2 items-center">
              <Input type="number" value={s.target_margin} onChange={(e) => set('target_margin', e.target.value)} />
              <span className="text-amber-400 font-extrabold text-sm">%</span>
            </div>
          </FormRow>
          <FormRow label="Paket Servis Oranı (%)" hint="Yapay zeka reçete ve ambalaj maliyet hesabı için.">
            <div className="flex gap-2 items-center">
              <Input type="number" value={s.takeaway_ratio} onChange={(e) => set('takeaway_ratio', e.target.value)} />
              <span className="text-amber-400 font-extrabold text-sm">%</span>
            </div>
          </FormRow>
          <FormRow label="Varsayılan KDV Oranı (%)">
            <select
              value={s.default_vat}
              onChange={(e) => set('default_vat', e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            >
              <option value="1">%1</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </FormRow>
          <FormRow label="Para Birimi">
            <select
              value={s.currency}
              onChange={(e) => set('currency', e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            >
              <option value="TRY">₺ Türk Lirası (TRY)</option>
              <option value="USD">$ Amerikan Doları (USD)</option>
              <option value="EUR">€ Euro (EUR)</option>
            </select>
          </FormRow>
          <FormRow label="Fiyat Yuvarlama Kuralı" hint="₺34.15 için ne yapılsın?">
            <select
              value={s.price_rounding}
              onChange={(e) => set('price_rounding', e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            >
              <option value="nearest">En Yakın Tam Sayı (₺34)</option>
              <option value="ceil">Yukarı Yuvarla (₺35)</option>
              <option value="floor">Aşağı Yuvarla (₺34)</option>
              <option value="nearest5">En Yakın 5&apos;e Yuvarla (₺35)</option>
              <option value="none">Yuvarlama Yapma</option>
            </select>
          </FormRow>
          <FormRow label="Gider Paylaştırma Yöntemi">
            <select
              value={s.cost_method}
              onChange={(e) => set('cost_method', e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-all"
            >
              <option value="equal">Eşit Dağıtım</option>
              <option value="revenue">Ciro Ağırlıklı</option>
              <option value="hybrid">Hibrit (%50 Eşit + %50 Ciro)</option>
            </select>
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Stok & Sayım Ayarları" description="Depo yönetimi ve sayım hatırlatıcı kuralları.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Aylık Sabit Sayım Günü" hint="Her ayın hangi günü sayım yapılması gerekiyor? (1-31)">
            <Input
              type="number"
              value={s.inventory_count_day}
              onChange={(e) => set('inventory_count_day', e.target.value)}
              placeholder="1"
            />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Hammadde Kategorileri" description="Hammadde listesinde filtreleme ve gruplamada kullanılır.">
        <div className="flex gap-2 mb-4">
          <Input
            type="text"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCat()}
            placeholder="Yeni kategori ekle..."
          />
          <button
            onClick={handleAddCat}
            className="bg-stone-800 hover:bg-stone-700 text-white px-4 py-2 rounded-xl text-xs font-extrabold border border-stone-700 transition-colors active:scale-95"
          >
            + Ekle
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {categories.map((cat, i) => (
            <div
              key={i}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 flex items-center justify-between"
            >
              <span className="text-stone-200 text-xs font-semibold">{cat}</span>
              <button
                onClick={() => handleRemoveCat(cat)}
                className="text-stone-500 hover:text-rose-400 text-xs transition-colors p-1"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

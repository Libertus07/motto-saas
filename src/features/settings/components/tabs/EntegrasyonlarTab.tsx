import { SectionCard } from '../ui/SectionCard'

export function EntegrasyonlarTab() {
  const integrations = [
    { name: 'Paraşüt', description: 'Muhasebe yazılımı entegrasyonu', icon: '📑', tag: 'Yakında' },
    { name: 'Logo', description: 'ERP entegrasyonu', icon: '🔗', tag: 'Yakında' },
    { name: 'İyzico / PayTR', description: 'Online ödeme entegrasyonu', icon: '💳', tag: 'Yakında' },
    { name: 'Getir / Yemeksepeti', description: 'Paket sipariş platformları', icon: '🛵', tag: 'Yakında' }
  ]

  return (
    <div className="space-y-6">
      <SectionCard
        title="POS Sistemi"
        description="Mevcut kasa sisteminizle bağlantı kurarak satışları otomatik aktarın."
      >
        <div className="border border-dashed border-stone-800 rounded-2xl p-6 text-center bg-stone-950/40">
          <p className="text-stone-400 text-xs font-bold mb-1">🖥️ Entegrasyon Desteği Yakında</p>
          <p className="text-stone-500 text-[11px]">
            Destek verilecek POS sistemleri: Adisyo, Linga, Lightspeed, SquarePOS
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Diğer Entegrasyonlar" description="İşletme yazılımlarınızla Motto'yu birbirine bağlayın.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {integrations.map(int => (
            <div
              key={int.name}
              className="flex items-center justify-between bg-stone-950 border border-stone-800 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.icon}</span>
                <div>
                  <p className="text-white font-bold text-xs sm:text-sm">{int.name}</p>
                  <p className="text-stone-400 text-[11px]">{int.description}</p>
                </div>
              </div>
              <span className="bg-stone-900 text-stone-400 border border-stone-800 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                {int.tag}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

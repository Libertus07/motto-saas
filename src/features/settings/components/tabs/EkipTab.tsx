import { SectionCard } from '../ui/SectionCard'

export function EkipTab() {
  const teamMembers = [{ name: 'Yönetici', email: 'yonetici@motto.com', role: 'Yönetici', status: 'active' }]

  return (
    <div className="space-y-6">
      <SectionCard title="Ekip Üyeleri" description="Sisteme erişim izni olan kullanıcılar.">
        <div className="space-y-3 mb-6">
          {teamMembers.map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-stone-950 border border-stone-800 rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 font-extrabold text-xs border border-amber-500/30">
                  {m.name[0]}
                </div>
                <div>
                  <p className="text-white font-bold text-xs sm:text-sm">{m.name}</p>
                  <p className="text-stone-400 text-[11px]">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-500/20">
                  {m.role}
                </span>
                <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/20">
                  Aktif
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-dashed border-stone-800 rounded-2xl p-6 text-center bg-stone-950/40">
          <p className="text-stone-400 text-xs font-bold mb-1">🚀 Çok Yakında</p>
          <p className="text-stone-500 text-[11px]">
            Ekip üyesi davet etme, yetkilendirme ve rol yönetimi yakında aktif olacak.
          </p>
        </div>
      </SectionCard>
    </div>
  )
}

'use client'

import { BarChart3, Boxes, ShieldCheck, Sparkles } from 'lucide-react'

import { LoginBrandLogo, useLoginBranding } from './LoginBrandingProvider'

const capabilities = [
  {
    icon: Boxes,
    title: 'Stok ve maliyet kontrolü',
    description: 'Hammadde, reçete ve maliyet akışını tek merkezden izleyin.',
  },
  {
    icon: BarChart3,
    title: 'Karar odaklı raporlar',
    description: 'Finansal görünürlüğü anlaşılır ve güncel verilerle güçlendirin.',
  },
  {
    icon: Sparkles,
    title: 'Yapay zekâ desteği',
    description: 'Operasyonel veriyi daha hızlı aksiyona dönüştürün.',
  },
]

export function LoginBrandPanel() {
  const { businessName } = useLoginBranding()

  return (
    <section className="relative hidden min-h-[100svh] overflow-hidden border-r border-white/8 bg-stone-950 lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16 xl:py-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-amber-500/10 blur-[120px]" />
        <div className="absolute -bottom-52 right-[-8rem] size-[38rem] rounded-full bg-orange-800/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      </div>

      <div className="relative z-10 flex items-center gap-4">
        <div className="overflow-hidden rounded-2xl border border-amber-200/15 bg-[#efe2cf] shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
          <LoginBrandLogo className="size-[72px] object-contain" />
        </div>
        <div>
          <p className="max-w-xs truncate text-lg font-black tracking-[-0.02em] text-white">{businessName}</p>
          <p className="mt-0.5 text-xs font-semibold tracking-[0.16em] text-amber-400/80 uppercase">Restoran zekâsı</p>
        </div>
      </div>

      <div className="relative z-10 max-w-2xl py-12">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-amber-400/15 bg-amber-400/8 px-3.5 py-2 text-xs font-bold text-amber-300">
          <Sparkles className="size-4" aria-hidden="true" />
          Operasyonunuzu tek merkezden yönetin
        </div>

        <h1 className="max-w-xl text-5xl leading-[1.04] font-black tracking-[-0.045em] text-balance text-white xl:text-6xl">
          İşletmenizi veriye dayalı güvenle büyütün.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-stone-400 xl:text-lg xl:leading-8">
          Stoktan maliyete, reçeteden finansal performansa kadar tüm operasyonunuz için yalın ve güçlü bir yönetim
          deneyimi.
        </p>

        <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-white/8 bg-white/[0.035] p-4 backdrop-blur-sm transition-colors hover:border-amber-400/20 hover:bg-white/[0.055]"
            >
              <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-amber-400/15 bg-amber-400/10 text-amber-300">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h2 className="text-sm leading-5 font-bold text-stone-100">{title}</h2>
              <p className="mt-2 text-xs leading-5 text-stone-500">{description}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between gap-6 border-t border-white/8 pt-6">
        <div className="flex items-center gap-2.5 text-sm font-medium text-stone-400">
          <ShieldCheck className="size-4 text-emerald-400" aria-hidden="true" />
          Güvenli ve işletmeye özel erişim
        </div>
        <p className="text-xs text-stone-600">© {new Date().getFullYear()} Motto</p>
      </div>
    </section>
  )
}

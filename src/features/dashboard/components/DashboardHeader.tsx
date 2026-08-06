import Link from 'next/link'
import { ArrowRight, BarChart3, PackagePlus, Sparkles } from 'lucide-react'

type DashboardHeaderProps = {
  organizationName: string
}

const currentDate = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  weekday: 'long',
}).format(new Date())

export function DashboardHeader({ organizationName }: DashboardHeaderProps) {
  return (
    <header className="relative overflow-hidden rounded-[1.75rem] border border-amber-400/15 bg-gradient-to-br from-stone-900 via-stone-900 to-amber-950/25 p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-7 lg:p-8">
      <div
        className="pointer-events-none absolute -top-32 right-[-7rem] size-72 rounded-full bg-amber-500/12 blur-[90px]"
        aria-hidden="true"
      />
      <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.12em] uppercase">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/8 px-3 py-1.5 text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.8)]" />
              Canlı görünüm
            </span>
            <span className="text-stone-500">{currentDate}</span>
          </div>
          <p className="text-sm font-semibold text-amber-400">{organizationName}</p>
          <h1 className="mt-2 text-3xl leading-tight font-black tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
            İşletmenizin nabzı tek ekranda.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-400 sm:text-base">
            Finansal performansı, stok sağlığını ve operasyonel öncelikleri hızlıca değerlendirin.
          </p>
        </div>

        <nav aria-label="Hızlı işlemler" className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[510px]">
          <Link
            href="/dashboard/urunler"
            className="group flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm font-bold text-stone-200 transition-colors hover:border-amber-400/30 hover:bg-amber-400/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <span className="flex items-center gap-2">
              <PackagePlus className="size-4 text-amber-400" />
              Ürünler
            </span>
            <ArrowRight className="size-4 text-stone-600 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-400" />
          </Link>
          <Link
            href="/dashboard/stok"
            className="group flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm font-bold text-stone-200 transition-colors hover:border-emerald-400/30 hover:bg-emerald-400/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-emerald-400" />
              Stok
            </span>
            <ArrowRight className="size-4 text-stone-600 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400" />
          </Link>
          <Link
            href="/dashboard/raporlar"
            className="group flex min-h-[44px] items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 text-sm font-bold text-stone-200 transition-colors hover:border-blue-400/30 hover:bg-blue-400/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="flex items-center gap-2">
              <BarChart3 className="size-4 text-blue-400" />
              Raporlar
            </span>
            <ArrowRight className="size-4 text-stone-600 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-400" />
          </Link>
        </nav>
      </div>
    </header>
  )
}

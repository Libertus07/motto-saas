import Link from 'next/link'
import { ArrowUpRight, Banknote, Landmark, PieChart, WalletCards } from 'lucide-react'

import { formatCurrency } from '@/lib/format'

import type { DashboardStats } from '../types'

type FinancialOverviewProps = {
  loading: boolean
  stats: DashboardStats
}

export function FinancialOverview({ loading, stats }: FinancialOverviewProps) {
  const totalAssets = stats.totalCash + stats.totalBank + stats.totalInvestments
  const cards = [
    {
      label: 'Nakit kasa',
      value: stats.totalCash,
      icon: Banknote,
      accent: 'text-emerald-400',
      surface: 'bg-emerald-400/8 border-emerald-400/15',
    },
    {
      label: 'Banka hesapları',
      value: stats.totalBank,
      icon: Landmark,
      accent: 'text-blue-400',
      surface: 'bg-blue-400/8 border-blue-400/15',
    },
    {
      label: 'Yatırımlar',
      value: stats.totalInvestments,
      icon: WalletCards,
      accent: 'text-violet-400',
      surface: 'bg-violet-400/8 border-violet-400/15',
      href: '/dashboard/yatirimlar',
    },
  ]

  return (
    <section id="tour-dash-financials" aria-labelledby="financial-overview-title" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">Varlıklar</p>
          <h2 id="financial-overview-title" className="mt-1 text-xl font-black tracking-tight text-white">
            Finansal özet
          </h2>
        </div>
        <span className="rounded-full border border-white/8 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold text-stone-400">
          Anlık durum
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ accent, href, icon: Icon, label, surface, value }) => {
          const content = (
            <>
              <div className={`flex size-11 items-center justify-center rounded-2xl border ${surface} ${accent}`}>
                <Icon className="size-5" />
              </div>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-stone-500 uppercase">{label}</p>
                  <p className={`mt-1 truncate text-2xl font-black tracking-tight ${accent}`}>
                    {loading ? '—' : formatCurrency(value)}
                  </p>
                </div>
                {href ? (
                  <ArrowUpRight className="mb-1 size-4 shrink-0 text-stone-600 transition-colors group-hover:text-violet-400" />
                ) : null}
              </div>
            </>
          )

          return href ? (
            <Link
              key={label}
              href={href}
              className="group rounded-3xl border border-white/8 bg-stone-900/65 p-5 shadow-lg transition-all hover:-translate-y-0.5 hover:border-violet-400/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {content}
            </Link>
          ) : (
            <article key={label} className="rounded-3xl border border-white/8 bg-stone-900/65 p-5 shadow-lg">
              {content}
            </article>
          )
        })}

        <article className="relative overflow-hidden rounded-3xl border border-amber-400/25 bg-gradient-to-br from-amber-400/14 via-stone-900 to-stone-900 p-5 shadow-[0_18px_45px_rgba(245,158,11,0.08)]">
          <div className="absolute -right-12 -top-12 size-32 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="relative flex size-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
            <PieChart className="size-5" />
          </div>
          <div className="relative mt-5">
            <p className="text-xs font-bold tracking-wide text-amber-300/65 uppercase">Toplam net varlık</p>
            <p className="mt-1 truncate text-2xl font-black tracking-tight text-amber-300">
              {loading ? '—' : formatCurrency(totalAssets)}
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}

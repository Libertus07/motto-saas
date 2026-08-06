import Link from 'next/link'
import { ArrowRight, CircleAlert, PackageOpen, Send } from 'lucide-react'

import type { DashboardStats } from '../types'

type DashboardAlertsProps = {
  onOpenCriticalStock: () => void
  stats: DashboardStats
}

export function DashboardAlerts({ onOpenCriticalStock, stats }: DashboardAlertsProps) {
  if (stats.criticalStockCount === 0 && stats.lowMarginProducts === 0) return null

  const whatsappMessage = encodeURIComponent(
    `*Acil Sipariş Listesi*\n\n${stats.criticalItems.map((item) => `- ${item.name} (Kalan: ${item.stock_quantity} ${item.unit})`).join('\n')}`,
  )

  return (
    <section id="tour-dash-alerts" aria-labelledby="dashboard-alerts-title" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">Öncelikler</p>
          <h2 id="dashboard-alerts-title" className="mt-1 text-xl font-black tracking-tight text-white">
            Bugün dikkatinizi bekleyenler
          </h2>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {stats.criticalStockCount > 0 ? (
          <article className="rounded-3xl border border-red-400/20 bg-red-400/[0.065] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-400">
                <PackageOpen className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-red-200">Kritik stok uyarısı</p>
                <p className="mt-1 text-sm leading-6 text-red-200/65">
                  <strong className="text-white">{stats.criticalStockCount} hammadde</strong> güvenli stok seviyesinin
                  altında.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onOpenCriticalStock}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 px-4 text-sm font-bold text-red-100 transition-colors hover:bg-red-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                Detayları incele
                <ArrowRight className="size-4" />
              </button>
              <a
                href={`https://wa.me/?text=${whatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-400 px-4 text-sm font-black text-red-950 transition-colors hover:bg-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              >
                <Send className="size-4" />
                Sipariş listesi
              </a>
            </div>
          </article>
        ) : null}

        {stats.lowMarginProducts > 0 ? (
          <article className="rounded-3xl border border-orange-400/20 bg-orange-400/[0.06] p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-400/10 text-orange-400">
                <CircleAlert className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-orange-200">Düşük kâr marjı</p>
                <p className="mt-1 text-sm leading-6 text-orange-200/65">
                  <strong className="text-white">{stats.lowMarginProducts} ürün</strong>, %{stats.targetMargin} hedef
                  marjının altında.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/fiyat-motoru"
              className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-orange-400 px-4 text-sm font-black text-orange-950 transition-colors hover:bg-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"
            >
              Fiyat motorunda incele
              <ArrowRight className="size-4" />
            </Link>
          </article>
        ) : null}
      </div>
    </section>
  )
}

import {
  Boxes,
  CircleAlert,
  ClipboardList,
  PackageCheck,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { formatCurrency } from '@/lib/format'

import type { DashboardStats } from '../types'

type OperationsOverviewProps = {
  loading: boolean
  onOpenCriticalStock: () => void
  stats: DashboardStats
}

type ProfitRowProps = {
  icon: typeof TrendingUp
  label: string
  tone: string
  value: number
}

function ProfitRow({ icon: Icon, label, tone, value }: ProfitRowProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/7 bg-black/20 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.035] ${tone}`}>
          <Icon className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold text-stone-400">{label}</span>
      </div>
      <strong className={`shrink-0 text-sm font-black sm:text-base ${tone}`}>{formatCurrency(value)}</strong>
    </div>
  )
}

export function OperationsOverview({ loading, onOpenCriticalStock, stats }: OperationsOverviewProps) {
  const margin = stats.grossRevenue > 0 ? (stats.netProfit / stats.grossRevenue) * 100 : 0
  const isProfitable = stats.netProfit >= 0
  const metrics = [
    { label: 'Kayıtlı ürün', value: stats.totalProducts, icon: ClipboardList, tone: 'text-amber-400' },
    { label: 'Hammadde', value: stats.totalIngredients, icon: Boxes, tone: 'text-blue-400' },
    {
      label: 'Stok değeri',
      value: formatCurrency(stats.totalStockValue),
      icon: PackageCheck,
      tone: 'text-emerald-400',
    },
  ]

  return (
    <section aria-labelledby="operations-title" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">Son 30 gün</p>
          <h2 id="operations-title" className="mt-1 text-xl font-black tracking-tight text-white">
            Operasyonel analiz
          </h2>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
        <article
          id="tour-dash-pnl"
          className="relative overflow-hidden rounded-[1.75rem] border border-white/8 bg-stone-900/65 p-5 shadow-xl sm:p-6"
        >
          <div
            className={`pointer-events-none absolute -right-20 -top-20 size-52 rounded-full blur-[80px] ${isProfitable ? 'bg-emerald-400/10' : 'bg-red-400/10'}`}
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-stone-500 uppercase">Dönem sonucu</p>
              <h3 className="mt-1 text-lg font-black text-white">Net kâr / zarar</h3>
            </div>
            <div className="sm:text-right">
              <p
                className={`text-3xl font-black tracking-[-0.04em] sm:text-4xl ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {loading ? '—' : `${isProfitable ? '+' : ''}${formatCurrency(stats.netProfit)}`}
              </p>
              <span
                className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${isProfitable ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-300' : 'border-red-400/20 bg-red-400/8 text-red-300'}`}
              >
                Net marj %{margin.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="relative mt-6 grid gap-2 sm:grid-cols-2">
            <ProfitRow icon={TrendingUp} label="Brüt satışlar" value={stats.grossRevenue} tone="text-blue-400" />
            <ProfitRow icon={Receipt} label="İndirim ve ikramlar" value={stats.totalDiscounts} tone="text-red-400" />
            <ProfitRow icon={Wallet} label="Net satış" value={stats.netRevenue} tone="text-emerald-400" />
            <ProfitRow icon={Boxes} label="Satılan mal maliyeti" value={stats.totalCogs} tone="text-orange-400" />
            <div className="sm:col-span-2">
              <ProfitRow
                icon={TrendingDown}
                label="Operasyonel giderler"
                value={stats.monthlyExpenses}
                tone="text-rose-400"
              />
            </div>
          </div>
        </article>

        <div className="grid grid-cols-2 gap-3">
          {metrics.map(({ icon: Icon, label, tone, value }) => (
            <article key={label} className="rounded-3xl border border-white/8 bg-stone-900/65 p-4 shadow-lg sm:p-5">
              <Icon className={`size-5 ${tone}`} />
              <p className="mt-5 text-[0.68rem] font-bold tracking-wide text-stone-500 uppercase">{label}</p>
              <p className={`mt-1 truncate text-2xl font-black tracking-tight ${tone}`}>{loading ? '—' : value}</p>
            </article>
          ))}
          <button
            type="button"
            disabled={stats.criticalStockCount === 0}
            onClick={onOpenCriticalStock}
            className={`rounded-3xl border p-4 text-left shadow-lg transition-colors sm:p-5 ${stats.criticalStockCount > 0 ? 'border-red-400/25 bg-red-400/[0.065] hover:bg-red-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400' : 'cursor-default border-white/8 bg-stone-900/65'}`}
          >
            <CircleAlert className={`size-5 ${stats.criticalStockCount > 0 ? 'text-red-400' : 'text-stone-600'}`} />
            <p className="mt-5 text-[0.68rem] font-bold tracking-wide text-stone-500 uppercase">Kritik stok</p>
            <p
              className={`mt-1 text-2xl font-black ${stats.criticalStockCount > 0 ? 'text-red-400' : 'text-stone-400'}`}
            >
              {loading ? '—' : stats.criticalStockCount}
            </p>
          </button>
        </div>
      </div>
    </section>
  )
}

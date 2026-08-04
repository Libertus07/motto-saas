import { formatCurrency } from '@/lib/format'

type InventoryMetricsProps = {
  totalMaterialsCount: number
  totalStockValue: number
  criticalMaterialsCount: number
  currentMonthLossCost: number
}

export function InventoryMetrics(props: InventoryMetricsProps) {
  const metrics = [
    {
      label: 'Toplam Stok Kalemi',
      value: `${props.totalMaterialsCount} Kalem`,
      detail: 'Aktif Depo Hammaddesi',
      icon: '📦',
      color: 'text-white',
    },
    {
      label: 'Toplam Stok Değeri',
      value: formatCurrency(props.totalStockValue),
      detail: 'Mevcut Depo Maliyeti',
      icon: '💰',
      color: 'text-amber-400',
    },
    {
      label: 'Kritik Stok Uyarısı',
      value: `${props.criticalMaterialsCount} Ürün`,
      detail: props.criticalMaterialsCount > 0 ? 'Kritik Seviyenin Altında!' : 'Tüm Stoklar Yeterli',
      icon: '🚨',
      color: props.criticalMaterialsCount > 0 ? 'text-rose-400' : 'text-emerald-400',
    },
    {
      label: 'Bu Ayki Fire/Zayi',
      value: formatCurrency(props.currentMonthLossCost),
      detail: 'Aylık Fire/Zayi Zarar Tutarı',
      icon: '🔥',
      color: 'text-rose-400',
    },
  ]
  return (
    <section id="tour-stock-kpis" className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" aria-label="Stok özeti">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="relative overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 p-4 shadow-xl backdrop-blur-md sm:p-5"
        >
          <div className="mb-2 flex items-start justify-between">
            <span className="text-xs font-semibold text-stone-400">{metric.label}</span>
            <span className="rounded-xl border border-stone-700 bg-stone-950/50 p-2 text-base">{metric.icon}</span>
          </div>
          <div className={`text-xl font-black sm:text-2xl ${metric.color}`}>{metric.value}</div>
          <div className="mt-1 text-[11px] text-stone-400">{metric.detail}</div>
        </article>
      ))}
    </section>
  )
}

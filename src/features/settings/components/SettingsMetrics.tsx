import type { Settings } from '../types'

type SettingsMetricsProps = { settings: Settings; categoryCount: number; activeNotificationCount: number }

export function SettingsMetrics({ settings, categoryCount, activeNotificationCount }: SettingsMetricsProps) {
  const metrics = [
    {
      label: 'İşletme Adı',
      value: settings.business_name || 'Motto Café',
      hint: 'Aktif İşletme Profili',
      icon: '🏪',
      color: 'text-blue-400',
    },
    {
      label: 'Hedef Kâr Marjı',
      value: `%${settings.target_margin}`,
      hint: 'Motor Hesaplama Hedefi',
      icon: '💰',
      color: 'text-amber-400',
    },
    {
      label: 'Aktif Kategoriler',
      value: `${categoryCount} Kategori`,
      hint: 'Hammadde Grupları',
      icon: '📦',
      color: 'text-emerald-400',
    },
    {
      label: 'Aktif Bildirimler',
      value: `${activeNotificationCount} / 4 Açık`,
      hint: 'Uyarı & Ciro Takibi',
      icon: '🔔',
      color: 'text-rose-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
      {metrics.map((metric) => (
        <article
          key={metric.label}
          className="overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-900/80 p-4 shadow-xl backdrop-blur-md sm:p-5"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <span className="text-xs font-semibold text-stone-400">{metric.label}</span>
            <span className={`rounded-xl border border-stone-700/50 bg-stone-950/40 p-2 text-base ${metric.color}`}>
              {metric.icon}
            </span>
          </div>
          <div className={`truncate text-lg font-black sm:text-xl ${metric.color}`}>{metric.value}</div>
          <div className="mt-1 text-[11px] text-stone-400">{metric.hint}</div>
        </article>
      ))}
    </div>
  )
}

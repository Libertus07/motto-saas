import { formatCurrency } from '@/lib/format'

import type { MovementGroup } from '../../movement-utils'

const movementPresentation: Record<string, { label: string; color: string; background: string; prefix: string }> = {
  giris: { label: 'Giriş', color: 'text-green-400', background: 'bg-green-900/20', prefix: '+' },
  cikis: { label: 'Çıkış', color: 'text-red-400', background: 'bg-red-900/20', prefix: '-' },
  fire: { label: 'Fire', color: 'text-orange-400', background: 'bg-orange-900/20', prefix: '-' },
  sayim: { label: 'Sayım Düzeltmesi', color: 'text-blue-400', background: 'bg-blue-900/20', prefix: '+' },
}

export function MovementGroupList({
  groups,
  collapsedDates,
  onToggleDate,
}: {
  groups: MovementGroup[]
  collapsedDates: ReadonlySet<string>
  onToggleDate: (dateKey: string) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-8 text-center text-stone-400">
        Bu filtrelere uygun hareket bulunamadı.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isCollapsed = collapsedDates.has(group.dateKey)
        return (
          <section key={group.dateKey} className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
            <button
              type="button"
              onClick={() => onToggleDate(group.dateKey)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center justify-between bg-stone-950/50 px-4 py-3 text-left transition-colors hover:bg-stone-800"
            >
              <span className="flex items-center gap-3">
                <span className="font-bold text-amber-400">{group.dateLabel}</span>
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-400">
                  {group.items.length} işlem
                </span>
              </span>
              <span className="text-sm text-stone-500">{isCollapsed ? '▼ Görüntüle' : '▲ Daralt'}</span>
            </button>

            {!isCollapsed ? (
              <div className="w-full overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-stone-800/50">
                      <th className="w-24 px-4 py-2 text-left text-xs text-stone-500">Saat</th>
                      <th className="px-4 py-2 text-left text-xs text-stone-500">Hammadde</th>
                      <th className="w-32 px-4 py-2 text-left text-xs text-stone-500">Tür</th>
                      <th className="w-28 px-4 py-2 text-right text-xs text-stone-500">Miktar</th>
                      <th className="w-32 px-4 py-2 text-right text-xs text-stone-500">B. Fiyat</th>
                      <th className="px-4 py-2 text-left text-xs text-stone-500">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((movement) => {
                      const presentation = movementPresentation[movement.movement_type] ?? movementPresentation.sayim
                      const time = new Date(movement.created_at).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                      return (
                        <tr
                          key={movement.id}
                          className="border-b border-stone-800/30 transition-colors last:border-0 hover:bg-stone-800/50"
                        >
                          <td className="px-4 py-2 text-sm text-stone-400">{time}</td>
                          <td className="px-4 py-2 font-medium text-stone-200">{movement.materials?.name}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${presentation.color} ${presentation.background}`}
                            >
                              {presentation.label}
                            </span>
                          </td>
                          <td className={`px-4 py-2 text-right font-bold ${presentation.color}`}>
                            {presentation.prefix}
                            {movement.quantity}{' '}
                            <span className="text-xs font-normal opacity-70">{movement.materials?.unit}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-sm text-stone-400">
                            {movement.unit_price ? formatCurrency(movement.unit_price) : '-'}
                          </td>
                          <td
                            className="max-w-[200px] truncate px-4 py-2 text-sm text-stone-400"
                            title={movement.note || ''}
                          >
                            {movement.note || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

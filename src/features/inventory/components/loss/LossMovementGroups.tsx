import { formatCurrency } from '@/lib/format'

import type { LossMovementGroup } from '../../loss-analysis'

type LossMovementGroupsProps = {
  groups: LossMovementGroup[]
  expandedDates: string[]
  onToggleDate: (dateKey: string) => void
}

export function LossMovementGroups({ groups, expandedDates, onToggleDate }: LossMovementGroupsProps) {
  if (!groups.length) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-8 text-center text-stone-400">
        Bu filtrelere uygun fire/zayi kaydı bulunamadı.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedDates.includes(group.dateKey)
        return (
          <section key={group.dateKey} className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
            <button
              type="button"
              onClick={() => onToggleDate(group.dateKey)}
              aria-expanded={isExpanded}
              className="flex w-full items-center justify-between bg-stone-950/50 px-4 py-3 text-left transition-colors hover:bg-stone-800"
            >
              <span className="flex items-center gap-3">
                <strong className="text-amber-400">{group.dateKey}</strong>
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-xs text-stone-400">
                  {group.items.length} kayıt
                </span>
              </span>
              <span className="flex items-center gap-4">
                <strong className="text-red-400">{formatCurrency(group.total)}</strong>
                <span className="text-sm text-stone-500">{isExpanded ? '▼' : '▶'}</span>
              </span>
            </button>

            {isExpanded ? (
              <div className="w-full overflow-x-auto border-t border-stone-800/50">
                <table className="w-full min-w-[760px]">
                  <thead>
                    <tr className="border-b border-stone-800/30 text-xs text-stone-500">
                      <th className="w-24 px-4 py-2 text-left">Saat</th>
                      <th className="px-4 py-2 text-left">Hammadde</th>
                      <th className="w-28 px-4 py-2 text-right">Miktar</th>
                      <th className="w-32 px-4 py-2 text-right">Birim Fiyat</th>
                      <th className="w-32 px-4 py-2 text-right">Toplam Zarar</th>
                      <th className="px-4 py-2 text-left">Not</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((movement) => (
                      <tr
                        key={movement.id}
                        className="border-b border-stone-800/20 transition-colors last:border-0 hover:bg-stone-800/40"
                      >
                        <td className="px-4 py-3 text-sm text-stone-400">
                          {new Date(movement.created_at).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 font-medium text-stone-200">{movement.materials?.name}</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-400">
                          {movement.quantity}{' '}
                          <span className="text-xs font-normal opacity-70">{movement.materials?.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-stone-400">
                          {formatCurrency(movement.unit_price || 0)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-400">
                          {formatCurrency(movement.quantity * (movement.unit_price || 0))}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-3 text-sm text-stone-400"
                          title={movement.note || ''}
                        >
                          {movement.note || '-'}
                        </td>
                      </tr>
                    ))}
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

import { formatCurrency, formatDate } from '@/lib/format'

import type { InvestmentTransaction } from '../types'

const transactionPresentation: Record<string, { label: string; className: string; prefix: string }> = {
  buy: { label: 'İlk Alım', className: 'border-amber-500/20 bg-amber-500/10 text-amber-400', prefix: '-' },
  rent: { label: 'Kira Geliri', className: 'border-green-500/20 bg-green-500/10 text-green-400', prefix: '+' },
  value_update: {
    label: 'Değer Güncellemesi',
    className: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    prefix: '',
  },
  sell: { label: 'Satış', className: 'border-stone-700 bg-stone-800 text-stone-400', prefix: '+' },
}

export function InvestmentTransactionTable({ transactions }: { transactions: InvestmentTransaction[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-800 bg-stone-800/30 text-stone-400">
          <tr>
            <th className="px-5 py-2.5 font-medium">İşlem Tarihi</th>
            <th className="px-5 py-2.5 font-medium">İşlem Türü</th>
            <th className="px-5 py-2.5 font-medium">Açıklama / Not</th>
            <th className="px-5 py-2.5 text-right font-medium">Tutar / Değer</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-800/50">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-4 text-center text-stone-500">
                Bu yatırıma ait hiçbir hareket bulunamadı.
              </td>
            </tr>
          ) : (
            transactions.map((transaction) => {
              const presentation = transactionPresentation[transaction.transaction_type] ?? {
                label: 'İşlem',
                className: 'border-stone-700 bg-stone-800 text-stone-400',
                prefix: '+',
              }
              return (
                <tr key={transaction.id} className="transition-colors hover:bg-stone-800/20">
                  <td className="whitespace-nowrap px-5 py-3 text-stone-400">
                    {transaction.created_at ? formatDate(transaction.created_at) : '-'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-md border px-2 py-1 text-xs font-bold ${presentation.className}`}>
                      {presentation.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-stone-300">{transaction.notes || '-'}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-bold text-white">
                    {presentation.prefix}
                    {formatCurrency(transaction.total_amount)}
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

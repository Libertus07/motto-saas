import { formatCurrency, formatDate } from '@/lib/format'

import type { EnhancedInvestment, InvestmentListActions, InvestmentTransaction } from '../types'
import { InvestmentTransactionTable } from './InvestmentTransactionTable'

type InvestmentCardProps = InvestmentListActions & {
  investment: EnhancedInvestment
  transactions: InvestmentTransaction[]
  isExpanded: boolean
  onToggle: () => void
}

const assetPresentation: Record<string, { icon: string; unit: string }> = {
  gold: { icon: '🥇', unit: 'Gram' },
  usd: { icon: '💵', unit: 'USD' },
  eur: { icon: '💶', unit: 'EUR' },
  real_estate: { icon: '🏠', unit: '' },
}

export function InvestmentCard({
  investment,
  transactions,
  isExpanded,
  onToggle,
  onRent,
  onUpdateValue,
  onNote,
  onDoc,
  documentPreviewLoadingReference,
  onEdit,
  onDelete,
}: InvestmentCardProps) {
  const presentation = assetPresentation[investment.asset_type] ?? { icon: '💼', unit: '' }

  return (
    <article className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900 transition-all duration-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full cursor-pointer flex-col justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-stone-800/30 sm:flex-row sm:items-center"
      >
        <span className="flex flex-1 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-800 bg-stone-950 text-2xl shadow-inner">
            {presentation.icon}
          </span>
          <span>
            <span className="block text-lg font-bold text-stone-200">{investment.name}</span>
            <span className="mt-0.5 block text-xs text-stone-500">
              {!investment.isRE ? (
                <span className="mr-2 font-medium text-stone-400">
                  {formatCurrency(investment.quantity)} {presentation.unit}
                </span>
              ) : null}
              {investment.purchase_date ? <span>📅 {formatDate(investment.purchase_date)}</span> : null}
            </span>
          </span>
        </span>

        <span className="flex w-full items-center justify-between gap-6 pl-16 sm:w-auto sm:justify-end sm:pl-0">
          <span className="text-left sm:text-right">
            <span className="mb-0.5 block text-xs font-bold text-stone-400">Güncel Değer</span>
            <span className="block text-lg font-bold text-white">{formatCurrency(investment.currentValue)}</span>
            <span
              className={`mt-0.5 block text-xs font-bold ${investment.isProfit ? 'text-green-400' : 'text-red-400'}`}
            >
              {investment.isProfit ? 'Kâr: +' : 'Zarar: '}
              {formatCurrency(investment.profit)}
            </span>
          </span>
          <span
            className={`p-2 text-stone-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            ▼
          </span>
        </span>
      </button>

      {isExpanded ? (
        <div className="border-t border-stone-800 bg-stone-900/50">
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-800 bg-stone-950/30 px-5 py-3">
            {investment.isRE ? (
              <>
                <button
                  type="button"
                  onClick={() => onRent(investment)}
                  className="flex items-center gap-2 rounded-lg border border-green-600/30 bg-green-600/20 px-3 py-1.5 text-xs font-bold text-green-400 transition-colors hover:bg-green-600/40"
                >
                  💰 Kira Tahsil Et
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateValue(investment)}
                  className="flex items-center gap-2 rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-stone-700"
                >
                  📈 Değeri Güncelle
                </button>
              </>
            ) : null}
            {investment.notes ? (
              <button
                type="button"
                onClick={() => onNote(investment.notes!)}
                className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-stone-300 transition-colors hover:bg-stone-700"
              >
                📝 Notlar
              </button>
            ) : null}
            {investment.document_url ? (
              <button
                type="button"
                onClick={() => void onDoc(investment.document_url!)}
                disabled={documentPreviewLoadingReference === investment.document_url}
                aria-busy={documentPreviewLoadingReference === investment.document_url}
                className="flex items-center gap-2 rounded-lg border border-blue-600/30 bg-blue-600/20 px-3 py-1.5 text-xs font-bold text-blue-400 transition-colors hover:bg-blue-600/40 disabled:cursor-wait disabled:opacity-60"
              >
                📎 Belge
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onEdit(investment)}
              className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-stone-400 transition-colors hover:bg-amber-500/20 hover:text-amber-400"
            >
              ✏️ Düzenle
            </button>
            <button
              type="button"
              onClick={() => onDelete(investment.id)}
              className="flex items-center gap-2 rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-bold text-stone-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
            >
              🗑️ Sil
            </button>
          </div>
          <InvestmentTransactionTable transactions={transactions} />
        </div>
      ) : null}
    </article>
  )
}

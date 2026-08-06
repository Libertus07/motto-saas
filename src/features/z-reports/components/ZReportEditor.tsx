import { formatCurrency } from '@/lib/format'
import type { ParsedExpenseItem, ParsedSaleItem } from '../types'
import type { ZReportWorkspace } from '../hooks/useZReportWorkspace'
import { normalizeZReportText } from '../z-report-utils'

export function ZReportEditor({ workspace }: { workspace: ZReportWorkspace }) {
  const report = workspace.parsedData
  if (!report) return null

  const updateSale = (index: number, patch: Partial<ParsedSaleItem>) => {
    workspace.setParsedData((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
          }
        : current,
    )
  }
  const updateExpense = (index: number, patch: Partial<ParsedExpenseItem>) => {
    workspace.setParsedData((current) =>
      current
        ? {
            ...current,
            expenses: current.expenses.map((expense, expenseIndex) =>
              expenseIndex === index ? { ...expense, ...patch } : expense,
            ),
          }
        : current,
    )
  }
  const totalRevenue = report.items.reduce((total, item) => total + Number(item.total_price || 0), 0)
  const totalExpenses = report.expenses.reduce((total, expense) => total + Number(expense.amount || 0), 0)
  const paymentMethods = report.payment_methods ?? { cash: 0, credit_card: 0, other: 0 }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 rounded-xl border border-green-500/30 bg-green-900/20 p-4 sm:p-6 lg:grid-cols-[minmax(180px,1fr)_auto]">
        <label className="block text-sm text-stone-400">
          Rapor Tarihi
          <input
            type="date"
            value={report.date}
            onChange={(event) => workspace.setParsedData({ ...report, date: event.target.value })}
            className="mt-1 min-h-11 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-white focus:border-amber-400 focus:outline-none sm:w-auto"
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricInput
            label="Nakit Tahsilat"
            value={paymentMethods.cash}
            onChange={(cash) => workspace.setParsedData({ ...report, payment_methods: { ...paymentMethods, cash } })}
          />
          <MetricInput
            label="Kart/POS"
            value={paymentMethods.credit_card}
            onChange={(credit_card) =>
              workspace.setParsedData({ ...report, payment_methods: { ...paymentMethods, credit_card } })
            }
          />
          <Metric label="Toplam Ciro" value={formatCurrency(totalRevenue)} />
          <Metric label="Net Kasa" value={formatCurrency(paymentMethods.cash - totalExpenses)} accent />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
        <div className="border-b border-stone-800 bg-stone-800/50 p-4">
          <h2 className="font-bold text-stone-200">Satış Kalemleri ve Eşleşmeler</h2>
          <p className="mt-1 text-sm text-stone-400">
            Eşleşmeyen ürünlerin stokları düşülmez; kaydetmeden önce kontrol edin.
          </p>
        </div>
        <datalist id="z-report-products">
          {workspace.products.map((product) => (
            <option key={product.id} value={product.name} />
          ))}
        </datalist>
        <div className="divide-y divide-stone-800">
          {report.items.map((item, index) => (
            <div
              key={`${index}-${item.product_name}`}
              className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_0.8fr_1fr_2fr_auto] lg:items-end"
            >
              <Field label="Fişteki adı">
                <input
                  value={item.product_name}
                  list="z-report-products"
                  onChange={(event) => {
                    const name = event.target.value
                    const matched = workspace.products.find(
                      (product) => normalizeZReportText(product.name) === normalizeZReportText(name),
                    )
                    updateSale(index, { product_name: name, matchedProductId: matched?.id })
                  }}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Satılan ürün"
                />
              </Field>
              <Field label="Adet">
                <input
                  type="number"
                  min="0.001"
                  value={item.quantity}
                  onChange={(event) => updateSale(index, { quantity: Number(event.target.value) || 0 })}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-center text-sm font-bold text-amber-400 focus:border-amber-400 focus:outline-none"
                />
              </Field>
              <Field label="Tutar (₺)">
                <input
                  type="number"
                  min="0"
                  value={item.total_price}
                  onChange={(event) => updateSale(index, { total_price: Number(event.target.value) || 0 })}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-right text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </Field>
              <Field label="Sistemdeki ürün">
                <div className="flex gap-2">
                  <select
                    value={item.matchedProductId ?? ''}
                    onChange={(event) => updateSale(index, { matchedProductId: event.target.value || undefined })}
                    className={`min-h-11 w-full rounded-lg border bg-stone-800 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none ${item.matchedProductId ? 'border-green-700 text-green-400' : 'border-red-700 text-red-400'}`}
                  >
                    <option value="">Eşleşmedi</option>
                    {workspace.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  {!item.matchedProductId && (
                    <button
                      type="button"
                      title="Yeni ürün ekle"
                      disabled={!item.product_name.trim()}
                      onClick={() =>
                        workspace.setNewProductModal({
                          isOpen: true,
                          itemIndex: index,
                          name: item.product_name,
                          price: item.quantity > 0 ? Number((item.total_price / item.quantity).toFixed(2)) : 0,
                          category: 'Genel',
                        })
                      }
                      className="min-h-11 rounded-lg border border-stone-700 bg-stone-800 px-3 disabled:opacity-50"
                    >
                      ➕
                    </button>
                  )}
                </div>
              </Field>
              <button
                type="button"
                aria-label={`${item.product_name || 'Satış'} satırını sil`}
                onClick={() =>
                  workspace.setParsedData({
                    ...report,
                    items: report.items.filter((_, itemIndex) => itemIndex !== index),
                  })
                }
                className="min-h-11 rounded-lg px-3 text-red-400 hover:bg-red-950/30 hover:text-red-300"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <AddRowButton
          label="+ Yeni Satış Ekle"
          onClick={workspace.addManualSale}
          className="text-amber-400 border-amber-400/50 hover:bg-amber-400/10"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-800 bg-stone-900">
        <div className="border-b border-stone-800 bg-stone-800/50 p-4">
          <h2 className="font-bold text-stone-200">Günlük Giderler</h2>
          <p className="mt-1 text-sm text-stone-400">Kasadan çıkan günlük harcamaları kaydedin.</p>
        </div>
        <datalist id="z-expense-categories">
          {['Personel', 'Mutfak', 'Temizlik', 'Kurye', 'Fatura', 'İndirim', 'Diğer'].map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>
        <div className="divide-y divide-stone-800">
          {report.expenses.map((expense, index) => (
            <div
              key={`${index}-${expense.expense_name}`}
              className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr_auto] lg:items-end"
            >
              <Field label="Gider adı">
                <input
                  value={expense.expense_name}
                  onChange={(event) => updateExpense(index, { expense_name: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Gider açıklaması"
                />
              </Field>
              <Field label="Kategori">
                <input
                  list="z-expense-categories"
                  value={expense.category ?? ''}
                  onChange={(event) => updateExpense(index, { category: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </Field>
              <Field label="Tutar (₺)">
                <input
                  type="number"
                  min="0"
                  value={expense.amount}
                  onChange={(event) => updateExpense(index, { amount: Number(event.target.value) || 0 })}
                  className="min-h-11 w-full rounded-lg border border-stone-700 bg-stone-800 px-3 py-2 text-right text-sm text-white focus:border-amber-400 focus:outline-none"
                />
              </Field>
              <button
                type="button"
                aria-label={`${expense.expense_name || 'Gider'} satırını sil`}
                onClick={() =>
                  workspace.setParsedData({
                    ...report,
                    expenses: report.expenses.filter((_, expenseIndex) => expenseIndex !== index),
                  })
                }
                className="min-h-11 rounded-lg px-3 text-red-400 hover:bg-red-950/30"
              >
                ✕
              </button>
            </div>
          ))}
          {!report.expenses.length && <p className="p-8 text-center text-sm text-stone-500">Henüz gider eklenmedi.</p>}
        </div>
        <AddRowButton
          label="+ Yeni Gider Ekle"
          onClick={workspace.addManualExpense}
          className="text-red-400 border-red-400/50 hover:bg-red-400/10"
        />
      </section>

      <div className="sticky bottom-0 z-10 grid gap-3 border-t border-stone-800 bg-stone-950/95 py-4 backdrop-blur sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          onClick={() => void workspace.approve()}
          disabled={workspace.loading || !report.items.length}
          className="min-h-14 rounded-xl bg-amber-500 px-6 py-4 text-lg font-bold text-stone-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {workspace.loading ? 'Güvenli Biçimde Kaydediliyor...' : 'Onayla ve Stokları Düş 🚀'}
        </button>
        <button
          type="button"
          onClick={workspace.reset}
          disabled={workspace.loading}
          className="min-h-14 rounded-xl bg-stone-800 px-8 py-4 font-bold text-white hover:bg-stone-700 disabled:opacity-50"
        >
          İptal
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-stone-400">
      <span className="mb-1 block lg:sr-only">{label}</span>
      {children}
    </label>
  )
}
function MetricInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="text-xs text-stone-400">
      {label}
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="mt-1 min-h-11 w-full rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 font-bold text-white focus:border-amber-400 focus:outline-none"
      />
    </label>
  )
}
function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-stone-400">{label}</p>
      <p
        className={`mt-1 flex min-h-11 items-center rounded-lg border bg-stone-900 px-3 font-bold ${accent ? 'border-green-500/30 text-green-400' : 'border-stone-800 text-white'}`}
      >
        {value}
      </p>
    </div>
  )
}
function AddRowButton({ label, onClick, className }: { label: string; onClick: () => void; className: string }) {
  return (
    <div className="border-t border-stone-800 bg-stone-800/20 p-4 text-center">
      <button
        type="button"
        onClick={onClick}
        className={`min-h-11 rounded-lg border px-4 py-2 font-bold transition-colors ${className}`}
      >
        {label}
      </button>
    </div>
  )
}

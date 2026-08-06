type MovementSummaryProps = {
  summary: { total: number; giris: number; cikis: number; control: number }
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function MovementSummary({ summary, onExpandAll, onCollapseAll }: MovementSummaryProps) {
  const metrics = [
    { label: 'Toplam İşlem', value: summary.total, className: 'text-white' },
    { label: 'Girişler', value: summary.giris, className: 'text-green-400' },
    { label: 'Çıkışlar', value: summary.cikis, className: 'text-red-400' },
    { label: 'Düzeltme / Zayi', value: summary.control, className: 'text-amber-400' },
  ]
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex flex-col justify-center rounded-xl border border-stone-800 bg-stone-900 p-4 text-center"
        >
          <span className="mb-1 text-xs text-stone-400">{metric.label}</span>
          <span className={`text-2xl font-bold ${metric.className}`}>{metric.value}</span>
        </div>
      ))}
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-stone-800 bg-stone-900 p-4 text-center">
        <span className="mb-1 w-full text-xs text-stone-400">Görünüm</span>
        <div className="flex w-full justify-center gap-2">
          <button
            type="button"
            onClick={onExpandAll}
            className="flex-1 rounded bg-stone-800 py-1.5 text-xs text-stone-300 hover:bg-stone-700"
          >
            Genişlet
          </button>
          <button
            type="button"
            onClick={onCollapseAll}
            className="flex-1 rounded bg-stone-800 py-1.5 text-xs text-stone-300 hover:bg-stone-700"
          >
            Daralt
          </button>
        </div>
      </div>
    </div>
  )
}

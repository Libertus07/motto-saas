import { formatCurrency } from '@/lib/format'

type MaterialMetricsProps = {
  materialCount: number
  categoryCount: number
  totalValue: number
  criticalCount: number
  activeCategoryCount: number
}

const cardClass = 'bg-stone-900/80 border border-stone-800/80 rounded-2xl p-4 sm:p-5 shadow-xl'

export function MaterialMetrics({
  materialCount,
  categoryCount,
  totalValue,
  criticalCount,
  activeCategoryCount,
}: MaterialMetricsProps) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5" aria-label="Hammadde özeti">
      <div className={cardClass}>
        <p className="text-stone-400 text-xs font-semibold">Toplam Hammadde</p>
        <p className="text-xl sm:text-2xl font-black text-white mt-2">{materialCount}</p>
        <p className="text-stone-400 text-[11px] mt-1">{activeCategoryCount} aktif kategori</p>
      </div>
      <div className={cardClass}>
        <p className="text-stone-400 text-xs font-semibold">Toplam Stok Değeri</p>
        <p className="text-xl sm:text-2xl font-black text-amber-400 mt-2">{formatCurrency(totalValue)}</p>
        <p className="text-stone-400 text-[11px] mt-1">Mevcut depo maliyeti</p>
      </div>
      <div className={cardClass}>
        <p className="text-stone-400 text-xs font-semibold">Kritik Stok Uyarısı</p>
        <p
          className={`text-xl sm:text-2xl font-black mt-2 ${criticalCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}
        >
          {criticalCount} ürün
        </p>
        <p className="text-stone-400 text-[11px] mt-1">
          {criticalCount > 0 ? 'Müdahale gerekiyor' : 'Tüm stoklar yeterli'}
        </p>
      </div>
      <div className={cardClass}>
        <p className="text-stone-400 text-xs font-semibold">Tanımlı Kategoriler</p>
        <p className="text-xl sm:text-2xl font-black text-violet-400 mt-2">{categoryCount}</p>
        <p className="text-stone-400 text-[11px] mt-1">Tedarik ve depo grupları</p>
      </div>
    </section>
  )
}

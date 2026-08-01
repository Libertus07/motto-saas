import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Product, ProductSales, RealSalesMeta } from '../../types'
import { formatCurrency } from '@/lib/format'

type SalesInputTabProps = {
  products: Product[]
  productSales: ProductSales
  realSalesMeta: RealSalesMeta | null
  totalDailyRevenue: number
  updateSales: (productId: string, field: 'dailySales', value: number) => void
  adjustSalesByDelta: (productId: string, delta: number) => void
}

export function SalesInputTab({
  products,
  productSales,
  realSalesMeta,
  totalDailyRevenue,
  updateSales,
  adjustSalesByDelta,
}: SalesInputTabProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü')

  const categoriesList = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || 'Diğer'))
    return ['Tümü', ...Array.from(cats)]
  }, [products])

  const filteredProducts = useMemo(() => {
    let list = [...products]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q))
    }
    if (selectedCategory !== 'Tümü') {
      list = list.filter((p) => (p.category || 'Diğer') === selectedCategory)
    }
    return list
  }, [products, search, selectedCategory])

  return (
    <div className="space-y-4">
      {/* Informational Banner Card */}
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
            📝
          </div>
          <div>
            <h4 className="font-extrabold text-white text-sm sm:text-base">Günlük Satış Tahminleri & Z-Raporu</h4>
            <p className="text-stone-400 text-xs mt-0.5">
              Adetleri değiştirdiğinizde, ciro ağırlıklı gider payı dağıtımı ve fiyat önerileri otomatik yenilenir.
            </p>
          </div>
        </div>

        {realSalesMeta && realSalesMeta.activeDays > 0 && (
          <span className="text-xs bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/20 font-bold whitespace-nowrap self-start md:self-auto">
            ✓ {realSalesMeta.activeDays} Günlük Z-Raporu Otomatik Aktif
          </span>
        )}
      </div>

      {/* Search and Category Filter Bar */}
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı ile arayın..."
            className="pl-9"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Products Table & Cards */}
      <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5">Ürün Adı</th>
                <th className="px-4 py-3.5">Kategori</th>
                <th className="px-4 py-3.5 text-right">Satış Fiyatı (₺)</th>
                <th className="px-4 py-3.5 text-center w-56">Günlük Satış Adedi</th>
                <th className="px-4 py-3.5 text-right">Ciro Payı (%)</th>
                <th className="px-5 py-3.5 text-right">Günlük Ciro (₺)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
              {filteredProducts.map((product) => {
                const salesData = productSales[product.id]
                const sales = salesData?.dailySales || 0
                const isReal = salesData?.isRealData
                const productRev = (product.sale_price || 0) * sales
                const revenuePercent = totalDailyRevenue > 0 ? (productRev / totalDailyRevenue) * 100 : 0

                return (
                  <tr key={product.id} className="hover:bg-stone-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-stone-100 flex items-center gap-2">
                      <span>{product.name}</span>
                      {isReal ? (
                        <span
                          className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold"
                          title="Gerçek Z-Raporu Verisi"
                        >
                          ✓ Z-Raporu
                        </span>
                      ) : (
                        <span
                          className="text-[10px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full border border-stone-700 font-semibold"
                          title="Tahmini/Manuel Veri"
                        >
                          ~ Tahmin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-stone-400 font-medium">{product.category}</td>
                    <td className="px-4 py-3.5 text-right font-extrabold text-amber-400">₺{product.sale_price || 0}</td>
                    <td className="px-4 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => adjustSalesByDelta(product.id, -5)}
                          className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                          title="-5 Adet"
                        >
                          -5
                        </button>
                        <button
                          onClick={() => adjustSalesByDelta(product.id, -1)}
                          className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                          title="-1 Adet"
                        >
                          -1
                        </button>
                        <Input
                          type="number"
                          value={sales || ''}
                          onChange={(e) => updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)}
                          className={`w-16 h-8 px-1 text-center text-xs font-bold ${
                            isReal ? 'border-emerald-500/50' : ''
                          }`}
                          placeholder="0"
                        />
                        <button
                          onClick={() => adjustSalesByDelta(product.id, 1)}
                          className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                          title="+1 Adet"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => adjustSalesByDelta(product.id, 5)}
                          className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-xs font-bold border border-stone-700 transition-colors"
                          title="+5 Adet"
                        >
                          +5
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold text-stone-400">
                      <div className="flex items-center justify-end gap-2">
                        <span>%{revenuePercent.toFixed(1)}</span>
                        <div className="w-12 bg-stone-950 h-1.5 rounded-full overflow-hidden border border-stone-800">
                          <div
                            className="bg-amber-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, revenuePercent)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right font-extrabold text-stone-100">
                      {formatCurrency(productRev)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-stone-950/80 border-t border-stone-800 text-xs font-bold">
                <td colSpan={3} className="px-5 py-3.5 text-stone-300">
                  Toplam
                </td>
                <td className="px-4 py-3.5 text-center font-black text-white">
                  {Object.values(productSales).reduce((t, s) => t + (s.dailySales || 0), 0)} adet
                </td>
                <td className="px-4 py-3.5 text-right font-bold text-stone-400">%100</td>
                <td className="px-5 py-3.5 text-right font-black text-amber-400 text-sm">
                  {formatCurrency(totalDailyRevenue)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-stone-800/60">
          {filteredProducts.map((product) => {
            const salesData = productSales[product.id]
            const sales = salesData?.dailySales || 0
            const isReal = salesData?.isRealData

            return (
              <div key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm flex items-center gap-2">
                    <span>{product.name}</span>
                    {isReal ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                        ✓ Real
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-semibold">
                        ~ Tahmin
                      </span>
                    )}
                  </h4>
                  <span className="text-amber-400 font-extrabold text-sm">₺{product.sale_price || 0}</span>
                </div>

                <div className="flex items-center justify-between bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                  <span className="text-stone-400 font-medium">Günlük Adet:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustSalesByDelta(product.id, -1)}
                      className="w-7 h-7 bg-stone-800 text-white rounded-lg font-bold border border-stone-700 flex items-center justify-center active:scale-95"
                    >
                      -
                    </button>
                    <Input
                      type="number"
                      value={sales || ''}
                      onChange={(e) => updateSales(product.id, 'dailySales', parseInt(e.target.value) || 0)}
                      className="w-16 h-8 px-1 text-center text-xs font-bold"
                    />
                    <button
                      onClick={() => adjustSalesByDelta(product.id, 1)}
                      className="w-7 h-7 bg-stone-800 text-white rounded-lg font-bold border border-stone-700 flex items-center justify-center active:scale-95"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

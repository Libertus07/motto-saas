import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Calculation } from '../../types'

type AnalysisTabProps = {
  calculations: Calculation[]
}

export function AnalysisTab({ calculations }: AnalysisTabProps) {
  const [search, setSearch] = useState('')
  const [analysisFilter, setAnalysisFilter] = useState<'tumu' | 'artirilmali' | 'ideal' | 'indirim'>('tumu')

  const getPriceDiff = (current: number, suggested: number) => {
    const diff = current - suggested
    if (Math.abs(diff) < 2) return null
    return diff
  }

  const getMarginColor = (margin: number) => {
    if (margin >= 55) return 'text-emerald-400 font-bold'
    if (margin >= 35) return 'text-amber-400 font-bold'
    return 'text-rose-400 font-bold'
  }

  const analysisStats = useMemo(() => {
    let ideal = 0
    let artirilmali = 0
    let indirim = 0

    calculations.forEach(c => {
      const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
      if (diff === null) ideal++
      else if (diff < 0) artirilmali++
      else indirim++
    })

    return { ideal, artirilmali, indirim }
  }, [calculations])

  const filteredCalculations = useMemo(() => {
    let list = [...calculations]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        c => c.product.name.toLowerCase().includes(q) || (c.product.category || '').toLowerCase().includes(q)
      )
    }

    if (analysisFilter === 'artirilmali') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff !== null && diff < 0
      })
    } else if (analysisFilter === 'ideal') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff === null
      })
    } else if (analysisFilter === 'indirim') {
      list = list.filter(c => {
        const diff = getPriceDiff(c.product.sale_price || 0, c.suggestedPrice)
        return diff !== null && diff > 0
      })
    }

    return list
  }, [calculations, search, analysisFilter])

  return (
    <div className="space-y-4">
      {/* Analysis Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div
          onClick={() => setAnalysisFilter('ideal')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
            analysisFilter === 'ideal'
              ? 'bg-emerald-500/20 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
              : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-emerald-400 text-xs font-bold uppercase">✓ İdeal Fiyatlananlar</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs">🟢</span>
          </div>
          <div className="text-2xl font-black text-emerald-400">{analysisStats.ideal} Ürün</div>
          <p className="text-stone-400 text-[11px] mt-0.5">Hedef marjı yakalayan uygun fiyatlar</p>
        </div>

        <div
          onClick={() => setAnalysisFilter('artirilmali')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
            analysisFilter === 'artirilmali'
              ? 'bg-rose-500/20 border-rose-500/40 shadow-lg shadow-rose-500/10'
              : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-rose-400 text-xs font-bold uppercase">🚨 Fiyat Artırılmalı</span>
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs">▲</span>
          </div>
          <div className="text-2xl font-black text-rose-400">{analysisStats.artirilmali} Ürün</div>
          <p className="text-stone-400 text-[11px] mt-0.5">Düşük marjlı veya maliyet altı kalanlar</p>
        </div>

        <div
          onClick={() => setAnalysisFilter('indirim')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md ${
            analysisFilter === 'indirim'
              ? 'bg-amber-500/20 border-amber-500/40 shadow-lg shadow-amber-500/10'
              : 'bg-stone-900/80 border-stone-800/80 hover:bg-stone-800/40'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-amber-400 text-xs font-bold uppercase">🟡 İndirim Yapılabilir</span>
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs">▼</span>
          </div>
          <div className="text-2xl font-black text-amber-400">{analysisStats.indirim} Ürün</div>
          <p className="text-stone-400 text-[11px] mt-0.5">Piyasa marjının üstünde yüksek fiyatlılar</p>
        </div>
      </div>

      {/* Search and Analysis Filter Bar */}
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
          <Input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Fiyat analizinde ürün ara..."
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setAnalysisFilter('tumu')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              analysisFilter === 'tumu'
                ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
            }`}
          >
            Tümü ({calculations.length})
          </button>
          <button
            onClick={() => setAnalysisFilter('artirilmali')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              analysisFilter === 'artirilmali'
                ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                : 'bg-stone-950 text-rose-400/80 hover:text-rose-400 border border-stone-800'
            }`}
          >
            🚨 Fiyat Artırılmalı ({analysisStats.artirilmali})
          </button>
          <button
            onClick={() => setAnalysisFilter('ideal')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              analysisFilter === 'ideal'
                ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                : 'bg-stone-950 text-emerald-400/80 hover:text-emerald-400 border border-stone-800'
            }`}
          >
            ✓ İdeal ({analysisStats.ideal})
          </button>
        </div>
      </div>

      {/* Analysis Table & Cards */}
      <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                <th className="px-5 py-3.5">Ürün Adı</th>
                <th className="px-4 py-3.5 text-right">Ham Maliyet</th>
                <th className="px-4 py-3.5 text-right">Gider Payı</th>
                <th className="px-4 py-3.5 text-right">Toplam Maliyet</th>
                <th className="px-4 py-3.5 text-right">Mevcut Fiyat</th>
                <th className="px-4 py-3.5 text-right">Önerilen Fiyat</th>
                <th className="px-4 py-3.5 text-right">Mevcut Marj</th>
                <th className="px-5 py-3.5 text-right">Öneri Durumu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
              {filteredCalculations
                .sort((a, b) => a.currentMargin - b.currentMargin)
                .map(({ product, rawCost, expenseShare, totalCost, suggestedPrice, currentMargin }) => {
                  const diff = getPriceDiff(product.sale_price || 0, suggestedPrice)
                  return (
                    <tr key={product.id} className="hover:bg-stone-800/30 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-stone-100">{product.name}</td>
                      <td className="px-4 py-3.5 text-right text-stone-400">₺{rawCost.toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-right text-stone-400">₺{expenseShare.toFixed(2)}</td>
                      <td className="px-4 py-3.5 text-right font-semibold text-stone-200">
                        ₺{totalCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-bold text-white">
                        ₺{(product.sale_price || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-amber-400 text-sm">
                        ₺{suggestedPrice.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3.5 text-right font-bold ${getMarginColor(currentMargin)}`}>
                        %{currentMargin.toFixed(1)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {diff === null ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                            ✓ Uygun Fiyat
                          </span>
                        ) : diff > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold">
                            ▼ ₺{Math.abs(diff).toFixed(0)} düşür
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold animate-pulse">
                            ▲ ₺{Math.abs(diff).toFixed(0)} artır
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden divide-y divide-stone-800/60">
          {filteredCalculations
            .sort((a, b) => a.currentMargin - b.currentMargin)
            .map(({ product, totalCost, suggestedPrice, currentMargin }) => {
              const diff = getPriceDiff(product.sale_price || 0, suggestedPrice)
              return (
                <div key={product.id} className="p-4 space-y-2.5 hover:bg-stone-800/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-sm">{product.name}</h4>
                    <span className={getMarginColor(currentMargin)}>%{currentMargin.toFixed(1)} Marj</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                    <div>
                      <span className="text-stone-400 block text-[10px]">Mevcut Fiyat</span>
                      <span className="font-bold text-white">₺{(product.sale_price || 0).toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Önerilen Fiyat</span>
                      <span className="font-black text-amber-400">₺{suggestedPrice.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Toplam Maliyet</span>
                      <span className="font-semibold text-stone-300">₺{totalCost.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 block text-[10px]">Öneri Durumu</span>
                      {diff === null ? (
                        <span className="text-emerald-400 font-bold">✓ Uygun</span>
                      ) : diff > 0 ? (
                        <span className="text-amber-400 font-bold">▼ ₺{Math.abs(diff).toFixed(0)} düşür</span>
                      ) : (
                        <span className="text-rose-400 font-bold">▲ ₺{Math.abs(diff).toFixed(0)} artır</span>
                      )}
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

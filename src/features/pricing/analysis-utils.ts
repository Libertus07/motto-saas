import type { Calculation } from './types'

export type PricingAnalysisFilter = 'tumu' | 'artirilmali' | 'ideal' | 'indirim'

export function getPriceDifference(current: number, suggested: number) {
  const difference = current - suggested
  return Math.abs(difference) < 2 ? null : difference
}

export function getMarginColorClass(margin: number) {
  if (margin >= 55) return 'text-emerald-400 font-bold'
  if (margin >= 35) return 'text-amber-400 font-bold'
  return 'text-rose-400 font-bold'
}

export function getPricingAnalysisStats(calculations: Calculation[]) {
  return calculations.reduce(
    (stats, calculation) => {
      const difference = getPriceDifference(calculation.product.sale_price || 0, calculation.suggestedPrice)
      if (difference === null) stats.ideal += 1
      else if (difference < 0) stats.artirilmali += 1
      else stats.indirim += 1
      return stats
    },
    { ideal: 0, artirilmali: 0, indirim: 0 },
  )
}

export function filterPricingCalculations(calculations: Calculation[], search: string, filter: PricingAnalysisFilter) {
  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')

  return calculations
    .filter((calculation) => {
      const searchable = `${calculation.product.name} ${calculation.product.category || ''}`.toLocaleLowerCase('tr-TR')
      if (!searchable.includes(normalizedSearch)) return false
      if (filter === 'tumu') return true

      const difference = getPriceDifference(calculation.product.sale_price || 0, calculation.suggestedPrice)
      if (filter === 'ideal') return difference === null
      if (filter === 'artirilmali') return difference !== null && difference < 0
      return difference !== null && difference > 0
    })
    .sort((left, right) => left.currentMargin - right.currentMargin)
}

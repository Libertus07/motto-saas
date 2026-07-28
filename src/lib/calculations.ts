/**
 * Motto SaaS - Kritik Finansal & Menü Mühendisliği Hesaplama Fonksiyonları
 */

export type BcgCategory = 'Star' | 'Plowhorse' | 'Puzzle' | 'Dog'

/**
 * Ürün Kar Marjı Yüzdesi Hesaplar: ((Satış Fiyatı - Maliyet) / Satış Fiyatı) * 100
 */
export function calculateProfitMargin(salePrice: number, cost: number): number {
  if (!salePrice || salePrice <= 0) return 0
  return ((salePrice - (cost || 0)) / salePrice) * 100
}

/**
 * Net Kar Hesabı: Satış Fiyatı - Birim Maliyet
 */
export function calculateNetProfit(salePrice: number, cost: number): number {
  return (salePrice || 0) - (cost || 0)
}

/**
 * Food Cost (Gıda Maliyeti Yüzdesi): (Birim Maliyet / Satış Fiyatı) * 100
 */
export function calculateFoodCostRatio(cost: number, salePrice: number): number {
  if (!salePrice || salePrice <= 0) return 0
  return ((cost || 0) / salePrice) * 100
}

/**
 * Başa Baş Noktası (Break-even Point) Satış Adedi:
 * Toplam Sabit Giderler / (Ortalama Satış Fiyatı - Ortalama Birim Maliyet)
 */
export function calculateBreakEvenQuantity(
  totalFixedExpenses: number,
  avgSalePrice: number,
  avgCost: number
): number {
  if (!totalFixedExpenses || totalFixedExpenses <= 0) return 0
  const unitContributionMargin = avgSalePrice - avgCost
  if (unitContributionMargin <= 0) return Infinity
  return Math.ceil(totalFixedExpenses / unitContributionMargin)
}

/**
 * Ciro Ağırlıklı Gider Dağıtım Hesabı:
 * Bir ürünün toplam cirodaki payına göre aylık giderden aldığı pay
 */
export function calculateRevenueWeightedExpenseShare(
  productRevenue: number,
  totalRevenue: number,
  totalMonthlyExpenses: number
): number {
  if (!totalRevenue || totalRevenue <= 0 || !productRevenue || productRevenue <= 0) return 0
  return (productRevenue / totalRevenue) * (totalMonthlyExpenses || 0)
}

/**
 * BCG Menü Mühendisliği Kategorisi (Star, Plowhorse, Puzzle, Dog):
 * - High Popularity & High Profitability -> Star (Yıldız)
 * - High Popularity & Low Profitability -> Plowhorse (İş Atı)
 * - Low Popularity & High Profitability -> Puzzle (Soru İşareti)
 * - Low Popularity & Low Profitability -> Dog (Zayıf Ürün)
 */
export function calculateBcgCategory(
  quantitySold: number,
  avgQuantitySold: number,
  profitMargin: number,
  targetMargin: number
): BcgCategory {
  const isHighPopularity = quantitySold >= avgQuantitySold
  const isHighProfitability = profitMargin >= targetMargin

  if (isHighPopularity && isHighProfitability) return 'Star'
  if (isHighPopularity && !isHighProfitability) return 'Plowhorse'
  if (!isHighPopularity && isHighProfitability) return 'Puzzle'
  return 'Dog'
}

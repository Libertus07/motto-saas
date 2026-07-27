import { describe, it, expect } from 'vitest'
import {
  calculateProfitMargin,
  calculateNetProfit,
  calculateFoodCostRatio,
  calculateBreakEvenQuantity,
  calculateRevenueWeightedExpenseShare
} from './calculations'

describe('Kritik Finansal Hesaplama Testleri', () => {
  it('Kar marjını doğru hesaplamalıdır', () => {
    // Satış 100 TL, Maliyet 30 TL => Marj %70
    expect(calculateProfitMargin(100, 30)).toBe(70)
    // Satış 0 veya negatif ise 0 dönmeli
    expect(calculateProfitMargin(0, 30)).toBe(0)
  })

  it('Net karı doğru hesaplamalıdır', () => {
    expect(calculateNetProfit(150, 45)).toBe(105)
  })

  it('Food cost oranını doğru hesaplamalıdır', () => {
    // Maliyet 25 TL, Satış 100 TL => Food Cost %25
    expect(calculateFoodCostRatio(25, 100)).toBe(25)
  })

  it('Başa baş noktası satış adedini doğru hesaplamalıdır', () => {
    // Sabit Gider: 10,000 TL, Satış: 100 TL, Birim Maliyet: 60 TL => Katkı: 40 TL => 250 Adet
    expect(calculateBreakEvenQuantity(10000, 100, 60)).toBe(250)
  })

  it('Ciro ağırlıklı gider dağıtımını doğru hesaplamalıdır', () => {
    // Ürün Ciro: 20,000 TL, Toplam Ciro: 100,000 TL (%20 pay), Aylık Gider: 50,000 TL => 10,000 TL pay
    expect(calculateRevenueWeightedExpenseShare(20000, 100000, 50000)).toBe(10000)
  })
})

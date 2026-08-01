import { describe, it, expect } from 'vitest'
import {
  calculateProfitMargin,
  calculateNetProfit,
  calculateFoodCostRatio,
  calculateBreakEvenQuantity,
  calculateRevenueWeightedExpenseShare,
  calculateBcgCategory,
} from './calculations'

describe('Kritik Finansal Hesaplama Testleri', () => {
  it('Kar marjını doğru hesaplamalıdır', () => {
    // Satış 100 TL, Maliyet 30 TL => Marj %70
    expect(calculateProfitMargin(100, 30)).toBe(70)
  })

  it('Kar marjı uç durumlarında güvenli davranmalıdır (Sıfır/Negatif Satış Fiyatı)', () => {
    expect(calculateProfitMargin(0, 30)).toBe(0)
    expect(calculateProfitMargin(-50, 30)).toBe(0)
  })

  it('Net karı doğru hesaplamalıdır', () => {
    expect(calculateNetProfit(150, 45)).toBe(105)
    expect(calculateNetProfit(30, 50)).toBe(-20)
  })

  it('Food cost oranını doğru hesaplamalıdır', () => {
    expect(calculateFoodCostRatio(25, 100)).toBe(25)
    expect(calculateFoodCostRatio(25, 0)).toBe(0)
  })

  it('Başa baş noktası satış adedini ve uç durumları doğru hesaplamalıdır', () => {
    // Mutlu Yol: Sabit Gider 10000, Satış 100, Maliyet 60 => Katkı 40 => 250 Adet
    expect(calculateBreakEvenQuantity(10000, 100, 60)).toBe(250)

    // Sıfır sabit gider
    expect(calculateBreakEvenQuantity(0, 100, 60)).toBe(0)

    // Negatif veya sıfır katkı payı (Maliyet >= Satış Fiyatı) -> Infinity dönmeli
    expect(calculateBreakEvenQuantity(10000, 50, 50)).toBe(Infinity)
    expect(calculateBreakEvenQuantity(10000, 40, 50)).toBe(Infinity)
  })

  it('Ciro ağırlıklı gider dağıtımını ve uç durumları doğru hesaplamalıdır', () => {
    expect(calculateRevenueWeightedExpenseShare(20000, 100000, 50000)).toBe(10000)
    // Sıfır toplam ciro veya sıfır ürün cirosu
    expect(calculateRevenueWeightedExpenseShare(0, 100000, 50000)).toBe(0)
    expect(calculateRevenueWeightedExpenseShare(20000, 0, 50000)).toBe(0)
  })

  it('BCG Menü Mühendisi matrisi kategorilerini doğru belirlemelidir', () => {
    // Yüksek Popülerlik & Yüksek Marj => Star (Yıldız)
    expect(calculateBcgCategory(100, 50, 45, 35)).toBe('Star')
    // Yüksek Popülerlik & Düşük Marj => Plowhorse (İş Atı)
    expect(calculateBcgCategory(100, 50, 20, 35)).toBe('Plowhorse')
    // Düşük Popülerlik & Yüksek Marj => Puzzle (Soru İşareti)
    expect(calculateBcgCategory(30, 50, 45, 35)).toBe('Puzzle')
    // Düşük Popülerlik & Düşük Marj => Dog (Zayıf Ürün)
    expect(calculateBcgCategory(30, 50, 20, 35)).toBe('Dog')
  })
})

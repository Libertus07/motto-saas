import { describe, expect, it } from 'vitest'
import { findBestProductMatch, matchExpenseCategory, prepareZReportForSave } from './z-report-utils'

describe('Z report utilities', () => {
  it('matches normalized and sufficiently similar product names', () => {
    const products = [{ id: '1', name: 'Coca-Cola', category: 'İçecek' }]
    expect(findBestProductMatch('coca cola', products)?.id).toBe('1')
    expect(findBestProductMatch('CocaCola', products)?.id).toBe('1')
  })

  it('classifies known expense names', () => {
    expect(matchExpenseCategory('Personel Avansı')).toBe('personel')
    expect(matchExpenseCategory('Elektrik Faturası')).toBe('elektrik')
  })

  it('adds discounts as a non-cash expense row for atomic persistence', () => {
    const result = prepareZReportForSave({
      date: '2026-08-03',
      total_revenue: 100,
      items: [],
      expenses: [],
      discounts: { total_amount: 20 },
    })
    expect(result.expenses).toEqual([
      { expense_name: 'Z-Raporu İndirim ve İkramlar', category: 'indirim-ikram', amount: 20 },
    ])
  })
})

import { describe, expect, it } from 'vitest'

import { validateInvestmentReceiptPurchase } from './investment-receipt-validation'

const validPurchase = {
  assetType: 'gold',
  name: 'Altın Alımı',
  quantity: 2,
  pricePerUnit: 2500,
  purchaseDate: '2026-08-09',
  accountId: 'account-1',
  availableAccountIds: ['account-1'],
}

describe('validateInvestmentReceiptPurchase', () => {
  it('accepts a complete purchase before any document upload or RPC call', () => {
    expect(validateInvestmentReceiptPurchase(validPurchase)).toEqual({})
  })

  it.each([
    [0, 'Birim fiyat 0 TL’den büyük olmalıdır.'],
    [-1, 'Birim fiyat 0 TL’den büyük olmalıdır.'],
    [Number.NaN, 'Geçerli bir birim fiyat girin.'],
    [100_000_000, 'Birim fiyat izin verilen üst sınırı aşıyor.'],
  ])('rejects invalid unit price %s with an actionable message', (pricePerUnit, message) => {
    expect(validateInvestmentReceiptPurchase({ ...validPurchase, pricePerUnit })).toMatchObject({
      pricePerUnit: message,
    })
  })

  it('validates all database-required purchase fields', () => {
    expect(
      validateInvestmentReceiptPurchase({
        ...validPurchase,
        assetType: 'other',
        name: ' ',
        quantity: 0,
        purchaseDate: '',
        accountId: 'missing-account',
      }),
    ).toEqual({
      assetType: 'Geçerli bir varlık türü seçin.',
      name: 'Yatırım ismi gereklidir.',
      quantity: 'Miktar 0’dan büyük olmalıdır.',
      purchaseDate: 'Geçerli bir işlem tarihi seçin.',
      accountId: 'Bu işletmeye ait geçerli bir ödeme hesabı seçin.',
    })
  })
})

const MAX_INVESTMENT_VALUE = 99_999_999.9999
const SUPPORTED_ASSET_TYPES = new Set(['gold', 'usd', 'eur', 'real_estate'])

export type InvestmentReceiptValidationField =
  'assetType' | 'name' | 'quantity' | 'pricePerUnit' | 'purchaseDate' | 'accountId'

export type InvestmentReceiptValidationErrors = Partial<Record<InvestmentReceiptValidationField, string>>

type InvestmentReceiptPurchaseInput = {
  assetType: string
  name: string
  quantity: number
  pricePerUnit: number
  purchaseDate: string
  accountId: string
  availableAccountIds: readonly string[]
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateInvestmentReceiptPurchase(
  input: InvestmentReceiptPurchaseInput,
): InvestmentReceiptValidationErrors {
  const errors: InvestmentReceiptValidationErrors = {}

  if (!SUPPORTED_ASSET_TYPES.has(input.assetType)) {
    errors.assetType = 'Geçerli bir varlık türü seçin.'
  }

  const normalizedName = input.name.trim()
  if (!normalizedName) {
    errors.name = 'Yatırım ismi gereklidir.'
  } else if (normalizedName.length > 100) {
    errors.name = 'Yatırım ismi en fazla 100 karakter olabilir.'
  }

  if (!Number.isFinite(input.quantity)) {
    errors.quantity = 'Geçerli bir miktar girin.'
  } else if (input.quantity <= 0) {
    errors.quantity = 'Miktar 0’dan büyük olmalıdır.'
  } else if (input.quantity > MAX_INVESTMENT_VALUE) {
    errors.quantity = 'Miktar izin verilen üst sınırı aşıyor.'
  }

  if (!Number.isFinite(input.pricePerUnit)) {
    errors.pricePerUnit = 'Geçerli bir birim fiyat girin.'
  } else if (input.pricePerUnit <= 0) {
    errors.pricePerUnit = 'Birim fiyat 0 TL’den büyük olmalıdır.'
  } else if (input.pricePerUnit > MAX_INVESTMENT_VALUE) {
    errors.pricePerUnit = 'Birim fiyat izin verilen üst sınırı aşıyor.'
  }

  if (!isValidIsoDate(input.purchaseDate)) {
    errors.purchaseDate = 'Geçerli bir işlem tarihi seçin.'
  }

  if (!input.accountId || !input.availableAccountIds.includes(input.accountId)) {
    errors.accountId = 'Bu işletmeye ait geçerli bir ödeme hesabı seçin.'
  }

  return errors
}

export function getFirstInvestmentReceiptValidationError(errors: InvestmentReceiptValidationErrors): string | null {
  return Object.values(errors)[0] ?? null
}

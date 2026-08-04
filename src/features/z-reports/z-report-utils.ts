import type { ParsedExpenseItem, ParsedZReport, ZReportProduct } from './types'

export function normalizeZReportText(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[\s\-_]+/g, '')
    .replace(/[^a-z0-9ğüşöçı]/g, '')
}

export function levenshteinDistance(first: string, second: string) {
  if (!first.length) return second.length
  if (!second.length) return first.length

  const previous = Array.from({ length: first.length + 1 }, (_, index) => index)
  const current = new Array<number>(first.length + 1)
  for (let row = 1; row <= second.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= first.length; column += 1) {
      current[column] =
        second[row - 1] === first[column - 1]
          ? previous[column - 1]
          : Math.min(previous[column - 1], current[column - 1], previous[column]) + 1
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[first.length]
}

export function findBestProductMatch(productName: string, products: ZReportProduct[]) {
  const target = normalizeZReportText(productName)
  if (!target) return null

  let bestMatch: ZReportProduct | null = null
  let bestScore = 0
  for (const product of products) {
    const candidate = normalizeZReportText(product.name)
    if (candidate === target) return product

    const containsScore = candidate.includes(target) || target.includes(candidate) ? 0.8 : 0
    const similarity = 1 - levenshteinDistance(target, candidate) / Math.max(target.length, candidate.length)
    const score = Math.max(containsScore, similarity)
    if (score > bestScore) {
      bestScore = score
      bestMatch = product
    }
  }
  return bestScore >= 0.6 ? bestMatch : null
}

export function matchExpenseCategory(expenseName: string) {
  const name = expenseName.toLocaleLowerCase('tr-TR')
  if (['kurye', 'personel', 'bahşiş', 'maaş', 'avans'].some((keyword) => name.includes(keyword))) return 'personel'
  if (name.includes('elektrik')) return 'elektrik'
  if (name.includes('su') || name.includes('damacana')) return 'su'
  if (['doğalgaz', 'dogalgaz', 'tüp'].some((keyword) => name.includes(keyword))) return 'dogalgaz'
  if (['internet', 'telefon', 'ttnet', 'turkcell'].some((keyword) => name.includes(keyword))) return 'internet'
  if (['muhasebe', 'mali', 'noter'].some((keyword) => name.includes(keyword))) return 'muhasebe'
  if (name.includes('kira') || name.includes('stopaj')) return 'kira'
  if (['sigorta', 'sgk', 'kasko'].some((keyword) => name.includes(keyword))) return 'sigorta'
  if (['pazarlama', 'reklam', 'sponsor'].some((keyword) => name.includes(keyword))) return 'pazarlama'
  return 'diger'
}

export function prepareZReportForSave(report: ParsedZReport) {
  const expenses: ParsedExpenseItem[] = [
    ...(report.expenses ?? []),
    ...((report.discounts?.total_amount ?? 0) > 0
      ? [{ expense_name: 'Z-Raporu İndirim ve İkramlar', category: 'indirim-ikram', amount: report.discounts?.total_amount ?? 0 }]
      : []),
  ]

  return {
    sales: report.items.map((item) => ({
      product_id: item.matchedProductId ?? null,
      quantity: item.quantity,
      total_price: item.total_price,
    })),
    expenses,
  }
}

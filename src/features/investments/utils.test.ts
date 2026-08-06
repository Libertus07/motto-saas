import { describe, expect, it } from 'vitest'

import type { Investment, InvestmentTransaction } from './types'
import { buildInvestmentPortfolio } from './utils'

const investments = [
  {
    id: 'gold-1',
    asset_type: 'gold',
    name: 'Gram Altın',
    quantity: 2,
    average_cost: 100,
    current_manual_value: null,
    purchase_date: '2026-01-10',
    created_at: '2026-01-10T00:00:00Z',
  },
  {
    id: 'home-1',
    asset_type: 'real_estate',
    name: 'Dükkan',
    quantity: 1,
    average_cost: 1000,
    current_manual_value: 1500,
    purchase_date: '2026-02-10',
    created_at: '2026-02-10T00:00:00Z',
  },
] as Investment[]

const transactions = [
  { investment_id: 'home-1', transaction_type: 'rent', total_amount: 100 },
  { investment_id: 'gold-1', transaction_type: 'buy', total_amount: 200 },
] as InvestmentTransaction[]

describe('investment portfolio calculations', () => {
  it('calculates market value, rent and total profit in one pass', () => {
    const portfolio = buildInvestmentPortfolio({
      investments,
      transactions,
      rates: { gold: 150, usd: 1, eur: 1 },
      groupBy: 'type',
      sortBy: 'value',
      sortOrder: 'desc',
    })

    expect(portfolio.totalCostValue).toBe(1200)
    expect(portfolio.totalCurrentValue).toBe(1800)
    expect(portfolio.totalRentIncome).toBe(100)
    expect(portfolio.totalProfit).toBe(700)
    expect(portfolio.investments.map((investment) => investment.id)).toEqual(['home-1', 'gold-1'])
    expect(portfolio.groups['Gayrimenkul Mülkleri']).toHaveLength(1)
  })

  it('falls back to average cost when a live rate is unavailable', () => {
    const portfolio = buildInvestmentPortfolio({
      investments: [investments[0]],
      transactions: [],
      rates: null,
      groupBy: 'month',
      sortBy: 'date',
      sortOrder: 'asc',
    })

    expect(portfolio.totalCurrentValue).toBe(200)
    expect(Object.values(portfolio.groups).flat()).toHaveLength(1)
  })
})

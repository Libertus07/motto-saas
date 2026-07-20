import { Investment, InvestmentTransaction } from '@/types/database';

export type Account = {
    id: string
    name: string
    type: string
    balance: number
}

export type Rates = {
    gold: number
    usd: number
    eur: number
} | null

export type BuyFormState = {
    asset_type: 'gold' | 'usd' | 'eur' | 'real_estate'
    quantity: string
    price_per_unit: string
    account_id: string
    notes: string
    purchase_date: string
    document_url: string
}

export type RentFormState = {
    amount: string
    account_id: string
}

export type EditFormState = {
    name: string
    quantity: string
    average_cost: string
    notes: string
    purchase_date: string
    document_url: string
}

export type ValueFormState = {
    current_value: string
}

export type EnhancedInvestment = Investment & {
    isRE: boolean
    currentRate: number
    currentValue: number
    costValue: number
    invRentIncome: number
    profit: number
    isProfit: boolean
}

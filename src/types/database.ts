export interface Material {
    id: string;
    name: string;
    unit: string;
    price_per_unit: number;
    category: string | null;
    critical_stock_level: number | null;
    stock_quantity: number | null;
    created_at: string;
    updated_at: string;
}

export interface Investment {
    id: string;
    asset_type: 'gold' | 'usd' | 'eur' | 'real_estate' | string;
    name: string;
    quantity: number;
    average_cost: number;
    current_manual_value?: number;
    notes?: string;
    purchase_date?: string;
    document_url?: string;
    created_at?: string;
    updated_at?: string;
}

export interface InvestmentTransaction {
    id: string;
    investment_id: string;
    transaction_type: 'buy' | 'sell' | 'rent' | 'value_update';
    quantity: number;
    price_per_unit: number;
    total_amount: number;
    quantity_changed?: number;
    notes?: string;
    account_id: string | null;
    created_at?: string;
}

export interface ParsedReceiptItem {
    name: string;
    category: string;
    quantity: number;
    unit: string;
    boxMultiplier: number | null;
    totalPrice: number;
    unitPrice: number;
}

export interface ParsedReceiptData {
    supplier_name: string;
    supplier_phone: string | null;
    supplier_iban: string | null;
    supplier_address: string | null;
    supplier_stated_debt: number | null;
    invoice_date: string;
    total_amount: number;
    items: ParsedReceiptItem[];
}

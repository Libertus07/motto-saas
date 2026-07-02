-- Lütfen bu kodların TAMAMINI kopyalayıp Supabase SQL Editor'de çalıştırın.

-- 1. sales tablosuna batch_id ekleme
ALTER TABLE sales ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 2. stock_movements tablosuna batch_id ekleme
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 3. suppliers tablosuna total_debt (toplam borç) ekleme
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_debt DECIMAL(12, 2) DEFAULT 0;

-- 4. supplier_transactions (Cari İşlemler) tablosunu oluşturma
CREATE TABLE IF NOT EXISTS supplier_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    transaction_type TEXT NOT NULL, -- 'invoice' veya 'payment'
    note TEXT,
    batch_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. expenses tablosuna batch_id ekleme
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS batch_id UUID;

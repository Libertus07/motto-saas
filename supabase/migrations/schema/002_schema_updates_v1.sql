-- ==============================================================================
-- 002_schema_updates_v1.sql
-- ==============================================================================
-- Bu dosya proje geliştirilirken sonradan eklenen ALTER TABLE ve ufak eklemeleri
-- (batch_id, document_url, yeni sütunlar) kronolojik sırayla bir araya getirir.
-- ==============================================================================

-- 1. materials (Hammaddeler) tablosuna category kolonu ekle
ALTER TABLE materials ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Diğer';

-- 2. suppliers (Tedarikçiler) tablosuna telefon, iban ve adres kolonları ekle
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS iban VARCHAR(100);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_debt DECIMAL(12, 2) DEFAULT 0;

-- 3. supplier_transactions (Cari İşlemler) tablosunu oluşturma
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

-- 4. Batch ID eklemeleri (Atomik işlemler için)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS batch_id UUID;

-- 5. Document URL (Görsel/Fatura Kaydı) Eklemeleri
ALTER TABLE sales ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS document_url TEXT;

-- 6. Yatırımlar tablosuna özellik ve tarih güncellemeleri
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS transaction_date DATE;

ALTER TABLE investments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS purchase_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS document_url TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS current_manual_value DECIMAL(12, 4) DEFAULT 0;

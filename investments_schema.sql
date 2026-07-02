-- Yatırımlar (Cüzdan/Portföy) Tablosu
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type VARCHAR(50) NOT NULL, -- Örn: 'gold', 'usd', 'eur'
    name VARCHAR(100) NOT NULL, -- Örn: 'Gram Altın', 'Amerikan Doları'
    quantity DECIMAL(12, 4) DEFAULT 0, -- Sahip olunan miktar
    average_cost DECIMAL(12, 4) DEFAULT 0, -- Birim başına ortalama alış maliyeti (TL)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Yatırım İşlem Geçmişi (Alış/Satış)
CREATE TABLE IF NOT EXISTS investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID REFERENCES investments(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL, -- 'buy' (Alış) veya 'sell' (Satış)
    quantity DECIMAL(12, 4) NOT NULL, -- İşlem yapılan miktar
    price_per_unit DECIMAL(12, 4) NOT NULL, -- İşlem anındaki birim fiyat (TL)
    total_amount DECIMAL(12, 4) NOT NULL, -- Toplam tutar (TL)
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, -- Hangi kasa/bankadan ödendi veya girdi
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS İzinleri (Geliştirme için açık)
ALTER TABLE investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions DISABLE ROW LEVEL SECURITY;

-- Güvence amaçlı public access
DROP POLICY IF EXISTS "Public investments access" ON investments;
CREATE POLICY "Public investments access" ON investments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public investment_transactions access" ON investment_transactions;
CREATE POLICY "Public investment_transactions access" ON investment_transactions FOR ALL USING (true) WITH CHECK (true);

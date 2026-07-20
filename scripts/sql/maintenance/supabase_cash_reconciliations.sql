-- Kasa Mutabakatları Tablosu
CREATE TABLE IF NOT EXISTS cash_reconciliations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    
    counted_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
    counted_credit_card DECIMAL(10,2) NOT NULL DEFAULT 0,
    counted_meal_card DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    expected_cash DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_credit_card DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_meal_card DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    cash_variance DECIMAL(10,2) NOT NULL DEFAULT 0,
    credit_card_variance DECIMAL(10,2) NOT NULL DEFAULT 0,
    meal_card_variance DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    status VARCHAR(20) NOT NULL, -- 'MATCH', 'OVERAGE', 'SHORTAGE'
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Herkesin bu tabloya okuma ve yazma yapabilmesi için temel RLS politikası (Motto-SaaS demo ortamı için)
ALTER TABLE cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON cash_reconciliations FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON cash_reconciliations FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON cash_reconciliations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON cash_reconciliations FOR DELETE USING (true);

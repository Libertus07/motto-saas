-- ==============================================================================
-- 001_initial_schema.sql
-- ==============================================================================
-- MOTTO SAAS - FİYAT MOTORU VERİTABANI ŞEMASI (SUPABASE POSTGRESQL)
-- ==============================================================================

DROP TABLE IF EXISTS product_ingredients CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS sub_recipe_ingredients CASCADE;
DROP TABLE IF EXISTS sub_recipes CASCADE;
DROP TABLE IF EXISTS materials CASCADE;

-- 1. materials (Hammaddeler) Tablosu
CREATE TABLE materials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50) NOT NULL, -- Örn: Litre, Kg, Adet
    price_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. sub_recipes (Yarı Mamuller / Ön Hazırlıklar) Tablosu
CREATE TABLE sub_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- Örn: 1 Tepsi Profiterol
    yield_quantity DECIMAL(10, 2) NOT NULL DEFAULT 1, -- Örn: 15 (porsiyon)
    yield_unit VARCHAR(50) NOT NULL, -- Örn: Porsiyon, Dilim
    wastage_percent DECIMAL(5, 2) DEFAULT 0, -- Örn: %5 mutfak firesi
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. sub_recipe_ingredients (Yarı Mamul İçerikleri) Tablosu
CREATE TABLE sub_recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_recipe_id UUID REFERENCES sub_recipes(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id) ON DELETE RESTRICT,
    quantity DECIMAL(10, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. products (Nihai Satış Ürünleri) Tablosu
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
    estimated_monthly_sales INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. product_ingredients (Nihai Ürün Reçetesi - Composite)
CREATE TABLE product_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id) ON DELETE RESTRICT,
    sub_recipe_id UUID REFERENCES sub_recipes(id) ON DELETE RESTRICT,
    quantity DECIMAL(10, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    -- SADECE BİRİ DOLU OLABİLİR
    CONSTRAINT check_ingredient_type CHECK (
        (material_id IS NOT NULL AND sub_recipe_id IS NULL) OR
        (material_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);

-- ==============================================================================
-- SETTINGS TABLOSU
-- ==============================================================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

INSERT INTO settings (key, value) VALUES
    ('business_name', '"Motto Café"'),
    ('business_address', '""'),
    ('business_phone', '""'),
    ('business_tax_no', '""'),
    ('work_hours_start', '"08:00"'),
    ('work_hours_end', '"22:00"'),
    ('working_days_per_month', '"26"'),
    ('daily_work_hours', '"14"'),
    ('language', '"tr"'),
    ('theme', '"dark"'),
    ('target_margin', '"35"'),
    ('takeaway_ratio', '"60"'),
    ('default_vat', '"10"'),
    ('currency', '"TRY"'),
    ('price_rounding', '"nearest"'),
    ('cost_method', '"equal"'),
    ('notify_critical_stock', 'true'),
    ('notify_low_margin', 'true'),
    ('notify_daily_revenue', 'false'),
    ('notify_supplier_price', 'false'),
    ('whatsapp_number', '""'),
    ('material_categories', '["Süt Ürünleri", "Kuru Gıda", "Ambalaj ve Sarf", "Kahve & Çay", "Manav", "Şuruplar ve Soslar", "Temizlik", "Diğer"]'),
    ('expense_categories', '{"kira": "Kira", "personel": "Personel", "elektrik": "Elektrik", "su": "Su", "dogalgaz": "Doğalgaz", "internet": "İnternet", "muhasebe": "Muhasebe", "sigorta": "Sigorta", "pazarlama": "Pazarlama", "diger": "Diğer"}')
ON CONFLICT (key) DO NOTHING;

-- ==============================================================================
-- ACTIVITY LOGS TABLOSU
-- ==============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    module VARCHAR(100) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    details JSONB,
    user_id VARCHAR(100) DEFAULT 'Yönetici'
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module);

-- ==============================================================================
-- YATIRIMLAR ŞEMASI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(12, 4) DEFAULT 0,
    average_cost DECIMAL(12, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID REFERENCES investments(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL,
    quantity DECIMAL(12, 4) NOT NULL,
    price_per_unit DECIMAL(12, 4) NOT NULL,
    total_amount DECIMAL(12, 4) NOT NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE investments DISABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public investments access" ON investments;
CREATE POLICY "Public investments access" ON investments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public investment_transactions access" ON investment_transactions;
CREATE POLICY "Public investment_transactions access" ON investment_transactions FOR ALL USING (true) WITH CHECK (true);

-- ==============================================================================
-- STORAGE BUCKET (MOTTO ASSETS)
-- ==============================================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('motto_assets', 'motto_assets', true)
ON CONFLICT DO NOTHING;

CREATE POLICY "Public Okuma Izinleri" ON storage.objects 
FOR SELECT USING ( bucket_id = 'motto_assets' );

CREATE POLICY "Giris Yapanlar Yukleyebilir" ON storage.objects 
FOR INSERT TO authenticated WITH CHECK ( bucket_id = 'motto_assets' );

CREATE POLICY "Sahibi Guncelleyebilir" ON storage.objects 
FOR UPDATE TO authenticated USING ( bucket_id = 'motto_assets' AND auth.uid() = owner);

CREATE POLICY "Sahibi Silebilir" ON storage.objects 
FOR DELETE TO authenticated USING ( bucket_id = 'motto_assets' AND auth.uid() = owner);

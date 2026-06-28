-- ==============================================================================
-- MOTTO SAAS - FİYAT MOTORU VERİTABANI ŞEMASI (SUPABASE POSTGRESQL)
-- ==============================================================================

-- DİKKAT: Aşağıdaki satırlar eski tabloları ve içindeki verileri SİLER.
-- Temiz bir başlangıç yapmak için açıktır.
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

-- 2. sub_recipes (Yarı Mamuller / Toplu Üretim) Tablosu
CREATE TABLE sub_recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- Örn: Tepsi Profiterol
    yield_quantity DECIMAL(10, 2) NOT NULL DEFAULT 1, -- Örn: 10
    yield_unit VARCHAR(50) NOT NULL, -- Örn: Porsiyon
    wastage_percent DECIMAL(5, 2) NOT NULL DEFAULT 0, -- Örn: 5 (Yüzde 5 fire)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. sub_recipe_ingredients (Yarı Mamul İçerikleri) Tablosu
CREATE TABLE sub_recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sub_recipe_id UUID NOT NULL REFERENCES sub_recipes(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 4) NOT NULL, -- Örn: 0.5 (Kg)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. products (Satış Ürünleri) Tablosu
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL, -- Örn: Profiterol (1 Porsiyon)
    category VARCHAR(100), -- Örn: Tatlı
    sale_price DECIMAL(10, 2) NOT NULL DEFAULT 0, -- Örn: 270.00
    estimated_monthly_sales INTEGER DEFAULT 0, -- Örn: 90
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. product_ingredients (Ürün İçerikleri / Son Reçete) Tablosu
CREATE TABLE product_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    -- Bir ürünün içine ya direkt hammadde girer ya da yarı mamul girer
    material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
    sub_recipe_id UUID REFERENCES sub_recipes(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 4) NOT NULL, -- Örn: 1 (Adet/Porsiyon)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    -- Sadece biri dolu olmalı kontrolü (Check constraint)
    CONSTRAINT check_ingredient_type CHECK (
        (material_id IS NOT NULL AND sub_recipe_id IS NULL) OR 
        (material_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);

-- GÜVENLİK (Row Level Security - RLS)
-- Şimdilik tüm tablolar için RLS'yi açıp public erişime (anon/authenticated) izin veriyoruz.

ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON materials FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON materials FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON sub_recipes FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON sub_recipes FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON sub_recipe_ingredients FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON sub_recipe_ingredients FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON products FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON products FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON product_ingredients FOR SELECT USING (true);
CREATE POLICY "Enable all access for authenticated users" ON product_ingredients FOR ALL USING (auth.role() = 'authenticated');

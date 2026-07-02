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
-- Bu tabloya ya direkt bir hammadde (Süt) ya da bir yarı mamul (1 Porsiyon Profiterol) eklenebilir.
CREATE TABLE product_ingredients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id) ON DELETE RESTRICT,
    sub_recipe_id UUID REFERENCES sub_recipes(id) ON DELETE RESTRICT,
    quantity DECIMAL(10, 3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    
    -- SADECE BİRİ DOLU OLABİLİR (Ya hammadde ya yarı mamul)
    CONSTRAINT check_ingredient_type CHECK (
        (material_id IS NOT NULL AND sub_recipe_id IS NULL) OR
        (material_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);

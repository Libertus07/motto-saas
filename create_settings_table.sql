-- Settings tablosunu oluştur
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS'yi kapat (Anonim erişim için)
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Genel ayarlar
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
    ('theme', '"dark"')
ON CONFLICT (key) DO NOTHING;

-- Finansal ayarlar
INSERT INTO settings (key, value) VALUES
    ('target_margin', '"35"'),
    ('takeaway_ratio', '"60"'),
    ('default_vat', '"10"'),
    ('currency', '"TRY"'),
    ('price_rounding', '"nearest"'),
    ('cost_method', '"equal"')
ON CONFLICT (key) DO NOTHING;

-- Bildirim ayarları
INSERT INTO settings (key, value) VALUES
    ('notify_critical_stock', 'true'),
    ('notify_low_margin', 'true'),
    ('notify_daily_revenue', 'false'),
    ('notify_supplier_price', 'false'),
    ('whatsapp_number', '""')
ON CONFLICT (key) DO NOTHING;

-- Kategoriler
INSERT INTO settings (key, value) VALUES
    ('material_categories', '["Süt Ürünleri", "Kuru Gıda", "Ambalaj ve Sarf", "Kahve & Çay", "Manav", "Şuruplar ve Soslar", "Temizlik", "Diğer"]'),
    ('expense_categories', '{"kira": "Kira", "personel": "Personel", "elektrik": "Elektrik", "su": "Su", "dogalgaz": "Doğalgaz", "internet": "İnternet", "muhasebe": "Muhasebe", "sigorta": "Sigorta", "pazarlama": "Pazarlama", "diger": "Diğer"}')
ON CONFLICT (key) DO NOTHING;


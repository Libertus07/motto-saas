-- ==============================================================================
-- AKTİVİTE LOGLARI (İŞLEM GEÇMİŞİ) TABLOSU OLUŞTURMA
-- ==============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    module VARCHAR(100) NOT NULL,    -- Örn: 'Tedarikçi', 'Stok', 'Z-Raporu' vb.
    action_type VARCHAR(50) NOT NULL, -- Örn: 'EKLEME', 'SILME', 'GUNCELLEME'
    description TEXT NOT NULL,       -- Örn: 'Ahmet isimli tedarikçi silindi'
    details JSONB,                   -- Opsiyonel: Değişen fiyat, silinen data gibi detaylı objeler
    user_id VARCHAR(100) DEFAULT 'Yönetici' -- Şimdilik standart
);

-- Hızlı listeleme için index ekleyelim
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_module ON activity_logs(module);

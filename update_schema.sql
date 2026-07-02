-- ==============================================================================
-- YENİ ÖZELLİKLER İÇİN VERİTABANI GÜNCELLEMELERİ (ALTER TABLE)
-- Bu komutları Supabase SQL Editör'ünde (SQL Editor) çalıştırınız.
-- ==============================================================================

-- 1. materials (Hammaddeler) tablosuna category kolonu ekle
ALTER TABLE materials
ADD COLUMN IF NOT EXISTS category VARCHAR(100);

-- 2. suppliers (Tedarikçiler) tablosuna telefon, iban ve adres kolonları ekle
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS iban VARCHAR(100),
ADD COLUMN IF NOT EXISTS address TEXT;

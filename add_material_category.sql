-- 1. materials tablosuna category ekleme
ALTER TABLE materials ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Diğer';

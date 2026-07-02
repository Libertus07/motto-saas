-- Mevcut investments tablosuna gayrimenkulün manuel değerini tutacak sütunu ekleyelim
ALTER TABLE investments
ADD COLUMN IF NOT EXISTS current_manual_value DECIMAL(12, 4) DEFAULT 0;

-- (Not: asset_type zaten VARCHAR olduğu için 'real_estate' de alabilir, transaction_type da 'rent' alabilir. Başka DDL değişikliğine gerek yoktur.)

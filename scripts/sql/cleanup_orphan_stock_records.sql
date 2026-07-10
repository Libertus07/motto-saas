-- Amaç:
-- Açıkça orphan olduğu tespit edilen stok hareketlerini temizlemek.
--
-- Güvenli temizlenen kayıtlar:
-- 1) supplier batch'e bağlı olup artık supplier_transactions.batch_id kaydı kalmayan stock_movements
-- 2) sales/Z-Raporu batch'ine bağlı olup artık sales.batch_id kaydı kalmayan stock_movements
--
-- DİKKAT:
-- Bu script materials.stock_quantity alanını otomatik yeniden hesaplamaz.
-- Önce audit_stock_integrity.sql ile raporu inceleyin.
-- Temizlik sonrası gerekiyorsa materials stokları kontrollü olarak manuel/RPC sayım ile hizalanmalıdır.

BEGIN;

-- 1) Supplier batch orphan stok kayıtlarını sil
DELETE FROM stock_movements sm
WHERE sm.batch_id IS NOT NULL
  AND sm.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_transactions st
    WHERE st.batch_id = sm.batch_id
  );

-- 2) Sales/Z-Raporu batch orphan stok kayıtlarını sil
DELETE FROM stock_movements sm
WHERE sm.batch_id IS NOT NULL
  AND sm.supplier_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sales s
    WHERE s.batch_id = sm.batch_id
  );

COMMIT;

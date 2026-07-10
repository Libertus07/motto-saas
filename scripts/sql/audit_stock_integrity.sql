-- Amaç:
-- Stok modülünde veri doğruluğunu denetlemek ve bozuk / şüpheli kayıtları raporlamak.
-- Bu script VERİ DEĞİŞTİRMEZ, sadece inceleme çıktısı üretir.
--
-- Rapor başlıkları:
-- 1) Yetim (orphan) batch bazlı stok hareketleri
-- 2) Kaynağı bulunamayan supplier batch kayıtları
-- 3) Kaynağı bulunamayan Z-Raporu batch kayıtları
-- 4) Negatif stoklu malzemeler
-- 5) Hareketlerden türetilen tahmini stok ile mevcut stok arasındaki farklar
--
-- NOT:
-- "Tahmini stok" hesabı, hareket geçmişini şöyle yorumlar:
-- - giris  => +quantity
-- - cikis  => -quantity
-- - fire   => -quantity
-- - sayim  => note içinde "Eksik" ise -quantity, "Fazla" ise +quantity
-- Bu rapor özellikle legacy verilerde bilgi amaçlı kullanılmalıdır.

-- 1) Supplier batch orphan hareketler
SELECT
  'orphan_supplier_batch' AS issue_type,
  sm.id,
  sm.batch_id,
  sm.material_id,
  sm.supplier_id,
  sm.movement_type,
  sm.quantity,
  sm.note,
  sm.created_at
FROM stock_movements sm
WHERE sm.batch_id IS NOT NULL
  AND sm.supplier_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_transactions st
    WHERE st.batch_id = sm.batch_id
  )
ORDER BY sm.created_at DESC;

-- 2) Z-Raporu batch orphan hareketler
SELECT
  'orphan_sales_batch' AS issue_type,
  sm.id,
  sm.batch_id,
  sm.material_id,
  sm.supplier_id,
  sm.movement_type,
  sm.quantity,
  sm.note,
  sm.created_at
FROM stock_movements sm
WHERE sm.batch_id IS NOT NULL
  AND sm.supplier_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sales s
    WHERE s.batch_id = sm.batch_id
  )
ORDER BY sm.created_at DESC;

-- 3) Negatif stoklu malzemeler
SELECT
  'negative_stock' AS issue_type,
  m.id AS material_id,
  m.name,
  m.unit,
  m.stock_quantity,
  m.price_per_unit,
  m.updated_at
FROM materials m
WHERE COALESCE(m.stock_quantity, 0) < 0
ORDER BY m.name;

-- 4) Hareketlerden türetilen tahmini stok ile mevcut stok farkları
WITH movement_totals AS (
  SELECT
    sm.material_id,
    SUM(
      CASE
        WHEN sm.movement_type = 'giris' THEN COALESCE(sm.quantity, 0)
        WHEN sm.movement_type IN ('cikis', 'fire') THEN -COALESCE(sm.quantity, 0)
        WHEN sm.movement_type = 'sayim' AND sm.note ILIKE '%Eksik%' THEN -COALESCE(sm.quantity, 0)
        WHEN sm.movement_type = 'sayim' AND sm.note ILIKE '%Fazla%' THEN COALESCE(sm.quantity, 0)
        ELSE 0
      END
    ) AS estimated_stock
  FROM stock_movements sm
  GROUP BY sm.material_id
)
SELECT
  'stock_mismatch' AS issue_type,
  m.id AS material_id,
  m.name,
  m.unit,
  COALESCE(m.stock_quantity, 0) AS current_stock,
  COALESCE(mt.estimated_stock, 0) AS estimated_stock,
  COALESCE(m.stock_quantity, 0) - COALESCE(mt.estimated_stock, 0) AS difference
FROM materials m
LEFT JOIN movement_totals mt ON mt.material_id = m.id
WHERE ABS(COALESCE(m.stock_quantity, 0) - COALESCE(mt.estimated_stock, 0)) > 0.0001
ORDER BY ABS(COALESCE(m.stock_quantity, 0) - COALESCE(mt.estimated_stock, 0)) DESC, m.name;

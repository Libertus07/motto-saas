-- Amaç:
-- Tedarikçi modülünde silinmiş fiş/ödeme kayıtlarından sonra kalmış orphan verileri temizlemek
-- ve supplier/account bakiyelerini hareket tablolarına göre yeniden hizalamak.
--
-- Hedeflenen kayıtlar:
-- 1) source_type = 'supplier_payment' olup ilgili supplier_transactions kaydı kalmamış account_movements
-- 2) supplier_id + batch_id dolu olup ilgili supplier_transactions.batch_id kaydı kalmamış stock_movements
--
-- DİKKAT:
-- Bu script fişe bağlı orphan stok hareketlerini siler. Çalıştırmadan önce yedek alınması önerilir.

BEGIN;

-- 1) Orphan tedarikçi ödeme finans hareketlerini sil
DELETE FROM account_movements am
WHERE am.source_type = 'supplier_payment'
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_transactions st
    WHERE st.id::text = am.source_id
  );

-- 2) Orphan tedarikçi fiş stok hareketlerini sil
DELETE FROM stock_movements sm
WHERE sm.supplier_id IS NOT NULL
  AND sm.batch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM supplier_transactions st
    WHERE st.batch_id = sm.batch_id
  );

-- 3) Tedarikçi borçlarını cari işlemlerden yeniden hesapla
UPDATE suppliers s
SET total_debt = COALESCE(calc.total_debt, 0)
FROM (
  SELECT
    supplier_id,
    SUM(
      CASE
        WHEN transaction_type = 'invoice' THEN amount
        WHEN transaction_type = 'payment' THEN -amount
        ELSE 0
      END
    ) AS total_debt
  FROM supplier_transactions
  GROUP BY supplier_id
) calc
WHERE calc.supplier_id = s.id;

UPDATE suppliers s
SET total_debt = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM supplier_transactions st
  WHERE st.supplier_id = s.id
);

-- 4) Hesap bakiyelerini hareket tablosuna göre yeniden hizala
UPDATE accounts a
SET balance = COALESCE(calc.balance, 0)
FROM (
  SELECT
    account_id,
    SUM(CASE WHEN movement_type = 'giris' THEN amount ELSE -amount END) AS balance
  FROM account_movements
  GROUP BY account_id
) calc
WHERE calc.account_id = a.id;

UPDATE accounts a
SET balance = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM account_movements am
  WHERE am.account_id = a.id
);

COMMIT;

-- Amaç:
-- Silinmiş yatırım / yatırım işlemlerine bağlı kalmış orphan account_movements kayıtlarını temizlemek
-- ve hesap bakiyelerini hareket tablosuna göre yeniden hizalamak.
--
-- DİKKAT:
-- Bu script sadece source_type = 'investment' kayıtlarını hedefler.
-- Önce orphan hareketleri siler, ardından accounts.balance alanını account_movements üzerinden yeniden hesaplar.

BEGIN;

-- 1) Orphan yatırım hareketlerini sil
DELETE FROM account_movements am
WHERE am.source_type = 'investment'
  AND NOT EXISTS (
    SELECT 1
    FROM investment_transactions it
    WHERE it.id::text = am.source_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM investments i
    WHERE i.id::text = am.source_id
  );

-- 2) Hesap bakiyelerini mevcut hareketlerden yeniden hesapla
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

-- Hareketi hiç kalmayan hesapları sıfırla
UPDATE accounts a
SET balance = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM account_movements am
  WHERE am.account_id = a.id
);

COMMIT;

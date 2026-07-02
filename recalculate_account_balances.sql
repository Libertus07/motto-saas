-- Bu sorgu, tüm finans (banka, kasa, pos vb.) hesaplarının bakiyelerini
-- account_movements (hesap hareketleri) tablosundaki verilere göre sıfırdan hesaplar ve eşitler.
-- Supabase üzerinden elle (manuel) sildiğiniz hareketlerden kaynaklanan bakiye eksiğini düzeltir.

UPDATE accounts
SET balance = COALESCE((
    SELECT 
        SUM(CASE WHEN movement_type = 'giris' THEN amount ELSE -amount END)
    FROM account_movements
    WHERE account_movements.account_id = accounts.id
), 0);

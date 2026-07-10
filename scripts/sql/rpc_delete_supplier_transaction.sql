-- ==============================================================================
-- FONKSİYON: delete_supplier_transaction
-- AMACI: Tedarikçi cari işlemini (fatura borcu veya ödeme) silerken;
-- cari bakiyeyi eski haline getirme ve (eğer kasadan çıktıysa) kasa bakiyesini
-- geri iade etme işlemlerini TEK BİR ATOMİK TRANSACTION içinde yapar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION delete_supplier_transaction(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tx record;
    v_mov record;
BEGIN
    -- 1. Silinecek işlemi bul
    SELECT supplier_id, amount, transaction_type INTO v_tx 
    FROM supplier_transactions 
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'İşlem bulunamadı.';
    END IF;

    -- 2. Cari İşlemi Sil
    DELETE FROM supplier_transactions WHERE id = p_transaction_id;

    -- 3. Cari Bakiyeyi Geri Al (Rollback)
    -- Silinen bir faturaysa (borç artmıştı), bakiyeyi DÜŞÜR.
    -- Silinen bir ödemeyse (borç azalmıştı), bakiyeyi ARTIR.
    IF v_tx.transaction_type = 'invoice' THEN
        UPDATE suppliers SET total_debt = COALESCE(total_debt, 0) - v_tx.amount WHERE id = v_tx.supplier_id;
    ELSIF v_tx.transaction_type = 'payment' THEN
        UPDATE suppliers SET total_debt = COALESCE(total_debt, 0) + v_tx.amount WHERE id = v_tx.supplier_id;
    END IF;

    -- 4. Kasa İadesi (Sadece payment ise ve account_movement varsa)
    IF v_tx.transaction_type = 'payment' THEN
        -- Bu işleme bağlı bir kasa hareketi var mı bul ve sil
        FOR v_mov IN 
            DELETE FROM account_movements 
            WHERE source_type = 'supplier_payment' AND source_id = p_transaction_id::text 
            RETURNING account_id, amount, movement_type
        LOOP
            -- Eğer kasadan çıkış yapılmışsa, iptal edildiği için kasaya GERİ EKLE
            IF v_mov.movement_type = 'cikis' THEN
                UPDATE accounts SET balance = COALESCE(balance, 0) + v_mov.amount WHERE id = v_mov.account_id;
            END IF;
        END LOOP;
    END IF;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Cari işlem silinirken hata oluştu: %', SQLERRM;
END;
$$;

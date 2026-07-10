-- ==============================================================================
-- FONKSİYON: delete_receipt_transaction
-- AMACI: Tedarikçi fişini silerken stokları geri alma ve cari bakiyeyi 
-- düzeltme işlemlerini TEK BİR ATOMİK TRANSACTION içinde yapar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION delete_receipt_transaction(p_batch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_mov record;
    v_tx record;
BEGIN
    -- 1. Stokları geri al (fiş eklendiğinde artmıştı, şimdi azalacak)
    FOR v_mov IN SELECT material_id, quantity FROM stock_movements WHERE batch_id = p_batch_id
    LOOP
        UPDATE materials 
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_mov.quantity)
        WHERE id = v_mov.material_id;
    END LOOP;

    -- Stok hareketlerini sil
    DELETE FROM stock_movements WHERE batch_id = p_batch_id;

    -- 2. Cari İşlemleri (Borç/Ödeme) Geri Al
    FOR v_tx IN SELECT supplier_id, amount, transaction_type FROM supplier_transactions WHERE batch_id = p_batch_id
    LOOP
        -- Fiş eklendiğinde: invoice (+ borç yazmıştı), payment (- borç düşmüştü)
        -- Şimdi Geri Alıyoruz: invoice iptali (- borç düş), payment iptali (+ borç yaz)
        IF v_tx.transaction_type = 'invoice' THEN
            UPDATE suppliers SET total_debt = COALESCE(total_debt, 0) - v_tx.amount WHERE id = v_tx.supplier_id;
        ELSIF v_tx.transaction_type = 'payment' THEN
            UPDATE suppliers SET total_debt = COALESCE(total_debt, 0) + v_tx.amount WHERE id = v_tx.supplier_id;
        END IF;
    END LOOP;

    -- Cari işlemleri sil
    DELETE FROM supplier_transactions WHERE batch_id = p_batch_id;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fiş silme işlemi başarısız: %', SQLERRM;
END;
$$;

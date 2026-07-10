-- ==============================================================================
-- FONKSİYON: delete_z_report_transaction
-- AMACI: Z-Raporunu silerken stokları geri ekleme, satışları, giderleri ve 
-- hesap (kasa) hareketlerini silme işlemlerini TEK BİR ATOMİK TRANSACTION 
-- içinde yapar. Hata anında işlemler geri alınır (Rollback).
-- ==============================================================================

CREATE OR REPLACE FUNCTION delete_z_report_transaction(p_batch_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_mov record;
    v_acc_mov record;
BEGIN
    FOR v_mov IN SELECT material_id, quantity FROM stock_movements WHERE batch_id = p_batch_id
    LOOP
        UPDATE materials 
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_mov.quantity
        WHERE id = v_mov.material_id;
    END LOOP;

    DELETE FROM stock_movements WHERE batch_id = p_batch_id;

    DELETE FROM sales WHERE batch_id = p_batch_id;

    DELETE FROM expenses WHERE batch_id = p_batch_id;

    FOR v_acc_mov IN SELECT account_id, amount, movement_type FROM account_movements WHERE source_type = 'z_report' AND source_id = p_batch_id::text
    LOOP
        IF v_acc_mov.movement_type = 'giris' THEN
            UPDATE accounts 
            SET balance = balance - v_acc_mov.amount
            WHERE id = v_acc_mov.account_id;
        ELSE
            UPDATE accounts 
            SET balance = balance + v_acc_mov.amount
            WHERE id = v_acc_mov.account_id;
        END IF;
    END LOOP;

    DELETE FROM account_movements WHERE source_type = 'z_report' AND source_id = p_batch_id::text;

    RETURN true;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Z-Raporu silme başarısız: %', SQLERRM;
END;
$$;

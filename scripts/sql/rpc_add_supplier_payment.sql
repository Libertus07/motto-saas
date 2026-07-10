-- ==============================================================================
-- FONKSİYON: add_supplier_payment_transaction
-- AMACI: Tedarikçiye manuel ödeme eklerken; cari işlemi, bakiye güncellemeyi 
-- ve (eğer kasadan yapıldıysa) kasa çıkışını TEK BİR ATOMİK TRANSACTION içinde yapar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION add_supplier_payment_transaction(
    p_supplier_id uuid,
    p_supplier_name text,
    p_amount numeric,
    p_note text,
    p_account_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_transaction_id uuid;
BEGIN
    -- 1. Ödeme kaydını ekle (supplier_transactions)
    INSERT INTO supplier_transactions (supplier_id, user_id, transaction_date, amount, transaction_type, note)
    VALUES (p_supplier_id, auth.uid(), CURRENT_DATE, p_amount, 'payment', COALESCE(p_note, 'Manuel Ödeme'))
    RETURNING id INTO v_transaction_id;

    -- 2. Tedarikçi bakiyesini güncelle (borçtan düş)
    UPDATE suppliers 
    SET total_debt = COALESCE(total_debt, 0) - p_amount 
    WHERE id = p_supplier_id;

    -- 3. Finans Hesabından düş (Eğer hesap seçildiyse)
    IF p_account_id IS NOT NULL THEN
        -- Kasa hareketi ekle (source_id olarak oluşturulan transaction_id verilir ki silerken bulabilelim)
        INSERT INTO account_movements (account_id, movement_type, amount, description, source_type, source_id)
        VALUES (
            p_account_id, 
            'cikis', 
            p_amount, 
            p_supplier_name || ' firmasına ödeme yapıldı.', 
            'supplier_payment', 
            v_transaction_id::text
        );

        -- Kasa bakiyesini güncelle
        UPDATE accounts 
        SET balance = COALESCE(balance, 0) - p_amount 
        WHERE id = p_account_id;
    END IF;

    RETURN v_transaction_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Ödeme işlemi başarısız: %', SQLERRM;
END;
$$;

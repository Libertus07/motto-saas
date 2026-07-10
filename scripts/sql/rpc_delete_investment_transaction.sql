-- ==============================================================================
-- FONKSİYON: delete_investment_transaction
-- AMACI: Yatırım işlemini (alım satım) silerken;
-- cüzdanı (investments) geriye doğru güncellemeyi ve (eğer kasa hareketi varsa) 
-- kasa bakiyesini iade etmeyi TEK BİR ATOMİK TRANSACTION içinde yapar.
-- ==============================================================================

CREATE OR REPLACE FUNCTION delete_investment_transaction(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tx record;
    v_inv record;
    v_mov record;
    v_old_total_cost numeric;
    v_new_total_cost numeric;
    v_new_qty numeric;
    v_new_avg_cost numeric;
BEGIN
    -- 1. Silinecek işlemi bul
    SELECT investment_id, quantity, price_per_unit, total_amount, transaction_type 
    INTO v_tx 
    FROM investment_transactions 
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Yatırım işlemi bulunamadı.';
    END IF;

    -- 2. Cüzdanı (investments) bul
    SELECT * INTO v_inv FROM investments WHERE id = v_tx.investment_id;

    -- 3. Cüzdan Güncellemesi (Rollback)
    IF v_inv IS NOT NULL THEN
        IF v_tx.transaction_type = 'buy' THEN
            v_new_qty := COALESCE(v_inv.quantity, 0) - v_tx.quantity;
            
            IF v_new_qty <= 0 THEN
                -- Cüzdanda bu yatırımdan kalmadıysa tamamen sil
                DELETE FROM investments WHERE id = v_inv.id;
            ELSE
                -- Cüzdanda kaldıysa ortalama maliyeti geriye doğru hesapla
                v_old_total_cost := COALESCE(v_inv.quantity, 0) * COALESCE(v_inv.average_cost, 0);
                v_new_total_cost := v_old_total_cost - v_tx.total_amount;
                
                IF v_new_total_cost < 0 THEN v_new_total_cost := 0; END IF;
                v_new_avg_cost := v_new_total_cost / v_new_qty;

                UPDATE investments 
                SET quantity = v_new_qty,
                    average_cost = v_new_avg_cost,
                    updated_at = NOW()
                WHERE id = v_inv.id;
            END IF;
        END IF;
        -- TODO: ileride 'sell' gelirse quantity artırılmalı vb.
    END IF;

    -- 4. İşlemi Sil
    DELETE FROM investment_transactions WHERE id = p_transaction_id;

    -- 5. Kasa İadesi
    FOR v_mov IN 
        DELETE FROM account_movements 
        WHERE source_type = 'investment' AND source_id = p_transaction_id::text 
        RETURNING account_id, amount, movement_type
    LOOP
        IF v_mov.movement_type = 'cikis' THEN
            -- Alım iptal edildi, parayı kasaya GERİ EKLE
            UPDATE accounts SET balance = COALESCE(balance, 0) + v_mov.amount WHERE id = v_mov.account_id;
        ELSIF v_mov.movement_type = 'giris' THEN
            -- Satış iptal edildi, parayı kasadan GERİ DÜŞ
            UPDATE accounts SET balance = COALESCE(balance, 0) - v_mov.amount WHERE id = v_mov.account_id;
        END IF;
    END LOOP;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Yatırım işlemi silinirken hata oluştu: %', SQLERRM;
END;
$$;

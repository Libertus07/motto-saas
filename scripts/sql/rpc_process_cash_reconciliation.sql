-- ==============================================================================
-- FONKSİYON: process_cash_reconciliation
-- AMACI: Kasa sayım onayı işlemlerini TEK BİR ATOMİK TRANSACTION içinde yapar.
-- Eski sayım düzeltmesi varsa önce onların finans fişlerini geri alır (Rollback),
-- sonra güncel açık/fazlalıkları kasaya/bankaya yansıtır.
-- ==============================================================================

CREATE OR REPLACE FUNCTION process_cash_reconciliation(payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_id uuid;
    v_date date;
    v_counted_cash numeric;
    v_counted_credit numeric;
    v_counted_meal numeric;
    v_expected_cash numeric;
    v_expected_credit numeric;
    v_expected_meal numeric;
    v_cash_var numeric;
    v_credit_var numeric;
    v_meal_var numeric;
    v_status text;
    v_notes text;
    v_is_mov_found boolean;
    v_rec_id uuid;
    v_acc_mov record;
    v_cash_acc_id uuid;
    v_bank_acc_id uuid;
    v_cash_desc text;
    v_credit_desc text;
BEGIN
    v_id := (payload->>'id')::uuid;
    v_date := (payload->>'date')::date;
    v_counted_cash := (payload->>'counted_cash')::numeric;
    v_counted_credit := (payload->>'counted_credit_card')::numeric;
    v_counted_meal := (payload->>'counted_meal_card')::numeric;
    v_expected_cash := (payload->>'expected_cash')::numeric;
    v_expected_credit := (payload->>'expected_credit_card')::numeric;
    v_expected_meal := (payload->>'expected_meal_card')::numeric;
    v_cash_var := (payload->>'cash_variance')::numeric;
    v_credit_var := (payload->>'credit_card_variance')::numeric;
    v_meal_var := (payload->>'meal_card_variance')::numeric;
    v_status := payload->>'status';
    v_notes := payload->>'notes';
    v_is_mov_found := (payload->>'is_movement_found')::boolean;

    -- 1. Zaten var olan bir sayım düzeltiliyorsa
    IF v_id IS NOT NULL THEN
        UPDATE cash_reconciliations
        SET date = v_date,
            counted_cash = v_counted_cash,
            counted_credit_card = v_counted_credit,
            counted_meal_card = v_counted_meal,
            expected_cash = v_expected_cash,
            expected_credit_card = v_expected_credit,
            expected_meal_card = v_expected_meal,
            cash_variance = v_cash_var,
            credit_card_variance = v_credit_var,
            meal_card_variance = v_meal_var,
            status = v_status,
            notes = v_notes,
            updated_at = now()
        WHERE id = v_id
        RETURNING id INTO v_rec_id;

        -- Eski düzeltme fişlerini bul, bakiyeyi geri al ve sil
        FOR v_acc_mov IN SELECT account_id, amount, movement_type FROM account_movements WHERE source_type = 'reconciliation' AND source_id = v_rec_id::text
        LOOP
            IF v_acc_mov.movement_type = 'giris' THEN
                UPDATE accounts SET balance = balance - v_acc_mov.amount WHERE id = v_acc_mov.account_id;
            ELSE
                UPDATE accounts SET balance = balance + v_acc_mov.amount WHERE id = v_acc_mov.account_id;
            END IF;
        END LOOP;
        
        DELETE FROM account_movements WHERE source_type = 'reconciliation' AND source_id = v_rec_id::text;
    ELSE
        -- 2. Yeni sayım ekleniyorsa
        INSERT INTO cash_reconciliations (
            date, counted_cash, counted_credit_card, counted_meal_card,
            expected_cash, expected_credit_card, expected_meal_card,
            cash_variance, credit_card_variance, meal_card_variance,
            status, notes
        ) VALUES (
            v_date, v_counted_cash, v_counted_credit, v_counted_meal,
            v_expected_cash, v_expected_credit, v_expected_meal,
            v_cash_var, v_credit_var, v_meal_var,
            v_status, v_notes
        ) RETURNING id INTO v_rec_id;
    END IF;

    -- 3. Kasa ve Banka hesaplarını bul
    SELECT id INTO v_cash_acc_id FROM accounts WHERE type = 'cash' LIMIT 1;
    SELECT id INTO v_bank_acc_id FROM accounts WHERE type = 'bank' LIMIT 1;

    -- Açıklama metinlerini ayarla
    IF COALESCE(v_is_mov_found, false) = true THEN
        v_cash_desc := CASE WHEN v_cash_var > 0 THEN v_date::text || ' Nakit Sayım Fazlası' ELSE v_date::text || ' Nakit Sayım Açığı' END;
        v_credit_desc := CASE WHEN v_credit_var > 0 THEN v_date::text || ' POS Sayım Fazlası' ELSE v_date::text || ' POS Sayım Açığı' END;
    ELSE
        v_cash_desc := CASE WHEN v_cash_var > 0 THEN v_date::text || ' Kasa Sayım Fazlası (Genel)' ELSE v_date::text || ' Kasa Sayım Açığı (Genel)' END;
        v_credit_desc := ''; -- Genel onayla sadece nakit açık/fazla oluşur
    END IF;

    -- 4. Nakit (Kasa) farkı varsa hesaba yansıt ve fiş kes
    IF v_cash_acc_id IS NOT NULL AND v_cash_var <> 0 THEN
        INSERT INTO account_movements (account_id, movement_type, amount, description, source_type, source_id)
        VALUES (
            v_cash_acc_id,
            CASE WHEN v_cash_var > 0 THEN 'giris' ELSE 'cikis' END,
            abs(v_cash_var),
            v_cash_desc,
            'reconciliation',
            v_rec_id::text
        );

        UPDATE accounts 
        SET balance = balance + v_cash_var
        WHERE id = v_cash_acc_id;
    END IF;

    -- 5. Kredi Kartı (POS/Banka) farkı varsa hesaba yansıt ve fiş kes
    IF v_bank_acc_id IS NOT NULL AND v_credit_var <> 0 THEN
        INSERT INTO account_movements (account_id, movement_type, amount, description, source_type, source_id)
        VALUES (
            v_bank_acc_id,
            CASE WHEN v_credit_var > 0 THEN 'giris' ELSE 'cikis' END,
            abs(v_credit_var),
            v_credit_desc,
            'reconciliation',
            v_rec_id::text
        );

        UPDATE accounts 
        SET balance = balance + v_credit_var
        WHERE id = v_bank_acc_id;
    END IF;

    RETURN json_build_object('id', v_rec_id);

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Kasa sayım atomik işlemi başarısız: %', SQLERRM;
END;
$$;

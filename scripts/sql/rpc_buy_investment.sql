-- ==============================================================================
-- FONKSİYON: buy_investment_transaction
-- AMACI: Yatırım (Altın, Döviz, Emlak vb.) alırken; cüzdanı güncellemeyi,
-- işlem geçmişi kaydını ve kasa çıkışını TEK BİR ATOMİK TRANSACTION içinde yapar.
-- ==============================================================================

ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE investment_transactions ADD COLUMN IF NOT EXISTS transaction_date date;

CREATE OR REPLACE FUNCTION buy_investment_transaction(
    p_asset_type text,
    p_name text,
    p_quantity numeric,
    p_price numeric,
    p_account_id uuid,
    p_notes text,
    p_purchase_date date,
    p_document_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_inv_id uuid;
    v_transaction_id uuid;
    v_total_amount numeric := p_quantity * p_price;
    v_old_total_cost numeric;
    v_new_total_cost numeric;
    v_new_qty numeric;
    v_new_avg_cost numeric;
    v_existing record;
BEGIN
    -- Emlak (real_estate) her zaman yeni bir yatırım kaydı açar.
    -- Diğer varlıklar cüzdanda varsa birleştirilir.
    IF p_asset_type != 'real_estate' THEN
        SELECT * INTO v_existing FROM investments WHERE asset_type = p_asset_type LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
        -- Mevcut yatırımı güncelle (Ortalama maliyet hesapla)
        v_inv_id := v_existing.id;
        v_old_total_cost := COALESCE(v_existing.quantity, 0) * COALESCE(v_existing.average_cost, 0);
        v_new_total_cost := v_old_total_cost + v_total_amount;
        v_new_qty := COALESCE(v_existing.quantity, 0) + p_quantity;
        
        IF v_new_qty > 0 THEN
            v_new_avg_cost := v_new_total_cost / v_new_qty;
        ELSE
            v_new_avg_cost := 0;
        END IF;

        UPDATE investments 
        SET quantity = v_new_qty,
            average_cost = v_new_avg_cost,
            updated_at = NOW(),
            notes = CASE 
                        WHEN notes IS NOT NULL AND notes != '' THEN notes || E'\n' || p_purchase_date::text || ': ' || COALESCE(p_notes, '')
                        ELSE COALESCE(p_notes, '')
                    END,
            document_url = COALESCE(p_document_url, document_url)
        WHERE id = v_inv_id;
    ELSE
        -- Yeni yatırım kaydı aç
        INSERT INTO investments (id, user_id, asset_type, name, quantity, average_cost, current_manual_value, notes, purchase_date, document_url)
        VALUES (
            gen_random_uuid(),
            auth.uid(),
            p_asset_type,
            p_name,
            p_quantity,
            p_price,
            CASE WHEN p_asset_type = 'real_estate' THEN p_price ELSE 0 END,
            p_notes,
            p_purchase_date,
            p_document_url
        ) RETURNING id INTO v_inv_id;
    END IF;

    -- İşlem Geçmişine Ekle (investment_transactions)
    INSERT INTO investment_transactions (id, investment_id, user_id, transaction_type, quantity, price_per_unit, total_amount, account_id, document_url, notes, transaction_date)
    VALUES (
        gen_random_uuid(),
        v_inv_id,
        auth.uid(),
        'buy',
        p_quantity,
        p_price,
        v_total_amount,
        p_account_id,
        p_document_url,
        p_notes,
        COALESCE(p_purchase_date, CURRENT_DATE)
    ) RETURNING id INTO v_transaction_id;

    -- Kasa Çıkış Hareketi (account_movements)
    -- source_id olarak investment_transactions.id veriyoruz ki silerken birebir eşleşsin.
    INSERT INTO account_movements (id, account_id, movement_type, amount, description, source_type, source_id)
    VALUES (
        gen_random_uuid(),
        p_account_id,
        'cikis',
        v_total_amount,
        'Yatırım Alımı: ' || p_name || ' (' || p_quantity || ' birim) alındı.',
        'investment',
        v_transaction_id::text
    );

    -- Kasa Bakiyesini Düş
    UPDATE accounts 
    SET balance = COALESCE(balance, 0) - v_total_amount 
    WHERE id = p_account_id;

    RETURN v_transaction_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Yatırım işlemi başarısız: %', SQLERRM;
END;
$$;




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_supplier_payment_transaction"("p_supplier_id" "uuid", "p_supplier_name" "text", "p_amount" numeric, "p_note" "text", "p_account_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_transaction_id uuid;
BEGIN
    -- 1. Ödeme kaydını ekle (supplier_transactions)
    INSERT INTO supplier_transactions (id, supplier_id, user_id, transaction_date, amount, transaction_type, note)
    VALUES (gen_random_uuid(), p_supplier_id, auth.uid(), CURRENT_DATE, p_amount, 'payment', COALESCE(p_note, 'Manuel Ödeme'))
    RETURNING id INTO v_transaction_id;

    -- 2. Tedarikçi bakiyesini güncelle (borçtan düş)
    UPDATE suppliers 
    SET total_debt = COALESCE(total_debt, 0) - p_amount 
    WHERE id = p_supplier_id;

    -- 3. Finans Hesabından düş (Eğer hesap seçildiyse)
    IF p_account_id IS NOT NULL THEN
        -- Kasa hareketi ekle (source_id olarak oluşturulan transaction_id verilir ki silerken bulabilelim)
        INSERT INTO account_movements (id, account_id, movement_type, amount, description, source_type, source_id)
        VALUES (
            gen_random_uuid(),
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


ALTER FUNCTION "public"."add_supplier_payment_transaction"("p_supplier_id" "uuid", "p_supplier_name" "text", "p_amount" numeric, "p_note" "text", "p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_stock_count"("p_items" "jsonb") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_item jsonb;
    v_material record;
    v_material_id uuid;
    v_counted_qty numeric;
    v_current_stock numeric;
    v_diff numeric;
    v_direction text;
    v_count integer := 0;
    v_details text[] := '{}';
    v_now text := now()::text;
    v_user_id uuid;
    v_organization_id uuid;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum bilgisi bulunamadı. Sayım kaydı için kullanıcı gerekli.';
    END IF;

    v_organization_id := public.current_organization_id();

    IF v_organization_id IS NULL THEN
        RAISE EXCEPTION 'Aktif işletme bulunamadı. Sayım işlemi için organizasyon üyeliği gerekli.';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RAISE EXCEPTION 'Sayım verisi geçersiz.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_material_id := (v_item->>'material_id')::uuid;
        v_counted_qty := (v_item->>'counted_quantity')::numeric;

        IF v_material_id IS NULL THEN
            RAISE EXCEPTION 'Sayım kaydında material_id zorunludur.';
        END IF;

        IF v_counted_qty IS NULL OR v_counted_qty < 0 THEN
            RAISE EXCEPTION 'Sayım miktarı negatif olamaz.';
        END IF;

        SELECT id, name, unit, price_per_unit, stock_quantity
        INTO v_material
        FROM materials
        WHERE id = v_material_id
          AND organization_id = v_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Sayımı yapılacak hammadde bulunamadı: %', v_material_id;
        END IF;

        v_current_stock := COALESCE(v_material.stock_quantity, 0);
        v_diff := v_counted_qty - v_current_stock;

        IF v_diff = 0 THEN
            CONTINUE;
        END IF;

        v_direction := CASE WHEN v_diff < 0 THEN 'Eksik' ELSE 'Fazla' END;

        INSERT INTO stock_movements (organization_id, material_id, movement_type, quantity, unit_price, note, user_id)
        VALUES (
            v_organization_id,
            v_material_id,
            'sayim',
            abs(v_diff),
            COALESCE(v_material.price_per_unit, 0),
            'Sayım Düzeltmesi (' || v_direction || '): Teorik ' || v_current_stock || ', Gerçek ' || v_counted_qty,
            v_user_id
        );

        UPDATE materials
        SET stock_quantity = v_counted_qty
        WHERE id = v_material_id
          AND organization_id = v_organization_id;

        v_details := array_append(v_details, v_material.name || ' (' || v_current_stock || ' -> ' || v_counted_qty || ')');
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO settings (organization_id, key, value)
    VALUES (v_organization_id, 'last_inventory_count_date', to_jsonb(v_now))
    ON CONFLICT (organization_id, key)
    DO UPDATE SET value = EXCLUDED.value;

    RETURN json_build_object(
        'updated_count', v_count,
        'details', v_details,
        'counted_at', v_now
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Stok sayımı uygulanamadı: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."apply_stock_count"("p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buy_investment_transaction"("p_asset_type" "text", "p_name" "text", "p_quantity" numeric, "p_price" numeric, "p_account_id" "uuid", "p_notes" "text", "p_purchase_date" "date", "p_document_url" "text") RETURNS "uuid"
    LANGUAGE "plpgsql"
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
        INSERT INTO investments (id, asset_type, name, quantity, average_cost, current_manual_value, notes, purchase_date, document_url)
        VALUES (
            gen_random_uuid(),
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
    INSERT INTO investment_transactions (id, investment_id, transaction_type, quantity, price_per_unit, total_amount, account_id, document_url, notes, transaction_date)
    VALUES (
        gen_random_uuid(),
        v_inv_id,
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


ALTER FUNCTION "public"."buy_investment_transaction"("p_asset_type" "text", "p_name" "text", "p_quantity" numeric, "p_price" numeric, "p_account_id" "uuid", "p_notes" "text", "p_purchase_date" "date", "p_document_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_ai_quota"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_org_id UUID;
    v_daily_limit INT := 100; -- Günlük standart limit
    v_current_count INT;
BEGIN
    -- Kullanıcının aktif organizasyonunu al
    SELECT organization_id INTO v_org_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Organizasyonun bugünkü kullanımını bul (Race condition önlemek için FOR UPDATE ile kilitliyoruz)
    SELECT request_count INTO v_current_count 
    FROM public.ai_usage_logs 
    WHERE organization_id = v_org_id AND usage_date = CURRENT_DATE 
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Bugün ilk istek
        INSERT INTO public.ai_usage_logs (organization_id, usage_date, request_count) 
        VALUES (v_org_id, CURRENT_DATE, 1);
        RETURN TRUE;
    ELSE
        IF v_current_count >= v_daily_limit THEN
            RETURN FALSE; -- Limit aşılmış
        ELSE
            -- Limiti aşmamış, 1 artır
            UPDATE public.ai_usage_logs 
            SET request_count = request_count + 1 
            WHERE organization_id = v_org_id AND usage_date = CURRENT_DATE;
            RETURN TRUE;
        END IF;
    END IF;
END;
$$;


ALTER FUNCTION "public"."check_ai_quota"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
    SELECT COALESCE(
        (
            SELECT p.active_organization_id
            FROM public.profiles AS p
            WHERE p.id = auth.uid()
              AND public.is_organization_member(p.active_organization_id, auth.uid())
        ),
        (
            SELECT om.organization_id
            FROM public.organization_members AS om
            WHERE om.user_id = auth.uid()
              AND om.status = 'active'
            ORDER BY
                CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
                om.created_at,
                om.organization_id
            LIMIT 1
        )
    );
$$;


ALTER FUNCTION "public"."current_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_investment_transaction"("p_transaction_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
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

    -- 3. Kasa İadesi (Önce Kasa Hareketlerini sil ve iade et)
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

    -- 4. İşlemi Sil
    DELETE FROM investment_transactions WHERE id = p_transaction_id;

    -- 5. Cüzdan Güncellemesi (Rollback)
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

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Yatırım işlemi silinirken hata oluştu: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."delete_investment_transaction"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_receipt_transaction"("p_batch_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."delete_receipt_transaction"("p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_supplier_transaction"("p_transaction_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."delete_supplier_transaction"("p_transaction_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_z_report_transaction"("p_batch_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."delete_z_report_transaction"("p_batch_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dashboard_stats"("days_ago" integer DEFAULT 30, "default_target_margin" numeric DEFAULT 35) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result json;
    thirty_days_ago timestamp;
    actual_target_margin numeric;
    margin_text text;
BEGIN
    -- Son 30 günün tarihi
    thirty_days_ago := now() - (days_ago || ' days')::interval;

    -- Ayarlardan hedef kar marjını çok güvenli (jsonb hatası vermeyecek) şekilde çek
    BEGIN
        SELECT value::text INTO margin_text FROM settings WHERE key = 'target_margin' LIMIT 1;
        IF margin_text IS NOT NULL THEN
            actual_target_margin := replace(margin_text, '"', '')::numeric;
        ELSE
            actual_target_margin := default_target_margin;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        actual_target_margin := default_target_margin;
    END;

    WITH 
    prod_stats AS (
        SELECT 
            count(*) as total_products,
            count(*) FILTER (WHERE ((sale_price - calculated_cost) / nullif(sale_price, 0) * 100) < actual_target_margin) as low_margin_products
        FROM products
    ),
    mat_stats AS (
        SELECT 
            count(*) as total_ingredients,
            count(*) FILTER (WHERE stock_quantity <= critical_stock_level AND critical_stock_level > 0) as critical_stock_count,
            COALESCE(sum(stock_quantity * price_per_unit), 0) as total_stock_value
        FROM materials
    ),
    crit_items AS (
        SELECT json_agg(
            json_build_object(
                'id', id, 
                'name', name, 
                'stock_quantity', stock_quantity, 
                'unit', unit,
                'critical_stock_level', critical_stock_level
            )
        ) as items
        FROM materials
        WHERE stock_quantity <= critical_stock_level AND critical_stock_level > 0
    ),
    exp_stats AS (
        SELECT 
            COALESCE(sum(amount) FILTER (WHERE category = 'indirim-ikram'), 0) as total_discounts,
            COALESCE(sum(amount) FILTER (WHERE category != 'indirim-ikram'), 0) as monthly_expenses
        FROM expenses
        WHERE expense_date >= thirty_days_ago
    ),
    sale_stats AS (
        SELECT 
            COALESCE(sum(s.total_price), 0) as gross_revenue,
            COALESCE(sum(p.calculated_cost * s.quantity), 0) as total_cogs
        FROM sales s
        LEFT JOIN products p ON p.id = s.product_id
        WHERE s.sale_date >= thirty_days_ago
    ),
    acc_stats AS (
        SELECT 
            COALESCE(sum(balance) FILTER (WHERE type = 'cash'), 0) as total_cash,
            COALESCE(sum(balance) FILTER (WHERE type = 'bank'), 0) as total_bank
        FROM accounts
    ),
    inv_stats AS (
        SELECT 
            json_agg(
                json_build_object(
                    'asset_type', asset_type,
                    'quantity', quantity,
                    'average_cost', average_cost
                )
            ) as investments
        FROM investments
    )
    SELECT json_build_object(
        'targetMargin', actual_target_margin,
        'totalProducts', COALESCE((SELECT total_products FROM prod_stats), 0),
        'totalIngredients', COALESCE((SELECT total_ingredients FROM mat_stats), 0),
        'criticalStockCount', COALESCE((SELECT critical_stock_count FROM mat_stats), 0),
        'totalStockValue', COALESCE((SELECT total_stock_value FROM mat_stats), 0),
        'lowMarginProducts', COALESCE((SELECT low_margin_products FROM prod_stats), 0),
        'criticalItems', COALESCE((SELECT items FROM crit_items), '[]'::json),
        
        'totalDiscounts', COALESCE((SELECT total_discounts FROM exp_stats), 0),
        'monthlyExpenses', COALESCE((SELECT monthly_expenses FROM exp_stats), 0),
        
        'grossRevenue', COALESCE((SELECT gross_revenue FROM sale_stats), 0),
        'totalCogs', COALESCE((SELECT total_cogs FROM sale_stats), 0),
        
        'totalCash', COALESCE((SELECT total_cash FROM acc_stats), 0),
        'totalBank', COALESCE((SELECT total_bank FROM acc_stats), 0),
        'investmentsList', COALESCE((SELECT investments FROM inv_stats), '[]'::json)
    ) INTO result;

    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_dashboard_stats"("days_ago" integer, "default_target_margin" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_organizations"() RETURNS SETOF "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_info"("user_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "email" character varying, "full_name" "text", "phone" character varying)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT 
        u.id, 
        u.email::varchar, 
        p.full_name,
        p.phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.id = ANY(user_ids);
$$;


ALTER FUNCTION "public"."get_users_info"("user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members AS om
        WHERE om.organization_id = p_organization_id
          AND om.user_id = p_user_id
          AND om.role = ANY (p_roles)
          AND om.status = 'active'
    );
$$;


ALTER FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid" DEFAULT "auth"."uid"()) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members AS om
        WHERE om.organization_id = p_organization_id
          AND om.user_id = p_user_id
          AND om.status = 'active'
    );
$$;


ALTER FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_expense"("p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_org_id uuid;
    v_action text;
    v_exp jsonb;
    v_exp_id uuid;
    
    v_old_account_id uuid;
    v_old_amount numeric;
    v_new_account_id uuid;
    v_new_amount numeric;
BEGIN
    -- Organizasyon Doğrulaması
    v_org_id := public.current_organization_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Aktif organizasyon bulunamadı.';
    END IF;

    v_action := p_payload->>'action';
    v_exp := p_payload->'expense';
    v_exp_id := (v_exp->>'id')::uuid;

    IF v_action = 'INSERT' THEN
        v_new_account_id := (v_exp->>'account_id')::uuid;
        v_new_amount := (v_exp->>'amount')::numeric;

        -- 1. Gideri Kaydet
        INSERT INTO public.expenses (
            id, organization_id, name, category, amount, period, expense_date, account_id
        ) VALUES (
            v_exp_id, v_org_id, v_exp->>'name', v_exp->>'category', v_new_amount, v_exp->>'period', (v_exp->>'expense_date')::date, v_new_account_id
        );

        -- 2. Eğer Hesap Seçildiyse (Ödendiyse) Hareketi İşle
        IF v_new_account_id IS NOT NULL THEN
            -- Hesap hareketi oluştur
            INSERT INTO public.account_movements (
                organization_id, account_id, amount, movement_type, description, source_type, source_id
            ) VALUES (
                v_org_id, v_new_account_id, v_new_amount, 'cikis', 'Gider Ödemesi: ' || (v_exp->>'name'), 'expense', v_exp_id::text
            );

            -- Bakiye Düş
            UPDATE public.accounts 
            SET balance = balance - v_new_amount 
            WHERE id = v_new_account_id AND organization_id = v_org_id;
        END IF;

    ELSIF v_action = 'UPDATE' THEN
        -- 1. Eski Kaydı Bul ve İptal Et (Eğer daha önce bir hesaptan ödendiyse)
        SELECT account_id, amount INTO v_old_account_id, v_old_amount 
        FROM public.expenses 
        WHERE id = v_exp_id AND organization_id = v_org_id;
        
        IF v_old_account_id IS NOT NULL THEN
            -- Eski hareketi sil
            DELETE FROM public.account_movements 
            WHERE source_type = 'expense' AND source_id = v_exp_id::text AND organization_id = v_org_id;
            
            -- Eski bakiyeyi iade et
            UPDATE public.accounts 
            SET balance = balance + v_old_amount 
            WHERE id = v_old_account_id AND organization_id = v_org_id;
        END IF;

        -- 2. Yeni Bilgilerle Güncelle
        v_new_account_id := (v_exp->>'account_id')::uuid;
        v_new_amount := (v_exp->>'amount')::numeric;

        UPDATE public.expenses 
        SET 
            name = v_exp->>'name', 
            category = v_exp->>'category', 
            amount = v_new_amount, 
            period = v_exp->>'period', 
            expense_date = (v_exp->>'expense_date')::date, 
            account_id = v_new_account_id
        WHERE id = v_exp_id AND organization_id = v_org_id;

        -- 3. Eğer Yeni Bir Hesap Seçildiyse Yeniden Hareketi İşle
        IF v_new_account_id IS NOT NULL THEN
            INSERT INTO public.account_movements (
                organization_id, account_id, amount, movement_type, description, source_type, source_id
            ) VALUES (
                v_org_id, v_new_account_id, v_new_amount, 'cikis', 'Gider Ödemesi: ' || (v_exp->>'name'), 'expense', v_exp_id::text
            );

            UPDATE public.accounts 
            SET balance = balance - v_new_amount 
            WHERE id = v_new_account_id AND organization_id = v_org_id;
        END IF;

    ELSIF v_action = 'DELETE' THEN
        -- 1. Eski Kaydı Bul ve İptal Et
        SELECT account_id, amount INTO v_old_account_id, v_old_amount 
        FROM public.expenses 
        WHERE id = v_exp_id AND organization_id = v_org_id;
        
        IF v_old_account_id IS NOT NULL THEN
            DELETE FROM public.account_movements 
            WHERE source_type = 'expense' AND source_id = v_exp_id::text AND organization_id = v_org_id;
            
            UPDATE public.accounts 
            SET balance = balance + v_old_amount 
            WHERE id = v_old_account_id AND organization_id = v_org_id;
        END IF;

        -- 2. Gideri Tamamen Sil
        DELETE FROM public.expenses WHERE id = v_exp_id AND organization_id = v_org_id;
    END IF;

END;
$$;


ALTER FUNCTION "public"."manage_expense"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_cash_reconciliation"("payload" json) RETURNS json
    LANGUAGE "plpgsql"
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


ALTER FUNCTION "public"."process_cash_reconciliation"("payload" json) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_investment_rent"("p_investment_id" "uuid", "p_account_id" "uuid", "p_amount" numeric) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_current_balance numeric;
BEGIN
    -- 1. Hesabı kilitle ve bakiyesini al (Lost Update Race Condition'u engeller)
    SELECT balance INTO v_current_balance 
    FROM public.accounts 
    WHERE id = p_account_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hesap bulunamadı.';
    END IF;

    -- 2. Bakiyeyi sunucu tarafında güncelle
    UPDATE public.accounts 
    SET balance = balance + p_amount 
    WHERE id = p_account_id;

    -- 3. Hesap hareketini (Giriş) ekle
    INSERT INTO public.account_movements (
        account_id, movement_type, amount, description, source_type
    ) VALUES (
        p_account_id, 'giris', p_amount, 'Gayrimenkul Kira Geliri Tahsilatı', 'investment_rent'
    );

    -- 4. Yatırım hareketini (Rent) ekle
    INSERT INTO public.investment_transactions (
        investment_id, transaction_type, quantity, price_per_unit, total_amount, account_id
    ) VALUES (
        p_investment_id, 'rent', 1, p_amount, p_amount, p_account_id
    );

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Kira tahsilatı başarısız: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."process_investment_rent"("p_investment_id" "uuid", "p_account_id" "uuid", "p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_receipt_upload"("payload" json) RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_user_id uuid;
    v_batch_id uuid;
    v_image_url text;
    v_supplier_id uuid;
    v_sup_data json;
    v_item json;
    v_items json;
    v_net_debt numeric;
    v_mat_id uuid;
    v_old_price numeric;
    v_old_stock numeric;
    v_new_price numeric;
    v_qty numeric;
    v_audit_details text[] := '{}';
    v_result json;
BEGIN
    v_user_id := (payload->>'user_id')::uuid;
    v_batch_id := (payload->>'batch_id')::uuid;
    v_image_url := payload->>'image_url';
    v_sup_data := payload->'supplier';
    v_items := payload->'items';

    IF v_sup_data IS NOT NULL THEN
        IF (v_sup_data->>'id') IS NOT NULL AND (v_sup_data->>'id') <> '' THEN
            v_supplier_id := (v_sup_data->>'id')::uuid;
        ELSE
            SELECT id INTO v_supplier_id FROM suppliers WHERE TRIM(name) ILIKE TRIM(v_sup_data->>'name') LIMIT 1;
        END IF;
        
        IF v_supplier_id IS NOT NULL THEN
            UPDATE suppliers 
            SET phone = COALESCE(NULLIF(v_sup_data->>'phone', ''), phone),
                iban = COALESCE(NULLIF(v_sup_data->>'iban', ''), iban),
                address = COALESCE(NULLIF(v_sup_data->>'address', ''), address)
            WHERE id = v_supplier_id;
        ELSE
            INSERT INTO suppliers (name, phone, iban, address, user_id)
            VALUES (
                v_sup_data->>'name',
                NULLIF(v_sup_data->>'phone', ''),
                NULLIF(v_sup_data->>'iban', ''),
                NULLIF(v_sup_data->>'address', ''),
                v_user_id
            ) RETURNING id INTO v_supplier_id;
        END IF;

        INSERT INTO supplier_transactions (id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id)
        VALUES (gen_random_uuid(), v_batch_id, v_supplier_id, (v_sup_data->>'date')::date, (v_sup_data->>'totalAmount')::numeric, 'invoice', 'Sistemden Fiş Yükleme (Otomatik Borç)', v_user_id);

        IF (v_sup_data->>'paidAmount')::numeric > 0 THEN
            INSERT INTO supplier_transactions (id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id)
            VALUES (gen_random_uuid(), v_batch_id, v_supplier_id, (v_sup_data->>'date')::date, (v_sup_data->>'paidAmount')::numeric, 'payment', 'Fiş Yükleme Anında Ödeme', v_user_id);
        END IF;

        v_net_debt := (v_sup_data->>'totalAmount')::numeric - (v_sup_data->>'paidAmount')::numeric;
        IF v_net_debt <> 0 THEN
            UPDATE suppliers SET total_debt = COALESCE(total_debt, 0) + v_net_debt WHERE id = v_supplier_id;
        END IF;
    END IF;

    FOR v_item IN SELECT * FROM json_array_elements(v_items)
    LOOP
        IF (v_item->>'matchedMaterialId') IS NOT NULL AND (v_item->>'matchedMaterialId') <> '' THEN
            v_mat_id := (v_item->>'matchedMaterialId')::uuid;
        ELSE
            v_mat_id := NULL;
        END IF;
        
        v_new_price := (v_item->>'unitPrice')::numeric;
        v_qty := (v_item->>'quantity')::numeric;
        
        IF v_mat_id IS NOT NULL THEN
            SELECT price_per_unit, stock_quantity INTO v_old_price, v_old_stock FROM materials WHERE id = v_mat_id FOR UPDATE;
            
            UPDATE materials 
            SET price_per_unit = v_new_price,
                stock_quantity = COALESCE(stock_quantity, 0) + v_qty,
                category = COALESCE(NULLIF(TRIM(v_item->>'category'), ''), category)
            WHERE id = v_mat_id;

            v_audit_details := array_append(v_audit_details, 'Mevcut Ürün: Stok ' || COALESCE(v_old_stock,0)::text || '->' || (COALESCE(v_old_stock,0) + v_qty)::text);

            IF COALESCE(v_old_price, 0) <> v_new_price THEN
                INSERT INTO material_price_history (material_id, old_price, new_price, source)
                VALUES (v_mat_id, COALESCE(v_old_price, 0), v_new_price, 'receipt_upload');
            END IF;
        ELSE
            SELECT id, price_per_unit, stock_quantity INTO v_mat_id, v_old_price, v_old_stock FROM materials WHERE name = (v_item->>'name') LIMIT 1 FOR UPDATE;

            IF v_mat_id IS NOT NULL THEN
                UPDATE materials 
                SET price_per_unit = v_new_price,
                    stock_quantity = COALESCE(stock_quantity, 0) + v_qty,
                    category = COALESCE(NULLIF(TRIM(v_item->>'category'), ''), category)
                WHERE id = v_mat_id;

                v_audit_details := array_append(v_audit_details, 'İsim Eşleşen Ürün: Stok ' || COALESCE(v_old_stock,0)::text || '->' || (COALESCE(v_old_stock,0) + v_qty)::text);

                IF COALESCE(v_old_price, 0) <> v_new_price THEN
                    INSERT INTO material_price_history (material_id, old_price, new_price, source)
                    VALUES (v_mat_id, COALESCE(v_old_price, 0), v_new_price, 'receipt_upload');
                END IF;
            ELSE
                INSERT INTO materials (name, category, unit, price_per_unit, stock_quantity, user_id)
                VALUES (
                    v_item->>'name',
                    COALESCE(NULLIF(v_item->>'category', ''), 'Diğer'),
                    COALESCE(NULLIF(v_item->>'unit', ''), 'Adet'),
                    v_new_price,
                    v_qty,
                    v_user_id
                ) RETURNING id INTO v_mat_id;

                v_audit_details := array_append(v_audit_details, 'YENİ ÜRÜN ' || (v_item->>'name') || ': Fiyat ' || v_new_price::text || ', Stok ' || v_qty::text);

                INSERT INTO material_price_history (material_id, old_price, new_price, source)
                VALUES (v_mat_id, 0, v_new_price, 'receipt_upload');
            END IF;
        END IF;

        IF v_mat_id IS NOT NULL THEN
            INSERT INTO stock_movements (id, batch_id, material_id, supplier_id, movement_type, quantity, unit_price, note, document_url, user_id)
            VALUES (
                gen_random_uuid(),
                v_batch_id,
                v_mat_id,
                v_supplier_id,
                'giris',
                v_qty,
                v_new_price,
                'Yapay Zeka Fiş Yükleme' || COALESCE(' (' || (v_sup_data->>'name') || ')', ''),
                v_image_url,
                v_user_id
            );
        END IF;
    END LOOP;

    v_result := json_build_object(
        'success', true,
        'supplier_id', v_supplier_id,
        'audit_details', array_to_string(v_audit_details, ' | ')
    );

    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Atomic işlem başarısız: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."process_receipt_upload"("payload" json) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_z_report"("p_payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
    v_batch_id uuid;
    
    v_expense jsonb;
    v_acc_mov jsonb;
    v_stock_deduction jsonb;
    
    v_amount numeric;
    v_acc_id uuid;
    v_mov_type text;
    v_mat_id uuid;
    v_qty numeric;
BEGIN
    -- 1. Kimlik ve Organizasyon Doğrulaması
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim. Kullanıcı kimliği bulunamadı.';
    END IF;

    v_org_id := public.current_organization_id();
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Aktif organizasyon bulunamadı. Lütfen işletme seçimi yapın.';
    END IF;

    v_batch_id := (p_payload->>'batch_id')::uuid;

    -- 2. Gelir Kaydı (daily_revenue)
    INSERT INTO public.daily_revenue (
        id,
        organization_id,
        date,
        total_revenue,
        cash_revenue,
        credit_card_revenue,
        other_revenue,
        discounts_total,
        note
    ) VALUES (
        v_batch_id,
        v_org_id,
        (p_payload->>'date')::date,
        (p_payload->>'total_revenue')::numeric,
        COALESCE((p_payload->>'cash_revenue')::numeric, 0),
        COALESCE((p_payload->>'credit_card_revenue')::numeric, 0),
        COALESCE((p_payload->>'other_revenue')::numeric, 0),
        COALESCE((p_payload->>'discounts_total')::numeric, 0),
        p_payload->>'note'
    );

    -- 3. Giderler (expenses)
    IF jsonb_typeof(p_payload->'expenses') = 'array' THEN
        FOR v_expense IN SELECT * FROM jsonb_array_elements(p_payload->'expenses')
        LOOP
            INSERT INTO public.expenses (
                id,
                organization_id,
                name,
                category,
                amount,
                period,
                expense_date,
                batch_id
            ) VALUES (
                gen_random_uuid(),
                v_org_id,
                v_expense->>'name',
                v_expense->>'category',
                (v_expense->>'amount')::numeric,
                'daily',
                (p_payload->>'date')::date,
                v_batch_id
            );
        END LOOP;
    END IF;

    -- 4. Kasa/Hesap Hareketleri (account_movements)
    IF jsonb_typeof(p_payload->'account_movements') = 'array' THEN
        FOR v_acc_mov IN SELECT * FROM jsonb_array_elements(p_payload->'account_movements')
        LOOP
            v_acc_id := (v_acc_mov->>'account_id')::uuid;
            v_amount := (v_acc_mov->>'amount')::numeric;
            v_mov_type := v_acc_mov->>'movement_type';

            -- Hareketi kaydet
            INSERT INTO public.account_movements (
                organization_id,
                account_id,
                amount,
                movement_type,
                description,
                source_type,
                source_id
            ) VALUES (
                v_org_id,
                v_acc_id,
                v_amount,
                v_mov_type,
                v_acc_mov->>'description',
                'z_report',
                v_batch_id::text
            );
            
            -- Bakiyeyi güncelle (Sadece nakit hareketleri bakiye etkiler)
            IF v_mov_type = 'giris' THEN
                UPDATE public.accounts SET balance = balance + v_amount WHERE id = v_acc_id;
            ELSIF v_mov_type = 'cikis' THEN
                UPDATE public.accounts SET balance = balance - v_amount WHERE id = v_acc_id;
            END IF;
        END LOOP;
    END IF;

    -- 5. Stok Düşüşleri (stock_movements & materials)
    IF jsonb_typeof(p_payload->'stock_deductions') = 'array' THEN
        FOR v_stock_deduction IN SELECT * FROM jsonb_array_elements(p_payload->'stock_deductions')
        LOOP
            v_mat_id := (v_stock_deduction->>'material_id')::uuid;
            v_qty := (v_stock_deduction->>'quantity')::numeric;

            IF v_mat_id IS NOT NULL AND v_qty > 0 THEN
                -- Stok Hareketi
                INSERT INTO public.stock_movements (
                    organization_id,
                    material_id,
                    movement_type,
                    quantity,
                    note,
                    batch_id
                ) VALUES (
                    v_org_id,
                    v_mat_id,
                    'cikis',
                    v_qty,
                    'Z-Raporu Satış Düşüşü',
                    v_batch_id
                );
                
                -- Ana Stok Güncellemesi
                UPDATE public.materials 
                SET stock_quantity = COALESCE(stock_quantity, 0) - v_qty
                WHERE id = v_mat_id;
            END IF;
        END LOOP;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Z-Raporu İşleme Hatası: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."process_z_report"("p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_stock_movement"("p_material_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_price" numeric DEFAULT NULL::numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_material record;
    v_old_stock numeric;
    v_new_stock numeric;
    v_final_price numeric;
    v_user_id uuid;
BEGIN
    IF p_material_id IS NULL THEN
        RAISE EXCEPTION 'Hammadde seçimi zorunludur.';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Miktar 0''dan büyük olmalıdır.';
    END IF;

    IF p_movement_type NOT IN ('giris', 'cikis', 'fire') THEN
        RAISE EXCEPTION 'Geçersiz stok hareket türü: %', p_movement_type;
    END IF;

    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum bilgisi bulunamadı. Stok hareketi kaydı için kullanıcı gerekli.';
    END IF;

    SELECT id, name, unit, price_per_unit, stock_quantity
    INTO v_material
    FROM materials
    WHERE id = p_material_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hammadde bulunamadı.';
    END IF;

    v_old_stock := COALESCE(v_material.stock_quantity, 0);
    v_final_price := COALESCE(NULLIF(p_unit_price, 0), v_material.price_per_unit, 0);

    IF p_movement_type IN ('cikis', 'fire') AND p_quantity > v_old_stock THEN
        RAISE EXCEPTION '% için yeterli stok yok. Mevcut: % %', v_material.name, v_old_stock, v_material.unit;
    END IF;

    IF p_movement_type = 'giris' THEN
        v_new_stock := v_old_stock + p_quantity;
    ELSE
        v_new_stock := v_old_stock - p_quantity;
    END IF;

    INSERT INTO stock_movements (material_id, movement_type, quantity, unit_price, note, user_id)
    VALUES (p_material_id, p_movement_type, p_quantity, v_final_price, COALESCE(p_note, ''), v_user_id);

    UPDATE materials
    SET stock_quantity = v_new_stock
    WHERE id = p_material_id;

    RETURN json_build_object(
        'material_id', v_material.id,
        'material_name', v_material.name,
        'unit', v_material.unit,
        'movement_type', p_movement_type,
        'quantity', p_quantity,
        'unit_price', v_final_price,
        'old_stock', v_old_stock,
        'new_stock', v_new_stock
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Stok hareketi kaydedilemedi: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."record_stock_movement"("p_material_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_price" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sec_102_prevent_organization_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION USING
            MESSAGE = format('organization_id cannot be changed on %I.%I.', TG_TABLE_SCHEMA, TG_TABLE_NAME),
            HINT = 'Delete and recreate the row in the intended organization instead.';
    END IF;

    RETURN NEW;
END
$$;


ALTER FUNCTION "public"."sec_102_prevent_organization_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sec_102_set_organization_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
    IF NEW.organization_id IS NULL THEN
        NEW.organization_id := public.current_organization_id();
    END IF;

    IF NEW.organization_id IS NULL THEN
        RAISE EXCEPTION USING
            MESSAGE = format('No active organization is available for insert into %I.%I.', TG_TABLE_SCHEMA, TG_TABLE_NAME),
            HINT = 'Set profiles.active_organization_id to an organization the user belongs to.';
    END IF;

    -- Privileged migration/service actors have no auth.uid(). They may insert only
    -- when organization_id is supplied explicitly; tenantless privileged writes
    -- have already failed above.
    IF auth.uid() IS NOT NULL
       AND NOT public.is_organization_member(NEW.organization_id, auth.uid()) THEN
        RAISE EXCEPTION 'User % is not an active member of organization %.', auth.uid(), NEW.organization_id;
    END IF;

    RETURN NEW;
END
$$;


ALTER FUNCTION "public"."sec_102_set_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_default_organization"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    default_org UUID;
BEGIN
    IF NEW.organization_id IS NULL THEN
        -- Kullanıcının İLK (en eski) üye olduğu asıl organizasyonu seç
        SELECT organization_id INTO default_org 
        FROM public.organization_members 
        WHERE user_id = (SELECT auth.uid()) 
        ORDER BY created_at ASC
        LIMIT 1;

        IF default_org IS NOT NULL THEN
            NEW.organization_id := default_org;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_default_organization"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."account_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "movement_type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "description" "text",
    "source_type" "text",
    "source_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."account_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "balance" numeric(15,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "module" character varying(100) NOT NULL,
    "action_type" character varying(50) NOT NULL,
    "description" "text" NOT NULL,
    "details" "jsonb",
    "user_id" character varying(100) DEFAULT 'Yönetici'::character varying,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_logs_yedek" (
    "id" "uuid",
    "created_at" timestamp with time zone,
    "module" character varying(100),
    "action_type" character varying(50),
    "description" "text",
    "details" "jsonb",
    "user_id" character varying(100),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."activity_logs_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "usage_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "counted_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "counted_credit_card" numeric(10,2) DEFAULT 0 NOT NULL,
    "counted_meal_card" numeric(10,2) DEFAULT 0 NOT NULL,
    "expected_cash" numeric(10,2) DEFAULT 0 NOT NULL,
    "expected_credit_card" numeric(10,2) DEFAULT 0 NOT NULL,
    "expected_meal_card" numeric(10,2) DEFAULT 0 NOT NULL,
    "cash_variance" numeric(10,2) DEFAULT 0 NOT NULL,
    "credit_card_variance" numeric(10,2) DEFAULT 0 NOT NULL,
    "meal_card_variance" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" character varying(20) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."cash_reconciliations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_revenue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "total_revenue" numeric(12,2) DEFAULT 0,
    "cash_revenue" numeric(12,2) DEFAULT 0,
    "credit_card_revenue" numeric(12,2) DEFAULT 0,
    "other_revenue" numeric(12,2) DEFAULT 0,
    "discounts_total" numeric(12,2) DEFAULT 0,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_revenue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "period" "text" DEFAULT 'monthly'::"text",
    "expense_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "account_id" "uuid"
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses_yedek" (
    "id" "uuid",
    "name" "text",
    "category" "text",
    "amount" numeric(10,2),
    "period" "text",
    "expense_date" "date",
    "created_at" timestamp with time zone,
    "batch_id" "uuid",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."expenses_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "stock_quantity" numeric(10,3) DEFAULT 0,
    "critical_stock_level" numeric(10,3) DEFAULT 0,
    "supplier_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients_yedek" (
    "id" "uuid",
    "name" "text",
    "unit" "text",
    "unit_price" numeric(10,2),
    "stock_quantity" numeric(10,3),
    "critical_stock_level" numeric(10,3),
    "supplier_id" "uuid",
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ingredients_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."investment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "investment_id" "uuid",
    "transaction_type" character varying(20) NOT NULL,
    "quantity" numeric(12,4) NOT NULL,
    "price_per_unit" numeric(12,4) NOT NULL,
    "total_amount" numeric(12,4) NOT NULL,
    "account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "transaction_date" "date",
    "document_url" "text",
    "notes" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."investment_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."investments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "asset_type" character varying(50) NOT NULL,
    "name" character varying(100) NOT NULL,
    "quantity" numeric(12,4) DEFAULT 0,
    "average_cost" numeric(12,4) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "current_manual_value" numeric(12,4) DEFAULT 0,
    "notes" "text",
    "purchase_date" "date" DEFAULT CURRENT_DATE,
    "document_url" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."investments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid",
    "old_price" numeric(10,2) NOT NULL,
    "new_price" numeric(10,2) NOT NULL,
    "source" character varying(50) DEFAULT 'manual'::character varying,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."material_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_price_history_yedek" (
    "id" "uuid",
    "material_id" "uuid",
    "old_price" numeric(10,2),
    "new_price" numeric(10,2),
    "source" character varying(50),
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."material_price_history_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "unit" character varying(50) NOT NULL,
    "price_per_unit" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "stock_quantity" numeric DEFAULT 0,
    "critical_stock_level" numeric DEFAULT 0,
    "category" "text" DEFAULT 'Diğer'::"text",
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materials_yedek" (
    "id" "uuid",
    "name" character varying(255),
    "unit" character varying(50),
    "price_per_unit" numeric(10,2),
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "stock_quantity" numeric,
    "critical_stock_level" numeric,
    "category" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."materials_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'staff'::"text", 'accountant'::"text"]))),
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'suspended'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_by" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_calculations" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "product_id" "uuid",
    "raw_cost" numeric(10,2),
    "expense_share" numeric(10,2),
    "tax_rate" numeric(5,2) DEFAULT 10,
    "target_margin" numeric(5,2) DEFAULT 35,
    "suggested_price" numeric(10,2),
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."price_calculations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_calculations_yedek" (
    "id" "uuid",
    "product_id" "uuid",
    "raw_cost" numeric(10,2),
    "expense_share" numeric(10,2),
    "tax_rate" numeric(5,2),
    "target_margin" numeric(5,2),
    "suggested_price" numeric(10,2),
    "calculated_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."price_calculations_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "material_id" "uuid",
    "sub_recipe_id" "uuid",
    "quantity" numeric(10,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "organization_id" "uuid" NOT NULL,
    CONSTRAINT "check_ingredient_type" CHECK (((("material_id" IS NOT NULL) AND ("sub_recipe_id" IS NULL)) OR (("material_id" IS NULL) AND ("sub_recipe_id" IS NOT NULL))))
);


ALTER TABLE "public"."product_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_ingredients_yedek" (
    "id" "uuid",
    "product_id" "uuid",
    "material_id" "uuid",
    "sub_recipe_id" "uuid",
    "quantity" numeric(10,4),
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_ingredients_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "category" character varying(100),
    "sale_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "estimated_monthly_sales" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "calculated_cost" numeric DEFAULT 0,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products_yedek" (
    "id" "uuid",
    "name" character varying(255),
    "category" character varying(100),
    "sale_price" numeric(10,2),
    "estimated_monthly_sales" integer,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "calculated_cost" numeric,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."products_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "active_organization_id" "uuid",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "phone" character varying(50)
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "product_id" "uuid",
    "ingredient_id" "uuid",
    "quantity" numeric(10,3) NOT NULL,
    "waste_percentage" numeric(5,2) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes_yedek" (
    "id" "uuid",
    "product_id" "uuid",
    "ingredient_id" "uuid",
    "quantity" numeric(10,3),
    "waste_percentage" numeric(5,2),
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."recipes_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "total_price" numeric(10,2) NOT NULL,
    "sale_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid",
    "document_url" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_yedek" (
    "id" "uuid",
    "product_id" "uuid",
    "quantity" integer,
    "unit_price" numeric(10,2),
    "total_price" numeric(10,2),
    "sale_date" timestamp with time zone,
    "created_at" timestamp with time zone,
    "batch_id" "uuid",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sales_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings" (
    "key" "text" DEFAULT "auth"."uid"() NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settings_yedek" (
    "key" "text",
    "value" "jsonb",
    "updated_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."settings_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid",
    "movement_type" "text" NOT NULL,
    "quantity" numeric(10,3) NOT NULL,
    "unit_price" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "supplier_id" "uuid",
    "batch_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "document_url" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements_yedek" (
    "id" "uuid",
    "material_id" "uuid",
    "movement_type" "text",
    "quantity" numeric(10,3),
    "unit_price" numeric(10,2),
    "note" "text",
    "created_at" timestamp with time zone,
    "supplier_id" "uuid",
    "batch_id" "uuid",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."stock_movements_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sub_recipe_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "quantity" numeric(10,4) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sub_recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_recipe_ingredients_yedek" (
    "id" "uuid",
    "sub_recipe_id" "uuid",
    "material_id" "uuid",
    "quantity" numeric(10,4),
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sub_recipe_ingredients_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "yield_quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "yield_unit" character varying(50) NOT NULL,
    "wastage_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sub_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_recipes_yedek" (
    "id" "uuid",
    "name" character varying(255),
    "yield_quantity" numeric(10,2),
    "yield_unit" character varying(50),
    "wastage_percent" numeric(5,2),
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."sub_recipes_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_transactions" (
    "id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "supplier_id" "uuid",
    "transaction_date" "date" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "transaction_type" "text" NOT NULL,
    "note" "text",
    "batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."supplier_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_transactions_yedek" (
    "id" "uuid",
    "supplier_id" "uuid",
    "transaction_date" "date",
    "amount" numeric(12,2),
    "transaction_type" "text",
    "note" "text",
    "batch_id" "uuid",
    "created_at" timestamp with time zone,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."supplier_transactions_yedek" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "total_debt" numeric(12,2) DEFAULT 0,
    "iban" character varying(100),
    "address" "text",
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers_yedek" (
    "id" "uuid",
    "name" "text",
    "contact_name" "text",
    "phone" "text",
    "email" "text",
    "created_at" timestamp with time zone,
    "total_debt" numeric(12,2),
    "iban" character varying(100),
    "address" "text",
    "organization_id" "uuid" NOT NULL
);


ALTER TABLE "public"."suppliers_yedek" OWNER TO "postgres";


ALTER TABLE ONLY "public"."account_movements"
    ADD CONSTRAINT "account_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_organization_id_usage_date_key" UNIQUE ("organization_id", "usage_date");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_reconciliations"
    ADD CONSTRAINT "cash_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_revenue"
    ADD CONSTRAINT "daily_revenue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "investment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."investments"
    ADD CONSTRAINT "investments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "material_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."price_calculations"
    ADD CONSTRAINT "price_calculations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_reconciliations"
    ADD CONSTRAINT "sec_102_cash_reconciliations_organization_date_key" UNIQUE ("organization_id", "date");



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("organization_id", "key");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sub_recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_recipes"
    ADD CONSTRAINT "sub_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_transactions"
    ADD CONSTRAINT "supplier_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_account_movements_org_id" ON "public"."account_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_account_movements_organization_id" ON "public"."account_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_accounts_org_id" ON "public"."accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_accounts_organization_id" ON "public"."accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_module" ON "public"."activity_logs" USING "btree" ("module");



CREATE INDEX "idx_activity_logs_org_id" ON "public"."activity_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_activity_logs_organization_id" ON "public"."activity_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_activity_logs_yedek_org_id" ON "public"."activity_logs_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_ai_usage_logs_org_id" ON "public"."ai_usage_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_cash_reconciliations_org_id" ON "public"."cash_reconciliations" USING "btree" ("organization_id");



CREATE INDEX "idx_cash_reconciliations_organization_id" ON "public"."cash_reconciliations" USING "btree" ("organization_id");



CREATE INDEX "idx_daily_revenue_org_id" ON "public"."daily_revenue" USING "btree" ("organization_id");



CREATE INDEX "idx_expenses_org_id" ON "public"."expenses" USING "btree" ("organization_id");



CREATE INDEX "idx_expenses_organization_id" ON "public"."expenses" USING "btree" ("organization_id");



CREATE INDEX "idx_expenses_yedek_org_id" ON "public"."expenses_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_ingredients_org_id" ON "public"."ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_ingredients_organization_id" ON "public"."ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_ingredients_yedek_org_id" ON "public"."ingredients_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_investment_transactions_org_id" ON "public"."investment_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_investment_transactions_organization_id" ON "public"."investment_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_investments_org_id" ON "public"."investments" USING "btree" ("organization_id");



CREATE INDEX "idx_investments_organization_id" ON "public"."investments" USING "btree" ("organization_id");



CREATE INDEX "idx_material_price_history_org_id" ON "public"."material_price_history" USING "btree" ("organization_id");



CREATE INDEX "idx_material_price_history_organization_id" ON "public"."material_price_history" USING "btree" ("organization_id");



CREATE INDEX "idx_material_price_history_yedek_org_id" ON "public"."material_price_history_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_materials_org_id" ON "public"."materials" USING "btree" ("organization_id");



CREATE INDEX "idx_materials_organization_id" ON "public"."materials" USING "btree" ("organization_id");



CREATE INDEX "idx_materials_yedek_org_id" ON "public"."materials_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_price_calculations_org_id" ON "public"."price_calculations" USING "btree" ("organization_id");



CREATE INDEX "idx_price_calculations_organization_id" ON "public"."price_calculations" USING "btree" ("organization_id");



CREATE INDEX "idx_price_calculations_yedek_org_id" ON "public"."price_calculations_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_product_ingredients_org_id" ON "public"."product_ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_product_ingredients_organization_id" ON "public"."product_ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_product_ingredients_yedek_org_id" ON "public"."product_ingredients_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_products_org_id" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "idx_products_organization_id" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "idx_products_yedek_org_id" ON "public"."products_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_profiles_active_organization_id" ON "public"."profiles" USING "btree" ("active_organization_id");



CREATE INDEX "idx_recipes_org_id" ON "public"."recipes" USING "btree" ("organization_id");



CREATE INDEX "idx_recipes_organization_id" ON "public"."recipes" USING "btree" ("organization_id");



CREATE INDEX "idx_recipes_yedek_org_id" ON "public"."recipes_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_sales_org_id" ON "public"."sales" USING "btree" ("organization_id");



CREATE INDEX "idx_sales_organization_id" ON "public"."sales" USING "btree" ("organization_id");



CREATE INDEX "idx_sales_yedek_org_id" ON "public"."sales_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_settings_org_id" ON "public"."settings" USING "btree" ("organization_id");



CREATE INDEX "idx_settings_organization_id" ON "public"."settings" USING "btree" ("organization_id");



CREATE INDEX "idx_settings_yedek_org_id" ON "public"."settings_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_movements_org_id" ON "public"."stock_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_movements_organization_id" ON "public"."stock_movements" USING "btree" ("organization_id");



CREATE INDEX "idx_stock_movements_yedek_org_id" ON "public"."stock_movements_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipe_ingredients_org_id" ON "public"."sub_recipe_ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipe_ingredients_organization_id" ON "public"."sub_recipe_ingredients" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipe_ingredients_yedek_org_id" ON "public"."sub_recipe_ingredients_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipes_org_id" ON "public"."sub_recipes" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipes_organization_id" ON "public"."sub_recipes" USING "btree" ("organization_id");



CREATE INDEX "idx_sub_recipes_yedek_org_id" ON "public"."sub_recipes_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_supplier_transactions_org_id" ON "public"."supplier_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_supplier_transactions_organization_id" ON "public"."supplier_transactions" USING "btree" ("organization_id");



CREATE INDEX "idx_supplier_transactions_yedek_org_id" ON "public"."supplier_transactions_yedek" USING "btree" ("organization_id");



CREATE INDEX "idx_suppliers_org_id" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_suppliers_organization_id" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_suppliers_yedek_org_id" ON "public"."suppliers_yedek" USING "btree" ("organization_id");



CREATE UNIQUE INDEX "sec_102_accounts_organization_id_id_uidx" ON "public"."accounts" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "sec_102_investments_organization_id_id_uidx" ON "public"."investments" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "sec_102_materials_organization_id_id_uidx" ON "public"."materials" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "sec_102_products_organization_id_id_uidx" ON "public"."products" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "sec_102_sub_recipes_organization_id_id_uidx" ON "public"."sub_recipes" USING "btree" ("organization_id", "id");



CREATE UNIQUE INDEX "sec_102_suppliers_organization_id_id_uidx" ON "public"."suppliers" USING "btree" ("organization_id", "id");



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."account_movements" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."activity_logs" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."cash_reconciliations" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."daily_revenue" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."investment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."investments" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."material_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."price_calculations" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."product_ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."sub_recipe_ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."sub_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."supplier_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "sec_102_prevent_organization_change" BEFORE UPDATE OF "organization_id" ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."sec_102_prevent_organization_change"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."account_movements" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."activity_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."activity_logs_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."ai_usage_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."cash_reconciliations" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."daily_revenue" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."expenses_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."ingredients_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."investment_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."investments" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."material_price_history" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."material_price_history_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."materials" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."materials_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."price_calculations" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."price_calculations_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."product_ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."product_ingredients_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."products_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."recipes_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sales_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."settings_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."stock_movements_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sub_recipe_ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sub_recipe_ingredients_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sub_recipes" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."sub_recipes_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."supplier_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."supplier_transactions_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



CREATE OR REPLACE TRIGGER "set_org_trigger" BEFORE INSERT ON "public"."suppliers_yedek" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_organization"();



ALTER TABLE ONLY "public"."account_movements"
    ADD CONSTRAINT "account_movements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_logs_yedek"
    ADD CONSTRAINT "activity_logs_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_revenue"
    ADD CONSTRAINT "daily_revenue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id");



ALTER TABLE ONLY "public"."expenses_yedek"
    ADD CONSTRAINT "expenses_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."ingredients_yedek"
    ADD CONSTRAINT "ingredients_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "investment_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "investment_transactions_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "material_price_history_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_price_history_yedek"
    ADD CONSTRAINT "material_price_history_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."materials_yedek"
    ADD CONSTRAINT "materials_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."price_calculations_yedek"
    ADD CONSTRAINT "price_calculations_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_sub_recipe_id_fkey" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."sub_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients_yedek"
    ADD CONSTRAINT "product_ingredients_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."products_yedek"
    ADD CONSTRAINT "products_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_active_organization_id_fkey" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."recipes_yedek"
    ADD CONSTRAINT "recipes_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_yedek"
    ADD CONSTRAINT "sales_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_movements"
    ADD CONSTRAINT "sec_102_account_movements_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "sec_102_accounts_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "sec_102_activity_logs_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."account_movements"
    ADD CONSTRAINT "sec_102_am_account_tenant_fk" FOREIGN KEY ("organization_id", "account_id") REFERENCES "public"."accounts"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."cash_reconciliations"
    ADD CONSTRAINT "sec_102_cash_reconciliations_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "sec_102_expenses_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "sec_102_ingredients_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "sec_102_investment_transactions_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."investments"
    ADD CONSTRAINT "sec_102_investments_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "sec_102_it_account_tenant_fk" FOREIGN KEY ("organization_id", "account_id") REFERENCES "public"."accounts"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."investment_transactions"
    ADD CONSTRAINT "sec_102_it_investment_tenant_fk" FOREIGN KEY ("organization_id", "investment_id") REFERENCES "public"."investments"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "sec_102_material_price_history_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "sec_102_materials_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."material_price_history"
    ADD CONSTRAINT "sec_102_mph_material_tenant_fk" FOREIGN KEY ("organization_id", "material_id") REFERENCES "public"."materials"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "sec_102_pi_material_tenant_fk" FOREIGN KEY ("organization_id", "material_id") REFERENCES "public"."materials"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "sec_102_pi_product_tenant_fk" FOREIGN KEY ("organization_id", "product_id") REFERENCES "public"."products"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "sec_102_pi_sub_recipe_tenant_fk" FOREIGN KEY ("organization_id", "sub_recipe_id") REFERENCES "public"."sub_recipes"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."price_calculations"
    ADD CONSTRAINT "sec_102_price_calculations_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "sec_102_product_ingredients_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "sec_102_products_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "sec_102_recipes_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sec_102_sales_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "sec_102_settings_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "sec_102_sm_material_tenant_fk" FOREIGN KEY ("organization_id", "material_id") REFERENCES "public"."materials"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "sec_102_sm_supplier_tenant_fk" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "public"."suppliers"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sec_102_sri_material_tenant_fk" FOREIGN KEY ("organization_id", "material_id") REFERENCES "public"."materials"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sec_102_sri_sub_recipe_tenant_fk" FOREIGN KEY ("organization_id", "sub_recipe_id") REFERENCES "public"."sub_recipes"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."supplier_transactions"
    ADD CONSTRAINT "sec_102_st_supplier_tenant_fk" FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "public"."suppliers"("organization_id", "id") NOT VALID;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "sec_102_stock_movements_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sec_102_sub_recipe_ingredients_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."sub_recipes"
    ADD CONSTRAINT "sec_102_sub_recipes_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."supplier_transactions"
    ADD CONSTRAINT "sec_102_supplier_transactions_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "sec_102_suppliers_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."settings"
    ADD CONSTRAINT "settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."settings_yedek"
    ADD CONSTRAINT "settings_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_movements_yedek"
    ADD CONSTRAINT "stock_movements_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sub_recipe_ingredients_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_recipe_ingredients"
    ADD CONSTRAINT "sub_recipe_ingredients_sub_recipe_id_fkey" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."sub_recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_recipe_ingredients_yedek"
    ADD CONSTRAINT "sub_recipe_ingredients_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_recipes"
    ADD CONSTRAINT "sub_recipes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sub_recipes_yedek"
    ADD CONSTRAINT "sub_recipes_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_transactions"
    ADD CONSTRAINT "supplier_transactions_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_transactions"
    ADD CONSTRAINT "supplier_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."supplier_transactions_yedek"
    ADD CONSTRAINT "supplier_transactions_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."suppliers_yedek"
    ADD CONSTRAINT "suppliers_yedek_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Tenant Isolation Policy" ON "public"."account_movements" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."accounts" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."activity_logs" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."activity_logs_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."ai_usage_logs" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."cash_reconciliations" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."daily_revenue" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."expenses" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."expenses_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."ingredients" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."ingredients_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."investment_transactions" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."investments" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."material_price_history" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."material_price_history_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."materials" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."materials_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."price_calculations" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."price_calculations_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."product_ingredients" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."product_ingredients_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."products" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."products_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."recipes" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."recipes_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sales" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sales_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."settings" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."settings_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."stock_movements" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."stock_movements_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sub_recipe_ingredients" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sub_recipe_ingredients_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sub_recipes" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."sub_recipes_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."supplier_transactions" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."supplier_transactions_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."suppliers" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Tenant Isolation Policy" ON "public"."suppliers_yedek" USING (("organization_id" = ANY ("private"."get_user_organizations"()))) WITH CHECK (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "View own organization members" ON "public"."organization_members" FOR SELECT USING (("organization_id" = ANY ("private"."get_user_organizations"())));



CREATE POLICY "View own organizations" ON "public"."organizations" FOR SELECT USING (("id" = ANY ("private"."get_user_organizations"())));



ALTER TABLE "public"."account_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_logs_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_reconciliations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_revenue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."expenses_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."investment_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."investments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_price_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_price_history_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."materials_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_calculations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."price_calculations_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_ingredients_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settings_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_recipe_ingredients_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_recipes_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."supplier_transactions_yedek" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers_yedek" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_supplier_payment_transaction"("p_supplier_id" "uuid", "p_supplier_name" "text", "p_amount" numeric, "p_note" "text", "p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_supplier_payment_transaction"("p_supplier_id" "uuid", "p_supplier_name" "text", "p_amount" numeric, "p_note" "text", "p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_supplier_payment_transaction"("p_supplier_id" "uuid", "p_supplier_name" "text", "p_amount" numeric, "p_note" "text", "p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_stock_count"("p_items" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_stock_count"("p_items" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_stock_count"("p_items" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."buy_investment_transaction"("p_asset_type" "text", "p_name" "text", "p_quantity" numeric, "p_price" numeric, "p_account_id" "uuid", "p_notes" "text", "p_purchase_date" "date", "p_document_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buy_investment_transaction"("p_asset_type" "text", "p_name" "text", "p_quantity" numeric, "p_price" numeric, "p_account_id" "uuid", "p_notes" "text", "p_purchase_date" "date", "p_document_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buy_investment_transaction"("p_asset_type" "text", "p_name" "text", "p_quantity" numeric, "p_price" numeric, "p_account_id" "uuid", "p_notes" "text", "p_purchase_date" "date", "p_document_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_ai_quota"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_ai_quota"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_ai_quota"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_organization_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_investment_transaction"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_investment_transaction"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_investment_transaction"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_receipt_transaction"("p_batch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_receipt_transaction"("p_batch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_receipt_transaction"("p_batch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_supplier_transaction"("p_transaction_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_supplier_transaction"("p_transaction_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_supplier_transaction"("p_transaction_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_z_report_transaction"("p_batch_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_z_report_transaction"("p_batch_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_z_report_transaction"("p_batch_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("days_ago" integer, "default_target_margin" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("days_ago" integer, "default_target_margin" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_dashboard_stats"("days_ago" integer, "default_target_margin" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_organizations"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_organizations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_info"("user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_info"("user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_info"("user_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_organization_role"("p_organization_id" "uuid", "p_roles" "text"[], "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_organization_member"("p_organization_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_expense"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."manage_expense"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_expense"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_cash_reconciliation"("payload" json) TO "anon";
GRANT ALL ON FUNCTION "public"."process_cash_reconciliation"("payload" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_cash_reconciliation"("payload" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_investment_rent"("p_investment_id" "uuid", "p_account_id" "uuid", "p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."process_investment_rent"("p_investment_id" "uuid", "p_account_id" "uuid", "p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_investment_rent"("p_investment_id" "uuid", "p_account_id" "uuid", "p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_receipt_upload"("payload" json) TO "anon";
GRANT ALL ON FUNCTION "public"."process_receipt_upload"("payload" json) TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_receipt_upload"("payload" json) TO "service_role";



GRANT ALL ON FUNCTION "public"."process_z_report"("p_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."process_z_report"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_z_report"("p_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_stock_movement"("p_material_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_price" numeric, "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_stock_movement"("p_material_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_price" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_stock_movement"("p_material_id" "uuid", "p_movement_type" "text", "p_quantity" numeric, "p_unit_price" numeric, "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sec_102_prevent_organization_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sec_102_prevent_organization_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."sec_102_prevent_organization_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sec_102_prevent_organization_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sec_102_set_organization_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sec_102_set_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sec_102_set_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sec_102_set_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_organization"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_organization"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_organization"() TO "service_role";



GRANT ALL ON TABLE "public"."account_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."account_movements" TO "service_role";



GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs_yedek" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cash_reconciliations" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_reconciliations" TO "service_role";



GRANT ALL ON TABLE "public"."daily_revenue" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_revenue" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."expenses_yedek" TO "anon";
GRANT ALL ON TABLE "public"."expenses_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients_yedek" TO "anon";
GRANT ALL ON TABLE "public"."ingredients_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."investment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."investment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."investments" TO "authenticated";
GRANT ALL ON TABLE "public"."investments" TO "service_role";



GRANT ALL ON TABLE "public"."material_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."material_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."material_price_history_yedek" TO "anon";
GRANT ALL ON TABLE "public"."material_price_history_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."material_price_history_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON TABLE "public"."materials_yedek" TO "anon";
GRANT ALL ON TABLE "public"."materials_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."materials_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."price_calculations" TO "authenticated";
GRANT ALL ON TABLE "public"."price_calculations" TO "service_role";



GRANT ALL ON TABLE "public"."price_calculations_yedek" TO "anon";
GRANT ALL ON TABLE "public"."price_calculations_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."price_calculations_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."product_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."product_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."product_ingredients_yedek" TO "anon";
GRANT ALL ON TABLE "public"."product_ingredients_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."product_ingredients_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."products_yedek" TO "anon";
GRANT ALL ON TABLE "public"."products_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."products_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT ALL ON TABLE "public"."recipes_yedek" TO "anon";
GRANT ALL ON TABLE "public"."recipes_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."sales_yedek" TO "anon";
GRANT ALL ON TABLE "public"."sales_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."settings" TO "authenticated";
GRANT ALL ON TABLE "public"."settings" TO "service_role";



GRANT ALL ON TABLE "public"."settings_yedek" TO "anon";
GRANT ALL ON TABLE "public"."settings_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."settings_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements_yedek" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."sub_recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."sub_recipe_ingredients_yedek" TO "anon";
GRANT ALL ON TABLE "public"."sub_recipe_ingredients_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_recipe_ingredients_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."sub_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."sub_recipes_yedek" TO "anon";
GRANT ALL ON TABLE "public"."sub_recipes_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_recipes_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_transactions_yedek" TO "anon";
GRANT ALL ON TABLE "public"."supplier_transactions_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_transactions_yedek" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers_yedek" TO "anon";
GRANT ALL ON TABLE "public"."suppliers_yedek" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers_yedek" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








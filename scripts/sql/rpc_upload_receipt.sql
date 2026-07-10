-- ==============================================================================
-- FONKSİYON: process_receipt_upload
-- AMACI: Fiş yükleme ekranındaki tüm tedarikçi, fatura borcu, stok ve fiyat 
-- güncellemelerini TEK BİR ATOMİK TRANSACTION içinde yapar.
-- Hata anında tüm işlemler geri alınır (Rollback).
-- ==============================================================================

CREATE OR REPLACE FUNCTION process_receipt_upload(payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
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
        SELECT id INTO v_supplier_id FROM suppliers WHERE name ILIKE (v_sup_data->>'name') LIMIT 1;
        
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

        INSERT INTO supplier_transactions (batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id)
        VALUES (v_batch_id, v_supplier_id, (v_sup_data->>'date')::date, (v_sup_data->>'totalAmount')::numeric, 'invoice', 'Sistemden Fiş Yükleme (Otomatik Borç)', v_user_id);

        IF (v_sup_data->>'paidAmount')::numeric > 0 THEN
            INSERT INTO supplier_transactions (batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id)
            VALUES (v_batch_id, v_supplier_id, (v_sup_data->>'date')::date, (v_sup_data->>'paidAmount')::numeric, 'payment', 'Fiş Yükleme Anında Ödeme', v_user_id);
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
            INSERT INTO stock_movements (batch_id, material_id, supplier_id, movement_type, quantity, unit_price, note, document_url, user_id)
            VALUES (
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

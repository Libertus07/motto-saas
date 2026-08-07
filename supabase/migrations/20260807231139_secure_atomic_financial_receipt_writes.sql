CREATE OR REPLACE FUNCTION public.process_receipt_upload(payload json)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_organization_id uuid := NULLIF(payload->>'organization_id', '')::uuid;
    v_replace_batch_id uuid := NULLIF(payload->>'replace_batch_id', '')::uuid;
    v_batch_id uuid := NULLIF(payload->>'batch_id', '')::uuid;
    v_image_url text := NULLIF(payload->>'image_url', '');
    v_supplier_id uuid;
    v_supplier json := payload->'supplier';
    v_item json;
    v_items json := payload->'items';
    v_material_id uuid;
    v_old_price numeric;
    v_old_stock numeric;
    v_new_price numeric;
    v_quantity numeric;
    v_net_debt numeric;
    v_audit_details text[] := ARRAY[]::text[];
    v_movement record;
    v_transaction record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF v_batch_id IS NULL OR json_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'Geçerli fiş bilgileri gereklidir.' USING ERRCODE = '22023';
    END IF;

    IF v_replace_batch_id IS NOT NULL THEN
        PERFORM 1
        FROM public.supplier_transactions
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Değiştirilecek fiş bulunamadı.' USING ERRCODE = 'P0002';
        END IF;

        FOR v_movement IN
            SELECT material_id, quantity
            FROM public.stock_movements
            WHERE batch_id = v_replace_batch_id
              AND organization_id = v_organization_id
        LOOP
            UPDATE public.materials
            SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_movement.quantity)
            WHERE id = v_movement.material_id
              AND organization_id = v_organization_id;
        END LOOP;

        FOR v_transaction IN
            SELECT supplier_id, amount, transaction_type
            FROM public.supplier_transactions
            WHERE batch_id = v_replace_batch_id
              AND organization_id = v_organization_id
        LOOP
            UPDATE public.suppliers
            SET total_debt = COALESCE(total_debt, 0)
                + CASE
                    WHEN v_transaction.transaction_type = 'invoice' THEN -v_transaction.amount
                    WHEN v_transaction.transaction_type = 'payment' THEN v_transaction.amount
                    ELSE 0
                  END
            WHERE id = v_transaction.supplier_id
              AND organization_id = v_organization_id;
        END LOOP;

        DELETE FROM public.stock_movements
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id;
        DELETE FROM public.supplier_transactions
        WHERE batch_id = v_replace_batch_id
          AND organization_id = v_organization_id;
        DELETE FROM public.account_movements
        WHERE source_id = v_replace_batch_id::text
          AND organization_id = v_organization_id;
    END IF;

    IF v_supplier IS NOT NULL AND json_typeof(v_supplier) <> 'null' THEN
        v_supplier_id := NULLIF(v_supplier->>'id', '')::uuid;

        IF v_supplier_id IS NOT NULL THEN
            PERFORM 1
            FROM public.suppliers
            WHERE id = v_supplier_id
              AND organization_id = v_organization_id
            FOR UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Tedarikçi bulunamadı.' USING ERRCODE = 'P0002';
            END IF;
        ELSE
            SELECT id
            INTO v_supplier_id
            FROM public.suppliers
            WHERE organization_id = v_organization_id
              AND btrim(name) ILIKE btrim(v_supplier->>'name')
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE;
        END IF;

        IF v_supplier_id IS NOT NULL THEN
            UPDATE public.suppliers
            SET phone = COALESCE(NULLIF(v_supplier->>'phone', ''), phone),
                iban = COALESCE(NULLIF(v_supplier->>'iban', ''), iban),
                address = COALESCE(NULLIF(v_supplier->>'address', ''), address)
            WHERE id = v_supplier_id
              AND organization_id = v_organization_id;
        ELSE
            INSERT INTO public.suppliers (name, phone, iban, address, user_id, organization_id)
            VALUES (
                btrim(v_supplier->>'name'),
                NULLIF(v_supplier->>'phone', ''),
                NULLIF(v_supplier->>'iban', ''),
                NULLIF(v_supplier->>'address', ''),
                v_user_id,
                v_organization_id
            )
            RETURNING id INTO v_supplier_id;
        END IF;

        INSERT INTO public.supplier_transactions (
            id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
        )
        VALUES (
            gen_random_uuid(), v_batch_id, v_supplier_id, (v_supplier->>'date')::date,
            (v_supplier->>'totalAmount')::numeric, 'invoice', 'Sistemden Fiş Yükleme (Otomatik Borç)',
            v_user_id, v_organization_id
        );

        IF COALESCE((v_supplier->>'paidAmount')::numeric, 0) > 0 THEN
            INSERT INTO public.supplier_transactions (
                id, batch_id, supplier_id, transaction_date, amount, transaction_type, note, user_id, organization_id
            )
            VALUES (
                gen_random_uuid(), v_batch_id, v_supplier_id, (v_supplier->>'date')::date,
                (v_supplier->>'paidAmount')::numeric, 'payment', 'Fiş Yükleme Anında Ödeme',
                v_user_id, v_organization_id
            );
        END IF;

        v_net_debt := (v_supplier->>'totalAmount')::numeric - COALESCE((v_supplier->>'paidAmount')::numeric, 0);
        UPDATE public.suppliers
        SET total_debt = COALESCE(total_debt, 0) + v_net_debt
        WHERE id = v_supplier_id
          AND organization_id = v_organization_id;
    END IF;

    FOR v_item IN SELECT value FROM json_array_elements(v_items)
    LOOP
        v_material_id := NULLIF(v_item->>'matchedMaterialId', '')::uuid;
        v_new_price := (v_item->>'unitPrice')::numeric;
        v_quantity := (v_item->>'quantity')::numeric;

        IF v_new_price < 0 OR v_quantity <= 0 THEN
            RAISE EXCEPTION 'Geçerli malzeme miktarı ve fiyatı gereklidir.' USING ERRCODE = '22023';
        END IF;

        IF v_material_id IS NOT NULL THEN
            SELECT price_per_unit, stock_quantity
            INTO v_old_price, v_old_stock
            FROM public.materials
            WHERE id = v_material_id
              AND organization_id = v_organization_id
            FOR UPDATE;
        ELSE
            SELECT id, price_per_unit, stock_quantity
            INTO v_material_id, v_old_price, v_old_stock
            FROM public.materials
            WHERE organization_id = v_organization_id
              AND name = v_item->>'name'
            ORDER BY created_at, id
            LIMIT 1
            FOR UPDATE;
        END IF;

        IF v_material_id IS NOT NULL THEN
            UPDATE public.materials
            SET price_per_unit = v_new_price,
                stock_quantity = COALESCE(stock_quantity, 0) + v_quantity,
                category = COALESCE(NULLIF(btrim(v_item->>'category'), ''), category)
            WHERE id = v_material_id
              AND organization_id = v_organization_id;
            v_audit_details := array_append(
                v_audit_details,
                'Mevcut Ürün: Stok ' || COALESCE(v_old_stock, 0)::text || '->'
                    || (COALESCE(v_old_stock, 0) + v_quantity)::text
            );
        ELSE
            INSERT INTO public.materials (
                name, category, unit, price_per_unit, stock_quantity, user_id, organization_id
            )
            VALUES (
                v_item->>'name', COALESCE(NULLIF(v_item->>'category', ''), 'Diğer'),
                COALESCE(NULLIF(v_item->>'unit', ''), 'Adet'), v_new_price, v_quantity,
                v_user_id, v_organization_id
            )
            RETURNING id INTO v_material_id;
            v_old_price := 0;
            v_audit_details := array_append(v_audit_details, 'YENİ ÜRÜN ' || (v_item->>'name'));
        END IF;

        IF COALESCE(v_old_price, 0) <> v_new_price THEN
            INSERT INTO public.material_price_history (
                material_id, old_price, new_price, source, organization_id
            )
            VALUES (
                v_material_id, COALESCE(v_old_price, 0), v_new_price, 'receipt_upload', v_organization_id
            );
        END IF;

        INSERT INTO public.stock_movements (
            id, batch_id, material_id, supplier_id, movement_type, quantity, unit_price,
            note, document_url, user_id, organization_id
        )
        VALUES (
            gen_random_uuid(), v_batch_id, v_material_id, v_supplier_id, 'giris',
            v_quantity, v_new_price, 'Yapay Zeka Fiş Yükleme', v_image_url,
            v_user_id, v_organization_id
        );
    END LOOP;

    INSERT INTO public.activity_logs (
        module, action_type, description, details, user_id, organization_id
    )
    VALUES (
        'Tedarikçi Fişleri',
        CASE WHEN v_replace_batch_id IS NULL THEN 'EKLEME' ELSE 'GUNCELLEME' END,
        CASE WHEN v_replace_batch_id IS NULL
            THEN 'Tedarikçi fişi kaydedildi'
            ELSE 'Tedarikçi fişi atomik olarak değiştirildi'
        END,
        jsonb_build_object(
            'batch_id', v_batch_id,
            'replaced_batch_id', v_replace_batch_id,
            'supplier_id', v_supplier_id,
            'document_reference', v_image_url
        ),
        v_user_id::text,
        v_organization_id
    );

    RETURN json_build_object(
        'success', true,
        'supplier_id', v_supplier_id,
        'audit_details', array_to_string(v_audit_details, ' | ')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.buy_investment_transaction(
    p_asset_type text,
    p_name text,
    p_quantity numeric,
    p_price numeric,
    p_account_id uuid,
    p_notes text,
    p_purchase_date date,
    p_document_url text,
    p_organization_id uuid,
    p_replace_transaction_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_transaction_id uuid;
BEGIN
    IF auth.uid() IS NULL
       OR p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, auth.uid()) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_replace_transaction_id IS NOT NULL THEN
        PERFORM 1
        FROM public.investment_transactions
        WHERE id = p_replace_transaction_id
          AND organization_id = p_organization_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Değiştirilecek yatırım fişi bulunamadı.' USING ERRCODE = 'P0002';
        END IF;
        PERFORM public.delete_investment_transaction(p_replace_transaction_id, p_organization_id);
    END IF;

    v_transaction_id := public.buy_investment_transaction(
        p_asset_type, p_name, p_quantity, p_price, p_account_id, p_notes,
        p_purchase_date, p_document_url, p_organization_id
    );
    RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_receipt_upload(json) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_receipt_upload(json) TO authenticated;

ALTER FUNCTION public.delete_receipt_transaction(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.delete_receipt_transaction(uuid, uuid)
SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.delete_receipt_transaction(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_receipt_transaction(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.buy_investment_transaction(
    text, text, numeric, numeric, uuid, text, date, text, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_investment_transaction(
    text, text, numeric, numeric, uuid, text, date, text, uuid, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION private.is_valid_financial_document_upload(
    p_bucket_id text,
    p_name text,
    p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT
        p_bucket_id IN ('motto_assets', 'receipts')
        AND cardinality(storage.foldername(p_name)) = 2
        AND (storage.foldername(p_name))[1] ~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        AND p_name ~
            '^[0-9a-fA-F-]{36}/(supplier-receipt|investment-receipt|investment-document|z-report)/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.[a-z0-9]+$'
        AND COALESCE(
            (p_metadata->>'size')::bigint,
            (p_metadata->>'contentLength')::bigint,
            -1
        ) BETWEEN 0 AND
            CASE
                WHEN (storage.foldername(p_name))[2] IN ('supplier-receipt', 'z-report')
                    THEN 10485760
                ELSE 3145728
            END
        AND CASE (storage.foldername(p_name))[2]
            WHEN 'supplier-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND (
                    (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                        ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                        ('webp', 'image/webp'), ('pdf', 'application/pdf'),
                        ('xml', 'application/xml'), ('xml', 'text/xml'),
                        ('json', 'application/json'), ('xls', 'application/vnd.ms-excel'),
                        ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                    )
                )
            WHEN 'investment-receipt' THEN
                p_bucket_id = 'motto_assets'
                AND (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                    ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                    ('webp', 'image/webp'), ('pdf', 'application/pdf')
                )
            WHEN 'investment-document' THEN
                p_bucket_id = 'motto_assets'
                AND (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                    ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                    ('webp', 'image/webp'), ('pdf', 'application/pdf')
                )
            WHEN 'z-report' THEN
                p_bucket_id = 'receipts'
                AND (
                    (lower(storage.extension(p_name)), lower(p_metadata->>'mimetype')) IN (
                        ('jpg', 'image/jpeg'), ('jpeg', 'image/jpeg'), ('png', 'image/png'),
                        ('webp', 'image/webp'), ('pdf', 'application/pdf'),
                        ('xml', 'application/xml'), ('xml', 'text/xml'),
                        ('json', 'application/json'), ('xls', 'application/vnd.ms-excel'),
                        ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                    )
                )
            ELSE false
        END;
$$;

REVOKE ALL ON FUNCTION private.is_valid_financial_document_upload(text, text, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_valid_financial_document_upload(text, text, jsonb)
TO authenticated, service_role;

DROP POLICY IF EXISTS "Financial documents can be inserted by active organization members" ON storage.objects;
CREATE POLICY "Financial documents can be inserted by active organization members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    private.is_valid_financial_document_upload(bucket_id, name, metadata)
    AND private.can_access_organization_document(bucket_id, name)
);

DROP POLICY IF EXISTS "Financial documents can be updated by their active organization owner" ON storage.objects;
CREATE POLICY "Financial documents can be updated by their active organization owner"
ON storage.objects FOR UPDATE TO authenticated
USING (
    owner_id = (SELECT auth.uid()::text)
    AND private.can_access_organization_document(bucket_id, name)
)
WITH CHECK (
    owner_id = (SELECT auth.uid()::text)
    AND private.can_access_organization_document(bucket_id, name)
    AND private.is_valid_financial_document_upload(bucket_id, name, metadata)
);

NOTIFY pgrst, 'reload schema';

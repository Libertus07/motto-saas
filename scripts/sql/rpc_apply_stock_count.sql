-- ==============================================================================
-- FONKSİYON: apply_stock_count
-- AMACI: Sayım farklarını TEK BİR ATOMİK TRANSACTION içinde uygulamak;
-- stock_movements tablosuna sayım hareketleri yazmak, materials stoklarını güncellemek
-- ve son sayım tarihini settings tablosuna kaydetmek.
-- ==============================================================================

CREATE OR REPLACE FUNCTION apply_stock_count(p_items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
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
BEGIN
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

        INSERT INTO stock_movements (material_id, movement_type, quantity, unit_price, note)
        VALUES (
            v_material_id,
            'sayim',
            abs(v_diff),
            COALESCE(v_material.price_per_unit, 0),
            'Sayım Düzeltmesi (' || v_direction || '): Teorik ' || v_current_stock || ', Gerçek ' || v_counted_qty
        );

        UPDATE materials
        SET stock_quantity = v_counted_qty
        WHERE id = v_material_id;

        v_details := array_append(v_details, v_material.name || ' (' || v_current_stock || ' -> ' || v_counted_qty || ')');
        v_count := v_count + 1;
    END LOOP;

    INSERT INTO settings (key, value)
    VALUES ('last_inventory_count_date', v_now)
    ON CONFLICT (key)
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

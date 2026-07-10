-- ==============================================================================
-- FONKSİYON: record_stock_movement
-- AMACI: Manuel veya hızlı stok giriş/çıkış işlemlerini TEK BİR ATOMİK TRANSACTION
-- içinde kaydetmek; stok hareketi ve materials.stock_quantity alanını birlikte güncellemek.
-- ==============================================================================

CREATE OR REPLACE FUNCTION record_stock_movement(
    p_material_id uuid,
    p_movement_type text,
    p_quantity numeric,
    p_unit_price numeric DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
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

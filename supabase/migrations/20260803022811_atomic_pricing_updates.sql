-- Persist calculated product costs and the tenant pricing target as one transaction.

DROP FUNCTION IF EXISTS public.save_pricing_calculations(uuid, jsonb, numeric, jsonb);

CREATE FUNCTION public.save_pricing_calculations(
    p_organization_id uuid,
    p_updates jsonb,
    p_target_margin numeric,
    p_audit_details jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_requested_count integer;
    v_tenant_product_count integer;
    v_updated_count integer;
    v_duplicate_count integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Ürün maliyetleri bir JSON dizisi olmalıdır.' USING ERRCODE = '22023';
    END IF;

    v_requested_count := jsonb_array_length(p_updates);
    IF v_requested_count < 1 OR v_requested_count > 1000 THEN
        RAISE EXCEPTION 'Tek işlemde 1 ile 1000 arasında ürün güncellenebilir.' USING ERRCODE = '22023';
    END IF;

    IF p_target_margin IS NULL OR p_target_margin < 0 OR p_target_margin > 100 THEN
        RAISE EXCEPTION 'Hedef kâr marjı 0 ile 100 arasında olmalıdır.' USING ERRCODE = '22023';
    END IF;

    BEGIN
        WITH input AS (
            SELECT id, total_cost
            FROM jsonb_to_recordset(p_updates) AS item(id uuid, total_cost numeric)
        )
        SELECT count(*) - count(DISTINCT id)
        INTO v_duplicate_count
        FROM input;
    EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION 'Ürün maliyeti verileri geçersiz.' USING ERRCODE = '22023';
    END;

    IF v_duplicate_count > 0 THEN
        RAISE EXCEPTION 'Aynı ürün birden fazla kez gönderilemez.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_updates) AS item(id uuid, total_cost numeric)
        WHERE id IS NULL OR total_cost IS NULL OR total_cost < 0 OR total_cost > 1000000000
    ) THEN
        RAISE EXCEPTION 'Ürün kimliği veya maliyet değeri geçersiz.' USING ERRCODE = '22023';
    END IF;

    PERFORM product.id
    FROM public.products AS product
    JOIN jsonb_to_recordset(p_updates) AS item(id uuid, total_cost numeric)
      ON item.id = product.id
    WHERE product.organization_id = p_organization_id
    FOR UPDATE OF product;

    SELECT count(*)
    INTO v_tenant_product_count
    FROM public.products AS product
    JOIN jsonb_to_recordset(p_updates) AS item(id uuid, total_cost numeric)
      ON item.id = product.id
    WHERE product.organization_id = p_organization_id;

    IF v_tenant_product_count <> v_requested_count THEN
        RAISE EXCEPTION 'Bir veya daha fazla ürün bu organizasyona ait değil.' USING ERRCODE = '42501';
    END IF;

    WITH input AS (
        SELECT id, total_cost
        FROM jsonb_to_recordset(p_updates) AS item(id uuid, total_cost numeric)
    ), updated AS (
        UPDATE public.products AS product
        SET calculated_cost = input.total_cost,
            updated_at = timezone('utc'::text, now())
        FROM input
        WHERE product.id = input.id
          AND product.organization_id = p_organization_id
        RETURNING product.id
    )
    SELECT count(*) INTO v_updated_count FROM updated;

    IF v_updated_count <> v_requested_count THEN
        RAISE EXCEPTION 'Ürün maliyetlerinin tamamı güncellenemedi.' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.settings (organization_id, key, value, user_id, updated_at)
    VALUES (p_organization_id, 'target_margin', to_jsonb(p_target_margin), v_user_id, timezone('utc'::text, now()))
    ON CONFLICT (organization_id, key)
    DO UPDATE SET
        value = EXCLUDED.value,
        user_id = EXCLUDED.user_id,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO public.activity_logs (
        module,
        action_type,
        description,
        details,
        user_id,
        organization_id
    )
    VALUES (
        'Fiyat Motoru',
        'UPDATE',
        format('%s ürünün hesaplanan maliyeti ve hedef kâr marjı güncellendi.', v_updated_count),
        COALESCE(p_audit_details, '{}'::jsonb) || jsonb_build_object(
            'updated_product_count', v_updated_count,
            'target_margin', p_target_margin
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_pricing_calculations(uuid, jsonb, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_pricing_calculations(uuid, jsonb, numeric, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

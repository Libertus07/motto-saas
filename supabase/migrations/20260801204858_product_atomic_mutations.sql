-- Product writes are intentionally exposed as atomic, tenant-scoped RPCs.
-- Each function runs with the caller's privileges so existing RLS remains active.

CREATE OR REPLACE FUNCTION public.save_product_with_recipe(
    p_organization_id uuid,
    p_product_id uuid,
    p_name text,
    p_category text,
    p_sale_price numeric,
    p_estimated_monthly_sales integer,
    p_ingredients jsonb,
    p_audit_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_product_id uuid := p_product_id;
    v_action_type text;
    v_ingredient jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF length(btrim(COALESCE(p_name, ''))) = 0 OR length(btrim(p_name)) > 255 THEN
        RAISE EXCEPTION 'Ürün adı 1 ile 255 karakter arasında olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF length(btrim(COALESCE(p_category, ''))) = 0 OR length(btrim(p_category)) > 100 THEN
        RAISE EXCEPTION 'Kategori 1 ile 100 karakter arasında olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF p_sale_price IS NULL OR p_sale_price < 0 OR p_sale_price > 99999999.99 THEN
        RAISE EXCEPTION 'Satış fiyatı geçerli aralıkta olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF p_estimated_monthly_sales IS NULL OR p_estimated_monthly_sales < 0 THEN
        RAISE EXCEPTION 'Tahmini aylık satış negatif olamaz.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(jsonb_typeof(p_ingredients), 'null') <> 'array' THEN
        RAISE EXCEPTION 'Reçete bileşenleri bir JSON dizisi olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(jsonb_typeof(p_audit_details), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Audit detayları bir JSON nesnesi olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(p_ingredients) > 250 THEN
        RAISE EXCEPTION 'Bir ürün reçetesi en fazla 250 satır içerebilir.' USING ERRCODE = '22023';
    END IF;

    FOR v_ingredient IN SELECT value FROM jsonb_array_elements(p_ingredients)
    LOOP
        IF COALESCE(v_ingredient->>'type', '') NOT IN ('material', 'sub_recipe')
           OR COALESCE(v_ingredient->>'item_id', '') = ''
           OR COALESCE((v_ingredient->>'quantity')::numeric, 0) <= 0
           OR (v_ingredient->>'quantity')::numeric > 999999.9999 THEN
            RAISE EXCEPTION 'Reçetede geçersiz bir bileşen bulundu.' USING ERRCODE = '22023';
        END IF;

        IF v_ingredient->>'type' = 'material'
           AND NOT EXISTS (
               SELECT 1
               FROM public.materials AS material
               WHERE material.id = (v_ingredient->>'item_id')::uuid
                 AND material.organization_id = p_organization_id
           ) THEN
            RAISE EXCEPTION 'Reçetedeki hammadde bu organizasyonda bulunamadı.' USING ERRCODE = '23503';
        END IF;

        IF v_ingredient->>'type' = 'sub_recipe'
           AND NOT EXISTS (
               SELECT 1
               FROM public.sub_recipes AS recipe
               WHERE recipe.id = (v_ingredient->>'item_id')::uuid
                 AND recipe.organization_id = p_organization_id
           ) THEN
            RAISE EXCEPTION 'Reçetedeki alt reçete bu organizasyonda bulunamadı.' USING ERRCODE = '23503';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_ingredients) AS ingredient
        GROUP BY ingredient->>'type', ingredient->>'item_id'
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Aynı reçete bileşeni birden fazla kez eklenemez.' USING ERRCODE = '22023';
    END IF;

    IF v_product_id IS NULL THEN
        INSERT INTO public.products (
            name,
            category,
            sale_price,
            estimated_monthly_sales,
            user_id,
            organization_id
        )
        VALUES (
            btrim(p_name),
            btrim(p_category),
            p_sale_price,
            p_estimated_monthly_sales,
            v_user_id,
            p_organization_id
        )
        RETURNING id INTO v_product_id;

        v_action_type := 'EKLEME';
    ELSE
        PERFORM 1
        FROM public.products
        WHERE id = v_product_id
          AND organization_id = p_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Güncellenecek ürün bulunamadı.' USING ERRCODE = 'P0002';
        END IF;

        UPDATE public.products
        SET name = btrim(p_name),
            category = btrim(p_category),
            sale_price = p_sale_price,
            estimated_monthly_sales = p_estimated_monthly_sales,
            updated_at = timezone('utc', now())
        WHERE id = v_product_id
          AND organization_id = p_organization_id;

        DELETE FROM public.product_ingredients
        WHERE product_id = v_product_id
          AND organization_id = p_organization_id;

        v_action_type := 'GUNCELLEME';
    END IF;

    INSERT INTO public.product_ingredients (
        product_id,
        material_id,
        sub_recipe_id,
        quantity,
        organization_id
    )
    SELECT
        v_product_id,
        CASE WHEN ingredient->>'type' = 'material' THEN (ingredient->>'item_id')::uuid END,
        CASE WHEN ingredient->>'type' = 'sub_recipe' THEN (ingredient->>'item_id')::uuid END,
        (ingredient->>'quantity')::numeric,
        p_organization_id
    FROM jsonb_array_elements(p_ingredients) AS ingredient;

    INSERT INTO public.activity_logs (
        module,
        action_type,
        description,
        details,
        user_id,
        organization_id
    )
    VALUES (
        'Ürünler',
        v_action_type,
        format('%s isimli ürün %s.', btrim(p_name), CASE WHEN v_action_type = 'EKLEME' THEN 'sisteme eklendi' ELSE 'güncellendi' END),
        p_audit_details || jsonb_build_object('productId', v_product_id),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_products(
    p_organization_id uuid,
    p_updates jsonb,
    p_description text,
    p_audit_details jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_expected_count integer;
    v_updated_count integer;
    v_update record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF COALESCE(jsonb_typeof(p_updates), 'null') <> 'array'
       OR jsonb_array_length(p_updates) = 0
       OR jsonb_array_length(p_updates) > 1000 THEN
        RAISE EXCEPTION 'Toplu güncelleme 1 ile 1000 ürün içermelidir.' USING ERRCODE = '22023';
    END IF;

    IF COALESCE(jsonb_typeof(p_audit_details), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Audit detayları bir JSON nesnesi olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF length(btrim(COALESCE(p_description, ''))) = 0 THEN
        RAISE EXCEPTION 'Audit açıklaması zorunludur.' USING ERRCODE = '22023';
    END IF;

    FOR v_update IN
        SELECT *
        FROM jsonb_to_recordset(p_updates) AS item(
            id uuid,
            sale_price numeric,
            estimated_monthly_sales integer,
            category text
        )
    LOOP
        IF v_update.id IS NULL
           OR v_update.sale_price IS NULL
           OR v_update.sale_price < 0
           OR v_update.sale_price > 99999999.99
           OR v_update.estimated_monthly_sales IS NULL
           OR v_update.estimated_monthly_sales < 0
           OR length(btrim(COALESCE(v_update.category, ''))) = 0
           OR length(btrim(v_update.category)) > 100 THEN
            RAISE EXCEPTION 'Toplu güncellemede geçersiz bir ürün satırı bulundu.' USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_updates) AS item(id uuid)
        GROUP BY item.id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Aynı ürün toplu güncellemede birden fazla kez bulunamaz.' USING ERRCODE = '22023';
    END IF;

    v_expected_count := jsonb_array_length(p_updates);

    PERFORM 1
    FROM public.products AS product
    JOIN jsonb_to_recordset(p_updates) AS item(id uuid) ON item.id = product.id
    WHERE product.organization_id = p_organization_id
    FOR UPDATE OF product;

    IF (
        SELECT count(*)
        FROM public.products AS product
        JOIN jsonb_to_recordset(p_updates) AS item(id uuid) ON item.id = product.id
        WHERE product.organization_id = p_organization_id
    ) <> v_expected_count THEN
        RAISE EXCEPTION 'Güncellenecek ürünlerden biri bulunamadı veya başka organizasyona ait.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.products AS product
    SET sale_price = item.sale_price,
        estimated_monthly_sales = item.estimated_monthly_sales,
        category = btrim(item.category),
        updated_at = timezone('utc', now())
    FROM jsonb_to_recordset(p_updates) AS item(
        id uuid,
        sale_price numeric,
        estimated_monthly_sales integer,
        category text
    )
    WHERE product.id = item.id
      AND product.organization_id = p_organization_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count <> v_expected_count THEN
        RAISE EXCEPTION 'Toplu ürün güncellemesi eksik tamamlandı.';
    END IF;

    INSERT INTO public.activity_logs (
        module,
        action_type,
        description,
        details,
        user_id,
        organization_id
    )
    VALUES (
        'Ürünler',
        'GUNCELLEME',
        btrim(p_description),
        p_audit_details || jsonb_build_object('productCount', v_updated_count),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_product(
    p_organization_id uuid,
    p_product_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_product_name text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    SELECT name
    INTO v_product_name
    FROM public.products
    WHERE id = p_product_id
      AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Silinecek ürün bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.products
    WHERE id = p_product_id
      AND organization_id = p_organization_id;

    INSERT INTO public.activity_logs (
        module,
        action_type,
        description,
        details,
        user_id,
        organization_id
    )
    VALUES (
        'Ürünler',
        'SILME',
        format('%s sistemden silindi.', v_product_name),
        jsonb_build_object('productId', p_product_id),
        v_user_id::text,
        p_organization_id
    );

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_with_recipe(uuid, uuid, text, text, numeric, integer, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_products(uuid, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_product(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_product_with_recipe(uuid, uuid, text, text, numeric, integer, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_products(uuid, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product(uuid, uuid) TO authenticated;

-- Material writes are atomic, tenant-scoped and audited in the same transaction.

CREATE OR REPLACE FUNCTION public.save_material(
    p_organization_id uuid,
    p_material_id uuid,
    p_name text,
    p_category text,
    p_unit text,
    p_price_per_unit numeric,
    p_stock_quantity numeric,
    p_critical_stock_level numeric,
    p_audit_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_material_id uuid := p_material_id;
    v_old_price numeric := 0;
    v_action_type text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;
    IF p_organization_id IS NULL OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 255
       OR length(btrim(COALESCE(p_category, ''))) NOT BETWEEN 1 AND 100
       OR length(btrim(COALESCE(p_unit, ''))) NOT BETWEEN 1 AND 50
       OR p_price_per_unit IS NULL OR p_price_per_unit < 0 OR p_price_per_unit > 99999999.99
       OR p_stock_quantity IS NULL OR p_stock_quantity < 0
       OR p_critical_stock_level IS NULL OR p_critical_stock_level < 0 THEN
        RAISE EXCEPTION 'Hammadde bilgileri geçerli aralıkta olmalıdır.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(jsonb_typeof(p_audit_details), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Audit detayları bir JSON nesnesi olmalıdır.' USING ERRCODE = '22023';
    END IF;

    IF v_material_id IS NULL THEN
        INSERT INTO public.materials (
            name, category, unit, price_per_unit, stock_quantity,
            critical_stock_level, user_id, organization_id
        ) VALUES (
            btrim(p_name), btrim(p_category), btrim(p_unit), p_price_per_unit,
            p_stock_quantity, p_critical_stock_level, v_user_id, p_organization_id
        ) RETURNING id INTO v_material_id;
        v_action_type := 'EKLEME';
    ELSE
        SELECT price_per_unit INTO v_old_price
        FROM public.materials
        WHERE id = v_material_id AND organization_id = p_organization_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Güncellenecek hammadde bulunamadı.' USING ERRCODE = 'P0002';
        END IF;

        UPDATE public.materials
        SET name = btrim(p_name), category = btrim(p_category), unit = btrim(p_unit),
            price_per_unit = p_price_per_unit, stock_quantity = p_stock_quantity,
            critical_stock_level = p_critical_stock_level, updated_at = timezone('utc', now())
        WHERE id = v_material_id AND organization_id = p_organization_id;
        v_action_type := 'GUNCELLEME';
    END IF;

    IF v_action_type = 'EKLEME' OR v_old_price IS DISTINCT FROM p_price_per_unit THEN
        INSERT INTO public.material_price_history (
            material_id, old_price, new_price, source, organization_id
        ) VALUES (
            v_material_id, CASE WHEN v_action_type = 'EKLEME' THEN 0 ELSE v_old_price END,
            p_price_per_unit, 'manual', p_organization_id
        );
    END IF;

    INSERT INTO public.activity_logs (
        module, action_type, description, details, user_id, organization_id
    ) VALUES (
        'Hammadde', v_action_type,
        format('%s isimli hammadde %s.', btrim(p_name), CASE WHEN v_action_type = 'EKLEME' THEN 'sisteme eklendi' ELSE 'güncellendi' END),
        p_audit_details || jsonb_build_object('materialId', v_material_id), v_user_id::text, p_organization_id
    );

    RETURN v_material_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_materials(
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
    v_expected integer;
    v_updated integer;
BEGIN
    IF v_user_id IS NULL OR p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(jsonb_typeof(p_updates), 'null') <> 'array'
       OR jsonb_array_length(p_updates) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'Toplu güncelleme 1 ile 1000 satır içermelidir.' USING ERRCODE = '22023';
    END IF;
    IF length(btrim(COALESCE(p_description, ''))) = 0
       OR COALESCE(jsonb_typeof(p_audit_details), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Geçerli audit bilgisi gereklidir.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_updates) AS item(
            id uuid, name text, unit text, category text, price_per_unit numeric,
            stock_quantity numeric, critical_stock_level numeric
        )
        WHERE id IS NULL OR length(btrim(COALESCE(name, ''))) NOT BETWEEN 1 AND 255
           OR length(btrim(COALESCE(unit, ''))) NOT BETWEEN 1 AND 50
           OR length(btrim(COALESCE(category, ''))) NOT BETWEEN 1 AND 100
           OR price_per_unit < 0 OR stock_quantity < 0 OR critical_stock_level < 0
    ) OR EXISTS (
        SELECT 1 FROM jsonb_to_recordset(p_updates) AS item(id uuid)
        GROUP BY id HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Toplu güncellemede geçersiz veya yinelenen satır bulundu.' USING ERRCODE = '22023';
    END IF;

    v_expected := jsonb_array_length(p_updates);
    PERFORM 1 FROM public.materials AS material
    JOIN jsonb_to_recordset(p_updates) AS update_row(id uuid) ON update_row.id = material.id
    WHERE material.organization_id = p_organization_id FOR UPDATE OF material;
    IF (
        SELECT count(*)
        FROM public.materials AS material
        JOIN jsonb_to_recordset(p_updates) AS update_row(id uuid) ON update_row.id = material.id
        WHERE material.organization_id = p_organization_id
    ) <> v_expected THEN
        RAISE EXCEPTION 'Bazı hammaddeler bu organizasyonda bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.material_price_history (material_id, old_price, new_price, source, organization_id)
    SELECT material.id, material.price_per_unit, update_row.price_per_unit, 'manual', p_organization_id
    FROM public.materials AS material
    JOIN jsonb_to_recordset(p_updates) AS update_row(id uuid, price_per_unit numeric)
      ON update_row.id = material.id
    WHERE material.organization_id = p_organization_id AND material.price_per_unit IS DISTINCT FROM update_row.price_per_unit;

    UPDATE public.materials AS material
    SET name = btrim(update_row.name), unit = btrim(update_row.unit), category = btrim(update_row.category),
        price_per_unit = update_row.price_per_unit, stock_quantity = update_row.stock_quantity,
        critical_stock_level = update_row.critical_stock_level, updated_at = timezone('utc', now())
    FROM jsonb_to_recordset(p_updates) AS update_row(
        id uuid, name text, unit text, category text, price_per_unit numeric,
        stock_quantity numeric, critical_stock_level numeric
    )
    WHERE material.id = update_row.id AND material.organization_id = p_organization_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES ('Hammadde', 'GUNCELLEME', btrim(p_description), p_audit_details, v_user_id::text, p_organization_id);
    RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_materials(
    p_organization_id uuid,
    p_material_ids uuid[],
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
    v_expected integer;
    v_deleted integer;
BEGIN
    IF v_user_id IS NULL OR p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;
    v_expected := COALESCE(cardinality(p_material_ids), 0);
    IF v_expected NOT BETWEEN 1 AND 1000 OR length(btrim(COALESCE(p_description, ''))) = 0
       OR COALESCE(jsonb_typeof(p_audit_details), 'null') <> 'object' THEN
        RAISE EXCEPTION 'Geçerli silme ve audit bilgisi gereklidir.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT id) FROM unnest(p_material_ids) AS id) <> v_expected THEN
        RAISE EXCEPTION 'Silme listesinde yinelenen kimlik bulundu.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.materials
    WHERE organization_id = p_organization_id AND id = ANY(p_material_ids) FOR UPDATE;
    IF (SELECT count(*) FROM public.materials WHERE organization_id = p_organization_id AND id = ANY(p_material_ids)) <> v_expected THEN
        RAISE EXCEPTION 'Bazı hammaddeler bu organizasyonda bulunamadı.' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.materials
    WHERE organization_id = p_organization_id AND id = ANY(p_material_ids);
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    INSERT INTO public.activity_logs (module, action_type, description, details, user_id, organization_id)
    VALUES ('Hammadde', 'SILME', btrim(p_description), p_audit_details, v_user_id::text, p_organization_id);
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.save_material(uuid, uuid, text, text, text, numeric, numeric, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_materials(uuid, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_materials(uuid, uuid[], text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_material(uuid, uuid, text, text, text, numeric, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_materials(uuid, jsonb, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_materials(uuid, uuid[], text, jsonb) TO authenticated;

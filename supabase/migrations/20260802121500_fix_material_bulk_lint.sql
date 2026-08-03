-- Replace the temporary-table implementation so plpgsql_check can validate
-- every relation and column statically while preserving atomic behavior.
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
    WHERE material.organization_id = p_organization_id
      AND material.price_per_unit IS DISTINCT FROM update_row.price_per_unit;

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

-- Keep one canonical, validated tenant-aware relationship between stock movements
-- and materials. Multiple foreign keys between the same tables make PostgREST
-- resource embedding ambiguous (PGRST201).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.stock_movements'::regclass
          AND confrelid = 'public.materials'::regclass
          AND conname = 'stock_movements_material_tenant_fk'
          AND contype = 'f'
          AND convalidated
          AND pg_get_constraintdef(oid) LIKE
              'FOREIGN KEY (organization_id, material_id) REFERENCES materials(organization_id, id)%'
    ) THEN
        RAISE EXCEPTION
            'Canonical tenant relationship stock_movements_material_tenant_fk is missing or invalid';
    END IF;
END
$$;

ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS sec_102_sm_material_tenant_fk;

ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_material_id_fkey;

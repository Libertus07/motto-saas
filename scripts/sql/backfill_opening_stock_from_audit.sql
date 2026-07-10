-- Amaç:
-- audit_stock_integrity çıktısında current_stock > 0, estimated_stock = 0 görünen
-- ve hareket geçmişi eksik olan malzemeler için tek seferlik açılış stok hareketi eklemek.
--
-- Bu script materials.stock_quantity alanını DEĞİŞTİRMEZ.
-- Sadece stock_movements tablosuna 'giris' kaydı ekler.
--
-- Güvenlik:
-- - Sadece aşağıdaki audit çıktısında görülen material_id listesi hedeflenir.
-- - Aynı not ile ikinci kez kayıt eklenmemesi için NOT EXISTS kontrolü vardır.
-- - SQL Editor'da auth.uid() boş olacağı için mevcut veriden fallback user_id seçer.
--
-- Sonraki adım:
-- Script çalıştıktan sonra audit_stock_integrity.sql tekrar çalıştırılmalıdır.

DO $$
DECLARE
    v_user_id uuid;
BEGIN
    SELECT user_id INTO v_user_id
    FROM stock_movements
    WHERE user_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        SELECT user_id INTO v_user_id
        FROM supplier_transactions
        WHERE user_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Backfill için kullanılacak user_id bulunamadı. Önce user_id dolu bir hareket/kayıt gerekli.';
    END IF;

    WITH target_materials(id) AS (
        VALUES
            ('8d8b8dc0-2541-4428-abb3-0597f8a9c482'::uuid),
            ('07c1061b-baf6-48b9-9a5b-9090b3f2ce78'::uuid),
            ('993af7b1-6519-4312-97ed-e1b91a0c6dc9'::uuid),
            ('bfb0fed4-de88-4d7b-84ad-2b3ac5886ee5'::uuid),
            ('b1ce9342-9e38-4982-a0bc-3214a988d1f4'::uuid),
            ('fa6b5037-96b8-4a00-b0c8-35285ad39513'::uuid),
            ('b71d3303-6ee9-4707-98fa-5813c4b10202'::uuid),
            ('91906c17-dfb2-49ca-8a50-e8512a15f50e'::uuid),
            ('38d0736f-19e8-4fec-b80e-8dba9c86e150'::uuid),
            ('8d6e7404-c378-406c-bfaa-a930d603c5f0'::uuid),
            ('be8291eb-a3d7-41e8-849c-f92e0983fcb4'::uuid),
            ('e686f4c8-029c-4e8a-8ded-ccf4f6b9e2dd'::uuid),
            ('2f92873a-f97f-4893-8f9c-7ffb5c53c8bb'::uuid),
            ('8c9c3684-2702-43a7-a77e-d9e7839de0b7'::uuid)
    )
    INSERT INTO stock_movements (
        material_id,
        movement_type,
        quantity,
        unit_price,
        note,
        user_id
    )
    SELECT
        m.id,
        'giris',
        COALESCE(m.stock_quantity, 0),
        COALESCE(m.price_per_unit, 0),
        'Açılış Stoku (Legacy Backfill - 2026-07 audit)',
        v_user_id
    FROM materials m
    JOIN target_materials t ON t.id = m.id
    WHERE COALESCE(m.stock_quantity, 0) > 0
      AND NOT EXISTS (
          SELECT 1
          FROM stock_movements sm
          WHERE sm.material_id = m.id
            AND sm.note = 'Açılış Stoku (Legacy Backfill - 2026-07 audit)'
      );
END $$;

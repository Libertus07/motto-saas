-- ==============================================================================
-- SEC-102: HATA DÜZELTME (HOTFIX) SCRIPTİ
-- ==============================================================================
-- Bu script, eski tenant mimarisinden kalan ve çakışmaya (P0001) neden olan 
-- "eski" trigger'ları temizler ve ana kullanıcınızı doğru organizasyona bağlar.

-- 1. ADIM: "No active organization" hatasına sebep olan ESKİ trigger'ları temizle
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN 
        SELECT 
            t.tgname AS trigger_name,
            c.relname AS table_name,
            p.proname AS function_name
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_proc p ON t.tgfoid = p.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          -- Kendi oluşturduğumuz (yeni) trigger dışındakileri bul
          AND t.tgname != 'set_org_trigger'
          -- Eski sistemde organization_id kontrolü yapan fonksiyonları hedefle
          AND (p.prosrc ILIKE '%profiles.active_organization_id%' OR p.prosrc ILIKE '%No active organization is available%')
    LOOP
        -- Eski trigger'ı uçur
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.trigger_name, trigger_record.table_name);
        
        RAISE NOTICE 'Silinen Eski Trigger: % tablosundaki % (Fonksiyon: %)', trigger_record.table_name, trigger_record.trigger_name, trigger_record.function_name;
    END LOOP;
END $$;

-- 2. ADIM: Giderlerin (expenses) görünmeme sorununu çözme
-- Mevcut tüm giderleriniz '4f66ef18-ed31-4942-97bd-4c52e570f810' organizasyonuna ait.
-- Ancak sizin hesabınız (emrullahgoksal) yanlışlıkla Default (0000...) organizasyonuna atanmış durumda.
-- Sizi asıl verilerin bulunduğu organizasyona yetkili olarak ekliyoruz:

INSERT INTO public.organization_members (organization_id, user_id, role, status)
SELECT 
    '4f66ef18-ed31-4942-97bd-4c52e570f810', 
    id, 
    'owner', 
    'active'
FROM auth.users
WHERE email = 'emrullahgoksal@gmail.com'
ON CONFLICT (organization_id, user_id) DO NOTHING;

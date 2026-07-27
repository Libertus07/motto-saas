-- ==============================================================================
-- SEC-102 (AŞAMA 5): OTOMATİK TENANT ENJEKSİYONU (DATABASE TRIGGERS)
-- ==============================================================================

-- 1. TRİGGER FONKSİYONU
CREATE OR REPLACE FUNCTION public.set_default_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    default_org UUID;
BEGIN
    -- Eğer INSERT işleminde organization_id gönderilmemişse (NULL ise):
    IF NEW.organization_id IS NULL THEN
        -- Kullanıcının bağlı olduğu aktif organizasyonu bul
        SELECT organization_id INTO default_org 
        FROM public.organization_members 
        WHERE user_id = auth.uid() 
          AND status = 'active'
        LIMIT 1;

        -- Bulunduysa otomatik ata, bulunamadıysa legacy organizasyonu ata
        IF default_org IS NOT NULL THEN
            NEW.organization_id := default_org;
        ELSE
            NEW.organization_id := '00000000-0000-0000-0000-000000000001'::uuid;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. TRİGGER'LARI TÜM İŞ TABLOLARINA BAĞLAMA (DİNAMİK)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('organizations', 'organization_members', 'profiles')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_org_trigger ON public.%I', t);
        
        EXECUTE format('
            CREATE TRIGGER set_org_trigger
            BEFORE INSERT ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.set_default_organization();
        ', t);
    END LOOP;
END $$;

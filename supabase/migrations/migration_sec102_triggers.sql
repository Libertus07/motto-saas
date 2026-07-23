-- ==============================================================================
-- SEC-102: AŞAMA 5 - OTOMATİK TENANT ENJEKSİYONU (DATABASE TRIGGERS)
-- ==============================================================================
-- Lütfen bu kodu Supabase SQL Editor üzerinde çalıştırın.

-- 1. TRİGGER FONKSİYONU YARATMA
-- Bu fonksiyon, herhangi bir tabloya veri eklenirken (INSERT), eğer uygulamanın (Next.js)
-- haberi yoksa ve organization_id boş gönderilmişse, otomatik olarak kullanıcının
-- üye olduğu ilk organizasyonun ID'sini araya girip ekler.
-- Böylece Frontend'de 12.000 satır kodu değiştirmemize GEREK KALMAZ!
CREATE OR REPLACE FUNCTION public.set_default_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    default_org UUID;
BEGIN
    -- Eğer insert işleminde organization_id gönderilmemişse (NULL ise):
    IF NEW.organization_id IS NULL THEN
        -- Kullanıcının bağlı olduğu organizasyonu bul
        SELECT organization_id INTO default_org 
        FROM public.organization_members 
        WHERE user_id = (SELECT auth.uid()) 
        LIMIT 1;

        -- Bulunduysa otomatik ata
        IF default_org IS NOT NULL THEN
            NEW.organization_id := default_org;
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
        -- Varsa eski trigger'ı temizle
        EXECUTE format('DROP TRIGGER IF EXISTS set_org_trigger ON public.%I', t);
        
        -- Yeni trigger'ı oluştur
        EXECUTE format('
            CREATE TRIGGER set_org_trigger
            BEFORE INSERT ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.set_default_organization();
        ', t);
    END LOOP;
END $$;

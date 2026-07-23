-- ==============================================================================
-- SEC-102: HOTFIX v2 - RLS ve ÇOKLU ORGANİZASYON DÜZELTMESİ
-- ==============================================================================

-- 1. ÖNCE ESKİ POLİTİKALARI SİLMELİYİZ (ÇÜNKÜ FONKSİYONA BAĞLILAR)
DO $$
DECLARE
    t text;
BEGIN
    -- İş tablolarındaki politikaları sil
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('organizations', 'organization_members', 'profiles')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.%I', t);
    END LOOP;
END $$;

-- Temel tablolardaki politikaları sil
DROP POLICY IF EXISTS "View own organizations" ON public.organizations;
DROP POLICY IF EXISTS "View own organization members" ON public.organization_members;

-- 2. ŞİMDİ FONKSİYONU SİLİP YENİDEN YARATABİLİRİZ
DROP FUNCTION IF EXISTS private.get_user_organizations() CASCADE;

CREATE OR REPLACE FUNCTION private.get_user_organizations()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(array_agg(organization_id), '{}'::uuid[]) 
    FROM public.organization_members 
    WHERE user_id = (SELECT auth.uid());
$$;

-- 3. TRİGGER FONKSİYONUNU GÜNCELLEME (İlk / Asıl Organizasyonu Seçme)
CREATE OR REPLACE FUNCTION public.set_default_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    default_org UUID;
BEGIN
    IF NEW.organization_id IS NULL THEN
        -- Kullanıcının İLK (en eski) üye olduğu asıl organizasyonu seç
        SELECT organization_id INTO default_org 
        FROM public.organization_members 
        WHERE user_id = (SELECT auth.uid()) 
        ORDER BY created_at ASC
        LIMIT 1;

        IF default_org IS NOT NULL THEN
            NEW.organization_id := default_org;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 4. RLS POLİTİKALARINI YENİ "ARRAY" MANTIĞINA GÖRE YENİDEN KURMA
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
        EXECUTE format('
            CREATE POLICY "Tenant Isolation Policy" ON public.%I 
            FOR ALL 
            USING (organization_id = ANY(private.get_user_organizations()))
            WITH CHECK (organization_id = ANY(private.get_user_organizations()));
        ', t);
    END LOOP;
END $$;

-- Temel tenant tabloları için politikaları yeniden kur
CREATE POLICY "View own organizations" ON public.organizations
FOR SELECT USING (id = ANY(private.get_user_organizations()));

CREATE POLICY "View own organization members" ON public.organization_members
FOR SELECT USING (organization_id = ANY(private.get_user_organizations()));

-- 5. KULLANICI DÜZELTMELERİ
INSERT INTO public.organization_members (organization_id, user_id, role, status)
SELECT 
    '4f66ef18-ed31-4942-97bd-4c52e570f810', 
    id, 
    'owner', 
    'active'
FROM auth.users
WHERE email = 'emrullahgoksal@gmail.com'
ON CONFLICT (organization_id, user_id) DO NOTHING;

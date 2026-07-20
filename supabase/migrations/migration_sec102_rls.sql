-- ==============================================================================
-- SEC-102: AŞAMA 3 & 4 - TENANT İZOLASYONU VE YENİ RLS POLİTİKALARI
-- ==============================================================================
-- Lütfen bu kodu Supabase SQL Editor üzerinde çalıştırın.

-- 1. YARDIMCI FONKSİYON: Kullanıcının üye olduğu organizasyonları döndürür.
-- (Bunu SECURITY DEFINER yapıyoruz ki, organization_members tablosuna gizli erişim yapabilsin)
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- 2. ESKİ VE GÜVENSİZ POLİTİKALARI SİLME (DİNAMİK)
-- PDF raporunda bahsedilen "sadece auth.role() = 'authenticated' kontrolü yapan"
-- tüm eski güvensiz RLS politikalarını sistemden temizliyoruz.
DO $$ 
DECLARE
    r record;
BEGIN
    FOR r IN 
        SELECT schemaname, tablename, policyname
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- 3. TÜM TABLOLARDA RLS'İ ZORUNLU HALE GETİRME
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    END LOOP;
END $$;

-- 4. YENİ TENANT (ORGANIZATION) İZOLASYON POLİTİKALARINI YAZMA
-- Sistemdeki tüm iş tablolarına (organization_id içerenlere) 
-- otomatik olarak Tenant izolasyonu ekliyoruz.
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
            USING (organization_id IN (SELECT public.get_user_organizations()))
            WITH CHECK (organization_id IN (SELECT public.get_user_organizations()));
        ', t);
    END LOOP;
END $$;

-- 5. TEMEL TENANT TABLOLARI İÇİN POLİTİKALAR
-- Kullanıcı sadece kendi organizasyonunu görebilir
CREATE POLICY "View own organizations" ON public.organizations
FOR SELECT USING (id IN (SELECT public.get_user_organizations()));

-- Kullanıcı sadece kendi organizasyonundaki üyeleri görebilir
CREATE POLICY "View own organization members" ON public.organization_members
FOR SELECT USING (organization_id IN (SELECT public.get_user_organizations()));

-- Kullanıcılar kendi profillerini güncelleyebilir
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
FOR SELECT USING (auth.role() = 'authenticated');

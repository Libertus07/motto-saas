-- ==============================================================================
-- SEC-102 (AŞAMA 5): TENANT-AWARE RLS POLİTİKALARI VE ROL MATRİSİ
-- ==============================================================================

-- 1. YARDIMCI FONKSİYONLAR
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
      AND status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role 
    FROM public.organization_members 
    WHERE organization_id = target_org_id 
      AND user_id = auth.uid() 
      AND status = 'active'
    LIMIT 1;
$$;

-- 2. ESKİ VE GÜVENSİZ POLİTİKALARI SİLME (DİNAMİK)
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

-- 4. TENANT (ORGANIZATION) İZOLASYON POLİTİKALARI
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
            CREATE POLICY "Tenant Isolation Select Policy" ON public.%I 
            FOR SELECT 
            USING (organization_id IN (SELECT public.get_user_organizations()));

            CREATE POLICY "Tenant Isolation Insert Policy" ON public.%I 
            FOR INSERT 
            WITH CHECK (organization_id IN (SELECT public.get_user_organizations()));

            CREATE POLICY "Tenant Isolation Update Policy" ON public.%I 
            FOR UPDATE 
            USING (organization_id IN (SELECT public.get_user_organizations()))
            WITH CHECK (organization_id IN (SELECT public.get_user_organizations()));

            CREATE POLICY "Tenant Isolation Delete Policy" ON public.%I 
            FOR DELETE 
            USING (organization_id IN (SELECT public.get_user_organizations()));
        ', t, t, t, t);
    END LOOP;
END $$;

-- 5. KÖK TENANT TABLOLARI POLİTİKALARI
CREATE POLICY "View own organizations" ON public.organizations
    FOR SELECT USING (id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Owners and admins can update organization" ON public.organizations
    FOR UPDATE USING (id IN (SELECT public.get_user_organizations()) AND public.get_user_org_role(id) IN ('owner', 'admin'));

CREATE POLICY "View own organization members" ON public.organization_members
    FOR SELECT USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Owners and admins can manage organization members" ON public.organization_members
    FOR ALL USING (organization_id IN (SELECT public.get_user_organizations()) AND public.get_user_org_role(organization_id) IN ('owner', 'admin'));

-- 6. PROFILES POLİTİKALARI
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Profiles are viewable by authenticated users" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

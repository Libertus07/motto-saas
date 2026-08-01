-- ==============================================================================
-- SEC-102 (AŞAMA 1 & 2): TENANT MİMARİSİ VE TABLO ŞEMALARI (MIGRATION)
-- ==============================================================================

-- 1. ORGANIZATIONS TABLOSU
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    tax_no TEXT,
    address TEXT,
    phone TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ORGANIZATION_MEMBERS TABLOSU
CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'accountant')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

-- 3. PROFILES TABLOSU
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. LEGACY ORGANİZASYON SEEDING & BACKFILL
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Motto Default (Legacy)', 'motto-default-legacy')
-- Bazı eski kurulumlarda aynı slug farklı bir UUID ile zaten bulunabilir.
ON CONFLICT DO NOTHING;

-- Mevcut tüm Auth kullanıcılarını varsayılan legacy organizasyonun sahibi yap
INSERT INTO public.organization_members (organization_id, user_id, role, status)
SELECT organization.id, auth_user.id, 'owner', 'active'
FROM auth.users AS auth_user
CROSS JOIN public.organizations AS organization
WHERE organization.slug = 'motto-default-legacy'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Mevcut kullanıcılar için varsayılan profil oluştur.
-- Eski kurulumlarda `display_name`, güncel şemada ise `full_name` bulunabilir.
-- Başlangıç migration'ı her iki şema sürümüyle de çalışmalıdır.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'display_name'
    ) THEN
        INSERT INTO public.profiles (id, display_name)
        SELECT id, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
        FROM auth.users
        ON CONFLICT (id) DO NOTHING;
    ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'full_name'
    ) THEN
        INSERT INTO public.profiles (id, full_name)
        SELECT id, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
        FROM auth.users
        ON CONFLICT (id) DO NOTHING;
    ELSE
        INSERT INTO public.profiles (id)
        SELECT id
        FROM auth.users
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 5. TÜM İŞ TABLOLARINA ORGANIZATION_ID EKLENMESİ VE BACKFILL (DİNAMİK)
DO $$
DECLARE
    t_name text;
    legacy_organization_id uuid;
BEGIN
    SELECT id
    INTO legacy_organization_id
    FROM public.organizations
    WHERE slug = 'motto-default-legacy';

    IF legacy_organization_id IS NULL THEN
        RAISE EXCEPTION 'Legacy organization was not created';
    END IF;

    FOR t_name IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('organizations', 'organization_members', 'profiles')
    LOOP
        -- organization_id kolonu ekle (Eğer yoksa)
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;', t_name);
        
        -- Mevcut verileri Legacy Organizasyona bağla (Backfill)
        EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL;', t_name, legacy_organization_id);
        
        -- Kolonu zorunlu (NOT NULL) yap
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL;', t_name);
    END LOOP;
END $$;

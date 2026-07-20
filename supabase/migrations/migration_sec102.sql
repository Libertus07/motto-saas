-- ==============================================================================
-- SEC-102: TENANT (MÜŞTERİ) MİMARİSİ VE RLS GÜNCELLEMESİ (MIGRATION)
-- ==============================================================================
-- Lütfen bu kodu Supabase SQL Editor üzerinde çalıştırın.

-- 1. AŞAMA: TEMEL TENANT TABLOLARI
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. AŞAMA: VERİLERİ KURTARMA (SEEDING)
-- Mevcut verilerin bozulmaması için varsayılan bir Organizasyon oluşturuyoruz.
-- Tabloda 'slug' kolonu zorunlu olduğu için ekliyoruz.
INSERT INTO public.organizations (id, name, slug) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Motto Default (Legacy)', 'motto-default-legacy') 
ON CONFLICT (id) DO NOTHING;

-- Sistemdeki tüm mevcut kullanıcıları bu organizasyonun sahibi yapıyoruz.
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000000', id, 'owner'
FROM auth.users
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Mevcut kullanıcılar için profil oluşturuyoruz
INSERT INTO public.profiles (id, full_name)
SELECT id, raw_user_meta_data->>'full_name'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 3. AŞAMA: TÜM İŞ TABLOLARINA ORGANIZATION_ID EKLENMESİ (DİNAMİK)
-- Bu blok public şemasındaki tüm tablolara (tenant tabloları hariç) organization_id ekler,
-- mevcut verileri Motto Default'a atar ve kolonu NOT NULL yapar.
DO $$
DECLARE
    row record;
BEGIN
    FOR row IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
          AND table_name NOT IN ('organizations', 'organization_members', 'profiles')
    LOOP
        -- Kolon ekle (Eğer yoksa)
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;', row.table_name);
        
        -- Mevcut verileri Default Organizasyona geçir (Backfill)
        EXECUTE format('UPDATE public.%I SET organization_id = %L WHERE organization_id IS NULL;', row.table_name, '00000000-0000-0000-0000-000000000000');
        
        -- Kolonu zorunlu hale getir (Yeni veri eklenirken organization_id mecburi olacak)
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL;', row.table_name);
    END LOOP;
END $$;

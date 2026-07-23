-- ==============================================================================
-- PROFİL TABLOSUNA TELEFON SÜTUNU EKLEME
-- ==============================================================================

-- 1. Profiles tablosuna phone sütununu ekle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- 2. KULLANICI BİLGİLERİNİ GÜVENLİ GETİRME (RPC) GÜNCELLEMESİ
-- Phone bilgisini de çekecek şekilde güncelliyoruz.
DROP FUNCTION IF EXISTS public.get_users_info(UUID[]);

CREATE OR REPLACE FUNCTION public.get_users_info(user_ids UUID[])
RETURNS TABLE(id UUID, email VARCHAR, full_name TEXT, phone VARCHAR)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        u.id, 
        u.email::varchar, 
        p.full_name,
        p.phone
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.id = ANY(user_ids);
$$;

-- Herkesin bu fonksiyonu çağırabilmesi için yetki veriyoruz
GRANT EXECUTE ON FUNCTION public.get_users_info(UUID[]) TO authenticated;

-- ==============================================================================
-- KULLANICI BİLGİLERİNİ GÜVENLİ GETİRME (RPC)
-- ==============================================================================
-- Frontend'in auth.users tablosundan e-posta adreslerini okuyabilmesi için
-- güvenli bir köprü (SECURITY DEFINER) oluşturuyoruz.

CREATE OR REPLACE FUNCTION public.get_users_info(user_ids UUID[])
RETURNS TABLE(id UUID, email VARCHAR, full_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        u.id, 
        u.email::varchar, 
        p.full_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id
    WHERE u.id = ANY(user_ids);
$$;

-- Herkesin bu fonksiyonu çağırabilmesi için yetki veriyoruz
GRANT EXECUTE ON FUNCTION public.get_users_info(UUID[]) TO authenticated;

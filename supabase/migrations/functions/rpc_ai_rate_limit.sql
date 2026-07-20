-- ==============================================================================
-- SEC-104: AI KOTA KONTROLÜ (RATE LIMITING)
-- ==============================================================================
-- Lütfen bu kodu Supabase SQL Editor üzerinde çalıştırın.

-- 1. AI KULLANIM TABLOSU
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    request_count INT NOT NULL DEFAULT 1,
    UNIQUE(organization_id, usage_date)
);

-- RLS for ai_usage_logs
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant Isolation Policy" ON public.ai_usage_logs 
FOR ALL USING (organization_id IN (SELECT public.get_user_organizations()))
WITH CHECK (organization_id IN (SELECT public.get_user_organizations()));

-- 2. KOTA KONTROL FONKSİYONU
CREATE OR REPLACE FUNCTION public.check_ai_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_daily_limit INT := 100; -- Günlük standart limit
    v_current_count INT;
BEGIN
    -- Kullanıcının aktif organizasyonunu al
    SELECT organization_id INTO v_org_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Organizasyonun bugünkü kullanımını bul (Race condition önlemek için FOR UPDATE ile kilitliyoruz)
    SELECT request_count INTO v_current_count 
    FROM public.ai_usage_logs 
    WHERE organization_id = v_org_id AND usage_date = CURRENT_DATE 
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Bugün ilk istek
        INSERT INTO public.ai_usage_logs (organization_id, usage_date, request_count) 
        VALUES (v_org_id, CURRENT_DATE, 1);
        RETURN TRUE;
    ELSE
        IF v_current_count >= v_daily_limit THEN
            RETURN FALSE; -- Limit aşılmış
        ELSE
            -- Limiti aşmamış, 1 artır
            UPDATE public.ai_usage_logs 
            SET request_count = request_count + 1 
            WHERE organization_id = v_org_id AND usage_date = CURRENT_DATE;
            RETURN TRUE;
        END IF;
    END IF;
END;
$$;

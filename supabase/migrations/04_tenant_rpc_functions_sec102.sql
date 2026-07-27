-- ==============================================================================
-- SEC-102 (AŞAMA 6): TENANT-AWARE GÜVENLİ RPC FONKSİYONLARI
-- ==============================================================================

-- 1. Z-RAPORU SİLME RPC
CREATE OR REPLACE FUNCTION public.delete_z_report_transaction(p_batch_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Kullanıcı oturumu bulunamadı.';
    END IF;

    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id 
        FROM public.organization_members 
        WHERE user_id = v_user_id AND status = 'active' 
        LIMIT 1;
    END IF;

    IF v_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = v_org_id AND user_id = v_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Bu organizasyonda işlem yetkiniz yok.';
    END IF;

    DELETE FROM public.sales 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    DELETE FROM public.stock_movements 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    DELETE FROM public.activity_logs 
    WHERE ((details->>'batch_id')::uuid = p_batch_id OR (details->>'batchId')::uuid = p_batch_id) 
      AND organization_id = v_org_id;
END;
$$;

-- 2. FİŞ / FATURA SİLME RPC
CREATE OR REPLACE FUNCTION public.delete_receipt_transaction(p_source_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Kullanıcı oturumu bulunamadı.';
    END IF;

    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id 
        FROM public.organization_members 
        WHERE user_id = v_user_id AND status = 'active' 
        LIMIT 1;
    END IF;

    IF v_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = v_org_id AND user_id = v_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Bu organizasyonda işlem yetkiniz yok.';
    END IF;

    DELETE FROM public.stock_movements 
    WHERE source_id = p_source_id AND organization_id = v_org_id;

    DELETE FROM public.supplier_transactions 
    WHERE id = p_source_id AND organization_id = v_org_id;

    DELETE FROM public.account_movements 
    WHERE source_id = p_source_id AND organization_id = v_org_id;

    DELETE FROM public.activity_logs 
    WHERE ((details->>'source_id')::uuid = p_source_id OR (details->>'transaction_id')::uuid = p_source_id) 
      AND organization_id = v_org_id;
END;
$$;

-- 3. TEDARİKÇİ ÖDEME SİLME RPC
CREATE OR REPLACE FUNCTION public.delete_supplier_payment_transaction(p_transaction_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Kullanıcı oturumu bulunamadı.';
    END IF;

    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id 
        FROM public.organization_members 
        WHERE user_id = v_user_id AND status = 'active' 
        LIMIT 1;
    END IF;

    IF v_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.organization_members 
        WHERE organization_id = v_org_id AND user_id = v_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Bu organizasyonda işlem yetkiniz yok.';
    END IF;

    DELETE FROM public.account_movements 
    WHERE source_id = p_transaction_id AND organization_id = v_org_id;

    DELETE FROM public.supplier_transactions 
    WHERE id = p_transaction_id AND organization_id = v_org_id;

    DELETE FROM public.activity_logs 
    WHERE (details->>'transaction_id')::uuid = p_transaction_id 
      AND organization_id = v_org_id;
END;
$$;

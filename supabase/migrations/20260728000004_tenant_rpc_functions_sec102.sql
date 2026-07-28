-- ==============================================================================
-- SEC-102 & TASK LIST V2: GÜVENLİ VE BAKİYE TELAFİLİ RPC FONKSİYONLARI
-- ==============================================================================

-- 1. ESKİ VE UYUMSUZ OVERLOAD FONKSİYONLARI TEMİZLE (DROP FUNCTIONS)
DROP FUNCTION IF EXISTS public.delete_receipt_transaction(uuid);
DROP FUNCTION IF EXISTS public.delete_receipt_transaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_z_report_transaction(uuid);
DROP FUNCTION IF EXISTS public.delete_z_report_transaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_supplier_transaction(uuid);
DROP FUNCTION IF EXISTS public.delete_supplier_transaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_supplier_payment_transaction(uuid);
DROP FUNCTION IF EXISTS public.delete_supplier_payment_transaction(uuid, uuid);

-- 2. FİŞ / FATURA SİLME VE STOK/BAKİYE TELAFİ RPC
CREATE OR REPLACE FUNCTION public.delete_receipt_transaction(p_batch_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
    v_mov record;
    v_tx record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Oturum açmış kullanıcı bulunamadı.';
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

    -- A. Stokları geri al (Fiş eklendiğinde artmıştı, şimdi düşürülüyoruz)
    FOR v_mov IN 
        SELECT material_id, quantity 
        FROM public.stock_movements 
        WHERE batch_id = p_batch_id AND organization_id = v_org_id
    LOOP
        UPDATE public.materials 
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_mov.quantity)
        WHERE id = v_mov.material_id AND organization_id = v_org_id;
    END LOOP;

    -- Stok hareketlerini sil
    DELETE FROM public.stock_movements 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    -- B. Tedarikçi Cari İşlemlerini (Borç/Ödeme) Geri Al
    FOR v_tx IN 
        SELECT supplier_id, amount, transaction_type 
        FROM public.supplier_transactions 
        WHERE batch_id = p_batch_id AND organization_id = v_org_id
    LOOP
        IF v_tx.transaction_type = 'invoice' THEN
            UPDATE public.suppliers 
            SET total_debt = COALESCE(total_debt, 0) - v_tx.amount 
            WHERE id = v_tx.supplier_id AND organization_id = v_org_id;
        ELSIF v_tx.transaction_type = 'payment' THEN
            UPDATE public.suppliers 
            SET total_debt = COALESCE(total_debt, 0) + v_tx.amount 
            WHERE id = v_tx.supplier_id AND organization_id = v_org_id;
        END IF;
    END LOOP;

    -- Cari işlemleri sil
    DELETE FROM public.supplier_transactions 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    -- C. Bağlı Kasa Hareketlerini ve Logları Sil
    DELETE FROM public.account_movements 
    WHERE source_id = p_batch_id::text AND organization_id = v_org_id;

    DELETE FROM public.activity_logs 
    WHERE ((details->>'batch_id')::uuid = p_batch_id OR (details->>'source_id')::uuid = p_batch_id) 
      AND organization_id = v_org_id;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fiş silme işlemi başarısız: %', SQLERRM;
END;
$$;

-- 3. Z-RAPORU SİLME VE STOK/KASA TELAFİ RPC
CREATE OR REPLACE FUNCTION public.delete_z_report_transaction(p_batch_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
    v_mov record;
    v_acc_mov record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Oturum açmış kullanıcı bulunamadı.';
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

    -- A. Stokları geri ekle (Z-Raporu satıldığında düşmüştü, şimdi geri yüklüyoruz)
    FOR v_mov IN 
        SELECT material_id, quantity 
        FROM public.stock_movements 
        WHERE batch_id = p_batch_id AND organization_id = v_org_id
    LOOP
        UPDATE public.materials 
        SET stock_quantity = COALESCE(stock_quantity, 0) + v_mov.quantity
        WHERE id = v_mov.material_id AND organization_id = v_org_id;
    END LOOP;

    -- B. Stok, Satış ve Gider kayıtlarını sil
    DELETE FROM public.stock_movements 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    DELETE FROM public.sales 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    DELETE FROM public.expenses 
    WHERE batch_id = p_batch_id AND organization_id = v_org_id;

    -- C. Kasa Hareketlerini Rollback Yap ve Sil
    FOR v_acc_mov IN 
        SELECT account_id, amount, movement_type 
        FROM public.account_movements 
        WHERE source_type = 'z_report' 
          AND source_id = p_batch_id::text 
          AND organization_id = v_org_id
    LOOP
        IF v_acc_mov.movement_type = 'giris' THEN
            UPDATE public.accounts 
            SET balance = COALESCE(balance, 0) - v_acc_mov.amount
            WHERE id = v_acc_mov.account_id AND organization_id = v_org_id;
        ELSE
            UPDATE public.accounts 
            SET balance = COALESCE(balance, 0) + v_acc_mov.amount
            WHERE id = v_acc_mov.account_id AND organization_id = v_org_id;
        END IF;
    END LOOP;

    DELETE FROM public.account_movements 
    WHERE source_type = 'z_report' 
      AND source_id = p_batch_id::text 
      AND organization_id = v_org_id;

    DELETE FROM public.activity_logs 
    WHERE ((details->>'batch_id')::uuid = p_batch_id OR (details->>'batchId')::uuid = p_batch_id) 
      AND organization_id = v_org_id;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Z-Raporu silme başarısız: %', SQLERRM;
END;
$$;

-- 4. TEDARİKÇİ CARİ İŞLEM SİLME VE BAKİYE TELAFİ RPC
CREATE OR REPLACE FUNCTION public.delete_supplier_transaction(p_transaction_id UUID, p_organization_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID := p_organization_id;
    v_tx record;
    v_mov record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Yetkisiz erişim: Oturum açmış kullanıcı bulunamadı.';
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

    -- A. Silinecek işlemi bul
    SELECT supplier_id, amount, transaction_type INTO v_tx 
    FROM public.supplier_transactions 
    WHERE id = p_transaction_id AND organization_id = v_org_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Silinecek cari işlem bulunamadı.';
    END IF;

    -- B. Cari İşlemi Sil
    DELETE FROM public.supplier_transactions 
    WHERE id = p_transaction_id AND organization_id = v_org_id;

    -- C. Cari Bakiyeyi Geri Al (Rollback)
    IF v_tx.transaction_type = 'invoice' THEN
        UPDATE public.suppliers 
        SET total_debt = COALESCE(total_debt, 0) - v_tx.amount 
        WHERE id = v_tx.supplier_id AND organization_id = v_org_id;
    ELSIF v_tx.transaction_type = 'payment' THEN
        UPDATE public.suppliers 
        SET total_debt = COALESCE(total_debt, 0) + v_tx.amount 
        WHERE id = v_tx.supplier_id AND organization_id = v_org_id;
    END IF;

    -- D. Kasa İadesi (Sadece payment ise ve account_movement varsa)
    IF v_tx.transaction_type = 'payment' THEN
        FOR v_mov IN 
            DELETE FROM public.account_movements 
            WHERE source_type = 'supplier_payment' 
              AND source_id = p_transaction_id::text 
              AND organization_id = v_org_id
            RETURNING account_id, amount, movement_type
        LOOP
            IF v_mov.movement_type = 'cikis' THEN
                UPDATE public.accounts 
                SET balance = COALESCE(balance, 0) + v_mov.amount 
                WHERE id = v_mov.account_id AND organization_id = v_org_id;
            END IF;
        END LOOP;
    END IF;

    DELETE FROM public.activity_logs 
    WHERE (details->>'transaction_id')::uuid = p_transaction_id 
      AND organization_id = v_org_id;

    RETURN true;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Cari işlem silinirken hata oluştu: %', SQLERRM;
END;
$$;

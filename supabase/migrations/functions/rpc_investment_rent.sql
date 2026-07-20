-- ==============================================================================
-- FONKSİYON: process_investment_rent
-- AMACI: Kira gelirini tahsil ederken hesap bakiyesini ve hareketleri ATOMİK olarak işler.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_investment_rent(
    p_investment_id uuid,
    p_account_id uuid,
    p_amount numeric
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_current_balance numeric;
BEGIN
    -- 1. Hesabı kilitle ve bakiyesini al (Lost Update Race Condition'u engeller)
    SELECT balance INTO v_current_balance 
    FROM public.accounts 
    WHERE id = p_account_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Hesap bulunamadı.';
    END IF;

    -- 2. Bakiyeyi sunucu tarafında güncelle
    UPDATE public.accounts 
    SET balance = balance + p_amount 
    WHERE id = p_account_id;

    -- 3. Hesap hareketini (Giriş) ekle
    INSERT INTO public.account_movements (
        account_id, movement_type, amount, description, source_type
    ) VALUES (
        p_account_id, 'giris', p_amount, 'Gayrimenkul Kira Geliri Tahsilatı', 'investment_rent'
    );

    -- 4. Yatırım hareketini (Rent) ekle
    INSERT INTO public.investment_transactions (
        investment_id, transaction_type, quantity, price_per_unit, total_amount, account_id
    ) VALUES (
        p_investment_id, 'rent', 1, p_amount, p_amount, p_account_id
    );

    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Kira tahsilatı başarısız: %', SQLERRM;
END;
$$;

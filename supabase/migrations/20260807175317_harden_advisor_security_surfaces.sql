-- Harden the security surfaces reported by the Supabase Security Advisor.
-- SECURITY DEFINER remains only where privileged reads/writes are required;
-- every callable function validates the authenticated tenant explicitly.

CREATE OR REPLACE FUNCTION public.check_ai_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_organization_id uuid;
    v_daily_limit integer := 100;
    v_request_count integer;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN false;
    END IF;

    v_organization_id := public.current_organization_id();

    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RETURN false;
    END IF;

    INSERT INTO public.ai_usage_logs (organization_id, usage_date, request_count)
    VALUES (v_organization_id, current_date, 1)
    ON CONFLICT (organization_id, usage_date)
    DO UPDATE SET request_count = public.ai_usage_logs.request_count + 1
    WHERE public.ai_usage_logs.request_count < v_daily_limit
    RETURNING request_count INTO v_request_count;

    RETURN v_request_count IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_quota() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_ai_quota() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota() TO service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
    days_ago integer DEFAULT 30,
    default_target_margin numeric DEFAULT 35
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_organization_id uuid;
    v_since timestamp with time zone;
    v_target_margin numeric;
    v_margin_text text;
    v_result json;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '28000',
            MESSAGE = 'Panel istatistiklerini görüntülemek için oturum açmalısınız.';
    END IF;

    IF days_ago IS NULL OR days_ago < 1 OR days_ago > 3660 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'İstatistik tarih aralığı geçersiz.';
    END IF;

    IF default_target_margin IS NULL
       OR default_target_margin < 0
       OR default_target_margin > 100 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Hedef kâr marjı geçersiz.';
    END IF;

    v_organization_id := public.current_organization_id();

    IF v_organization_id IS NULL
       OR NOT public.is_organization_member(v_organization_id, v_user_id) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Aktif organizasyon için erişim yetkiniz yok.';
    END IF;

    v_since := now() - make_interval(days => days_ago);
    v_target_margin := default_target_margin;

    BEGIN
        SELECT setting.value::text
        INTO v_margin_text
        FROM public.settings AS setting
        WHERE setting.organization_id = v_organization_id
          AND setting.key = 'target_margin'
        LIMIT 1;

        IF v_margin_text IS NOT NULL THEN
            v_target_margin := replace(v_margin_text, '"', '')::numeric;
        END IF;
    EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            v_target_margin := default_target_margin;
    END;

    WITH product_stats AS (
        SELECT
            count(*) AS total_products,
            count(*) FILTER (
                WHERE ((product.sale_price - product.calculated_cost)
                    / nullif(product.sale_price, 0) * 100) < v_target_margin
            ) AS low_margin_products
        FROM public.products AS product
        WHERE product.organization_id = v_organization_id
    ),
    material_stats AS (
        SELECT
            count(*) AS total_ingredients,
            count(*) FILTER (
                WHERE material.stock_quantity <= material.critical_stock_level
                  AND material.critical_stock_level > 0
            ) AS critical_stock_count,
            coalesce(sum(material.stock_quantity * material.price_per_unit), 0) AS total_stock_value
        FROM public.materials AS material
        WHERE material.organization_id = v_organization_id
    ),
    critical_items AS (
        SELECT json_agg(
            json_build_object(
                'id', material.id,
                'name', material.name,
                'stock_quantity', material.stock_quantity,
                'unit', material.unit,
                'critical_stock_level', material.critical_stock_level
            )
        ) AS items
        FROM public.materials AS material
        WHERE material.organization_id = v_organization_id
          AND material.stock_quantity <= material.critical_stock_level
          AND material.critical_stock_level > 0
    ),
    expense_stats AS (
        SELECT
            coalesce(sum(expense.amount) FILTER (WHERE expense.category = 'indirim-ikram'), 0) AS total_discounts,
            coalesce(sum(expense.amount) FILTER (WHERE expense.category <> 'indirim-ikram'), 0) AS monthly_expenses
        FROM public.expenses AS expense
        WHERE expense.organization_id = v_organization_id
          AND expense.expense_date >= v_since
    ),
    sale_stats AS (
        SELECT
            coalesce(sum(sale.total_price), 0) AS gross_revenue,
            coalesce(sum(product.calculated_cost * sale.quantity), 0) AS total_cogs
        FROM public.sales AS sale
        LEFT JOIN public.products AS product
          ON product.id = sale.product_id
         AND product.organization_id = sale.organization_id
        WHERE sale.organization_id = v_organization_id
          AND sale.sale_date >= v_since
    ),
    account_stats AS (
        SELECT
            coalesce(sum(account.balance) FILTER (WHERE account.type = 'cash'), 0) AS total_cash,
            coalesce(sum(account.balance) FILTER (WHERE account.type = 'bank'), 0) AS total_bank
        FROM public.accounts AS account
        WHERE account.organization_id = v_organization_id
    ),
    investment_stats AS (
        SELECT json_agg(
            json_build_object(
                'asset_type', investment.asset_type,
                'quantity', investment.quantity,
                'average_cost', investment.average_cost
            )
        ) AS investments
        FROM public.investments AS investment
        WHERE investment.organization_id = v_organization_id
    )
    SELECT json_build_object(
        'targetMargin', v_target_margin,
        'totalProducts', coalesce((SELECT total_products FROM product_stats), 0),
        'totalIngredients', coalesce((SELECT total_ingredients FROM material_stats), 0),
        'criticalStockCount', coalesce((SELECT critical_stock_count FROM material_stats), 0),
        'totalStockValue', coalesce((SELECT total_stock_value FROM material_stats), 0),
        'lowMarginProducts', coalesce((SELECT low_margin_products FROM product_stats), 0),
        'criticalItems', coalesce((SELECT items FROM critical_items), '[]'::json),
        'totalDiscounts', coalesce((SELECT total_discounts FROM expense_stats), 0),
        'monthlyExpenses', coalesce((SELECT monthly_expenses FROM expense_stats), 0),
        'grossRevenue', coalesce((SELECT gross_revenue FROM sale_stats), 0),
        'totalCogs', coalesce((SELECT total_cogs FROM sale_stats), 0),
        'totalCash', coalesce((SELECT total_cash FROM account_stats), 0),
        'totalBank', coalesce((SELECT total_bank FROM account_stats), 0),
        'investmentsList', coalesce((SELECT investments FROM investment_stats), '[]'::json)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stats(integer, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(integer, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.get_users_info(user_ids uuid[])
RETURNS TABLE(id uuid, email character varying, full_name text, phone character varying)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        target_user.id,
        target_user.email::character varying,
        profile.full_name,
        profile.phone
    FROM auth.users AS target_user
    LEFT JOIN public.profiles AS profile ON profile.id = target_user.id
    WHERE auth.uid() IS NOT NULL
      AND target_user.id = ANY (coalesce(user_ids, ARRAY[]::uuid[]))
      AND EXISTS (
          SELECT 1
          FROM public.organization_members AS caller_membership
          INNER JOIN public.organization_members AS target_membership
            ON target_membership.organization_id = caller_membership.organization_id
           AND target_membership.user_id = target_user.id
           AND target_membership.status = 'active'
          WHERE caller_membership.user_id = auth.uid()
            AND caller_membership.status = 'active'
      );
$$;

REVOKE ALL ON FUNCTION public.get_users_info(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_users_info(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_users_info(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_info(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.is_organization_member(
    p_organization_id uuid,
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog'
AS $$
    SELECT auth.uid() IS NOT NULL
       AND p_user_id IS NOT DISTINCT FROM auth.uid()
       AND EXISTS (
           SELECT 1
           FROM public.organization_members AS membership
           WHERE membership.organization_id = p_organization_id
             AND membership.user_id = auth.uid()
             AND membership.status = 'active'
       );
$$;

REVOKE ALL ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_organization_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_organization_role(
    p_organization_id uuid,
    p_roles text[],
    p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'pg_catalog'
AS $$
    SELECT auth.uid() IS NOT NULL
       AND p_user_id IS NOT DISTINCT FROM auth.uid()
       AND EXISTS (
           SELECT 1
           FROM public.organization_members AS membership
           WHERE membership.organization_id = p_organization_id
             AND membership.user_id = auth.uid()
             AND membership.role = ANY (coalesce(p_roles, ARRAY[]::text[]))
             AND membership.status = 'active'
       );
$$;

REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[], uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[], uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[], uuid) TO service_role;

-- Trigger functions execute through their registered triggers. Client roles do
-- not need, and must not retain, direct EXECUTE privileges.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_default_organization() FROM PUBLIC, anon, authenticated, service_role;

-- These legacy policies allow Storage API listing across financial-document
-- buckets. Public URL compatibility is preserved for now; private-object
-- migration is handled separately because existing object paths must be moved.
DROP POLICY IF EXISTS "Public Okuma Izinleri" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads 1lnm9mj_1" ON storage.objects;

NOTIFY pgrst, 'reload schema';

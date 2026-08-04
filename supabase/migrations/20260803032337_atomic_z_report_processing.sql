-- Process every database mutation produced by a Z report in one transaction.
-- The document upload remains outside Postgres; only its immutable URL is passed in.

CREATE OR REPLACE FUNCTION public.process_z_report(
    p_organization_id uuid,
    p_report_date date,
    p_sales jsonb,
    p_expenses jsonb DEFAULT '[]'::jsonb,
    p_payment_methods jsonb DEFAULT '{}'::jsonb,
    p_document_url text DEFAULT NULL,
    p_replace_existing boolean DEFAULT false,
    p_audit_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_batch_id uuid := gen_random_uuid();
    v_existing_batch_id uuid;
    v_cash_account_id uuid;
    v_bank_account_id uuid;
    v_cash numeric := COALESCE((p_payment_methods->>'cash')::numeric, 0);
    v_credit_card numeric := COALESCE((p_payment_methods->>'credit_card')::numeric, 0);
    v_total_expense numeric;
    v_total_revenue numeric;
    v_matched_sales_count integer;
    v_deduction record;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF p_report_date IS NULL OR p_report_date > CURRENT_DATE + 1 THEN
        RAISE EXCEPTION 'Z-Raporu tarihi geçersiz.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_sales) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_sales) < 1
       OR jsonb_array_length(p_sales) > 2000 THEN
        RAISE EXCEPTION 'Z-Raporu 1 ile 2000 arasında satış satırı içermelidir.' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(p_expenses) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_expenses) > 1000
       OR jsonb_typeof(p_payment_methods) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_audit_details) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Z-Raporu ek verileri geçersiz.' USING ERRCODE = '22023';
    END IF;

    IF v_cash < 0 OR v_credit_card < 0 OR v_cash > 1000000000 OR v_credit_card > 1000000000 THEN
        RAISE EXCEPTION 'Ödeme yöntemi tutarları geçersiz.' USING ERRCODE = '22023';
    END IF;

    BEGIN
        IF EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(p_sales) AS sale(product_id uuid, quantity integer, total_price numeric)
            WHERE quantity IS NULL OR quantity <= 0 OR quantity > 100000
               OR total_price IS NULL OR total_price < 0 OR total_price > 1000000000
        ) OR EXISTS (
            SELECT 1
            FROM jsonb_to_recordset(p_expenses) AS expense(expense_name text, category text, amount numeric)
            WHERE length(btrim(COALESCE(expense_name, ''))) = 0
               OR length(btrim(expense_name)) > 255
               OR amount IS NULL OR amount < 0 OR amount > 1000000000
        ) THEN
            RAISE EXCEPTION 'Z-Raporu satırlarından biri geçersiz.' USING ERRCODE = '22023';
        END IF;
    EXCEPTION
        WHEN invalid_text_representation OR numeric_value_out_of_range THEN
            RAISE EXCEPTION 'Z-Raporu satır biçimi geçersiz.' USING ERRCODE = '22023';
    END;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_sales) AS sale(product_id uuid, quantity integer, total_price numeric)
        LEFT JOIN public.products AS product
          ON product.id = sale.product_id
         AND product.organization_id = p_organization_id
        WHERE sale.product_id IS NOT NULL AND product.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Satışlardan biri bu organizasyona ait olmayan bir ürüne bağlı.' USING ERRCODE = '42501';
    END IF;

    SELECT sale.batch_id
    INTO v_existing_batch_id
    FROM public.sales AS sale
    WHERE sale.organization_id = p_organization_id
      AND sale.sale_date::date = p_report_date
      AND sale.batch_id IS NOT NULL
    ORDER BY sale.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_existing_batch_id IS NOT NULL AND NOT p_replace_existing THEN
        RAISE EXCEPTION 'Bu tarihe ait bir Z-Raporu zaten bulunuyor.' USING ERRCODE = '23505';
    END IF;

    IF v_existing_batch_id IS NOT NULL THEN
        WITH restored AS (
            SELECT movement.material_id, sum(movement.quantity) AS quantity
            FROM public.stock_movements AS movement
            WHERE movement.batch_id = v_existing_batch_id
              AND movement.organization_id = p_organization_id
            GROUP BY movement.material_id
        )
        UPDATE public.materials AS material
        SET stock_quantity = COALESCE(material.stock_quantity, 0) + restored.quantity
        FROM restored
        WHERE material.id = restored.material_id
          AND material.organization_id = p_organization_id;

        WITH reversals AS (
            SELECT movement.account_id,
                   sum(CASE WHEN movement.movement_type = 'giris' THEN -movement.amount ELSE movement.amount END) AS amount
            FROM public.account_movements AS movement
            WHERE movement.source_type = 'z_report'
              AND movement.source_id = v_existing_batch_id::text
              AND movement.organization_id = p_organization_id
            GROUP BY movement.account_id
        )
        UPDATE public.accounts AS account
        SET balance = COALESCE(account.balance, 0) + reversals.amount
        FROM reversals
        WHERE account.id = reversals.account_id
          AND account.organization_id = p_organization_id;

        DELETE FROM public.stock_movements
        WHERE batch_id = v_existing_batch_id AND organization_id = p_organization_id;
        DELETE FROM public.sales
        WHERE batch_id = v_existing_batch_id AND organization_id = p_organization_id;
        DELETE FROM public.expenses
        WHERE batch_id = v_existing_batch_id AND organization_id = p_organization_id;
        DELETE FROM public.account_movements
        WHERE source_type = 'z_report'
          AND source_id = v_existing_batch_id::text
          AND organization_id = p_organization_id;
        DELETE FROM public.activity_logs
        WHERE organization_id = p_organization_id
          AND (details->>'batchId' = v_existing_batch_id::text OR details->>'batch_id' = v_existing_batch_id::text);
    END IF;

    INSERT INTO public.sales (
        batch_id, sale_date, product_id, quantity, unit_price, total_price, document_url, organization_id
    )
    SELECT
        v_batch_id,
        p_report_date,
        sale.product_id,
        sale.quantity,
        CASE WHEN sale.quantity > 0 THEN round(sale.total_price / sale.quantity, 2) ELSE 0 END,
        sale.total_price,
        NULLIF(btrim(p_document_url), ''),
        p_organization_id
    FROM jsonb_to_recordset(p_sales) AS sale(product_id uuid, quantity integer, total_price numeric);

    INSERT INTO public.expenses (batch_id, name, category, amount, period, expense_date, organization_id)
    SELECT
        v_batch_id,
        btrim(expense.expense_name),
        COALESCE(NULLIF(btrim(expense.category), ''), 'diger'),
        expense.amount,
        'daily',
        p_report_date,
        p_organization_id
    FROM jsonb_to_recordset(p_expenses) AS expense(expense_name text, category text, amount numeric);

    SELECT COALESCE(sum(expense.amount), 0)
    INTO v_total_expense
    FROM jsonb_to_recordset(p_expenses) AS expense(expense_name text, category text, amount numeric)
    WHERE COALESCE(expense.category, '') <> 'indirim-ikram';

    SELECT account.id INTO v_cash_account_id
    FROM public.accounts AS account
    WHERE account.organization_id = p_organization_id AND account.type = 'cash'
    ORDER BY account.created_at
    LIMIT 1
    FOR UPDATE;

    SELECT account.id INTO v_bank_account_id
    FROM public.accounts AS account
    WHERE account.organization_id = p_organization_id AND account.type = 'bank'
    ORDER BY account.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_cash_account_id IS NOT NULL AND v_cash > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_cash_account_id, 'giris', v_cash, p_report_date || ' Z-Raporu Nakit Hasılat',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) + v_cash
        WHERE id = v_cash_account_id AND organization_id = p_organization_id;
    END IF;

    IF v_bank_account_id IS NOT NULL AND v_credit_card > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_bank_account_id, 'giris', v_credit_card, p_report_date || ' Z-Raporu Kredi Kartı Hasılat',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) + v_credit_card
        WHERE id = v_bank_account_id AND organization_id = p_organization_id;
    END IF;

    IF v_cash_account_id IS NOT NULL AND v_total_expense > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_cash_account_id, 'cikis', v_total_expense, p_report_date || ' Z-Raporu Kasadan Giderler',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) - v_total_expense
        WHERE id = v_cash_account_id AND organization_id = p_organization_id;
    END IF;

    FOR v_deduction IN
        WITH sales_input AS (
            SELECT product_id, quantity
            FROM jsonb_to_recordset(p_sales) AS sale(product_id uuid, quantity integer, total_price numeric)
            WHERE product_id IS NOT NULL
        ), deductions AS (
            SELECT ingredient.material_id,
                   sum(sale.quantity * ingredient.quantity) AS quantity
            FROM sales_input AS sale
            JOIN public.product_ingredients AS ingredient
              ON ingredient.product_id = sale.product_id
             AND ingredient.organization_id = p_organization_id
            WHERE ingredient.material_id IS NOT NULL
            GROUP BY ingredient.material_id
            UNION ALL
            SELECT sub_ingredient.material_id,
                   sum(sale.quantity * ingredient.quantity * sub_ingredient.quantity
                       / GREATEST(COALESCE(recipe.yield_quantity, 1), 0.0001)) AS quantity
            FROM sales_input AS sale
            JOIN public.product_ingredients AS ingredient
              ON ingredient.product_id = sale.product_id
             AND ingredient.organization_id = p_organization_id
            JOIN public.sub_recipes AS recipe
              ON recipe.id = ingredient.sub_recipe_id
             AND recipe.organization_id = p_organization_id
            JOIN public.sub_recipe_ingredients AS sub_ingredient
              ON sub_ingredient.sub_recipe_id = recipe.id
             AND sub_ingredient.organization_id = p_organization_id
            WHERE ingredient.sub_recipe_id IS NOT NULL
            GROUP BY sub_ingredient.material_id
        )
        SELECT material_id, sum(quantity) AS quantity
        FROM deductions
        GROUP BY material_id
    LOOP
        PERFORM 1
        FROM public.materials
        WHERE id = v_deduction.material_id AND organization_id = p_organization_id
        FOR UPDATE;

        INSERT INTO public.stock_movements (
            batch_id, material_id, movement_type, quantity, note, user_id, organization_id
        ) VALUES (
            v_batch_id, v_deduction.material_id, 'cikis', v_deduction.quantity,
            format('Z Raporu Otomatik Düşümü (%s)', p_report_date), v_user_id, p_organization_id
        );

        UPDATE public.materials
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_deduction.quantity)
        WHERE id = v_deduction.material_id AND organization_id = p_organization_id;
    END LOOP;

    SELECT COALESCE(sum(sale.total_price), 0), count(*) FILTER (WHERE sale.product_id IS NOT NULL)
    INTO v_total_revenue, v_matched_sales_count
    FROM jsonb_to_recordset(p_sales) AS sale(product_id uuid, quantity integer, total_price numeric);

    INSERT INTO public.activity_logs (
        module, action_type, description, details, user_id, organization_id
    ) VALUES (
        'Z-Raporu',
        'EKLEME',
        format('%s tarihli Z-Raporu sisteme işlendi.', p_report_date),
        p_audit_details || jsonb_build_object(
            'batchId', v_batch_id,
            'toplam_gelir', v_total_revenue,
            'eslesen_satis_sayisi', v_matched_sales_count,
            'replacedBatchId', v_existing_batch_id
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.process_z_report(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_z_report(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';

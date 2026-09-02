DO $migration_guard$
DECLARE
  v_supplier_predecessor_count integer;
  v_z_report_predecessor_count integer;
  v_supplier_legacy_count integer;
  v_z_report_legacy_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_supplier_predecessor_count
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = proc.pronamespace
  JOIN pg_catalog.pg_language AS lang
    ON lang.oid = proc.prolang
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'delete_supplier_transaction'
    AND proc.prokind = 'f'
    AND proc.proargtypes = '2950 2950'::pg_catalog.oidvector
    AND proc.proargnames = ARRAY['p_transaction_id', 'p_organization_id']::text[]
    AND proc.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
    AND lang.lanname = 'plpgsql';

  SELECT count(*)::integer
  INTO v_z_report_predecessor_count
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = proc.pronamespace
  JOIN pg_catalog.pg_language AS lang
    ON lang.oid = proc.prolang
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'delete_z_report_transaction'
    AND proc.prokind = 'f'
    AND proc.proargtypes = '2950 2950'::pg_catalog.oidvector
    AND proc.proargnames = ARRAY['p_batch_id', 'p_organization_id']::text[]
    AND proc.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
    AND lang.lanname = 'plpgsql';

  SELECT count(*)::integer
  INTO v_supplier_legacy_count
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'delete_supplier_transaction'
    AND proc.prokind = 'f'
    AND proc.proargtypes = '2950'::pg_catalog.oidvector;

  SELECT count(*)::integer
  INTO v_z_report_legacy_count
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = proc.pronamespace
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'delete_z_report_transaction'
    AND proc.prokind = 'f'
    AND proc.proargtypes = '2950'::pg_catalog.oidvector;

  IF v_supplier_predecessor_count <> 1
     OR v_z_report_predecessor_count <> 1
     OR v_supplier_legacy_count <> 0
     OR v_z_report_legacy_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = pg_catalog.format(
        'Destructive RPC predecessor mismatch: supplier_exact=%s, z_report_exact=%s, supplier_legacy=%s, z_report_legacy=%s.',
        v_supplier_predecessor_count,
        v_z_report_predecessor_count,
        v_supplier_legacy_count,
        v_z_report_legacy_count
      );
  END IF;
END;
$migration_guard$;

DO $z_writer_guard$
DECLARE
  v_exact_count integer;
  v_total_count integer;
BEGIN
  SELECT
    count(*) FILTER (
      WHERE proc.proargtypes = '2950 1082 3802 3802 3802 25 16 3802'::pg_catalog.oidvector
        AND proc.proargnames = ARRAY[
          'p_organization_id',
          'p_report_date',
          'p_sales',
          'p_expenses',
          'p_payment_methods',
          'p_document_url',
          'p_replace_existing',
          'p_audit_details'
        ]::text[]
        AND proc.prorettype = 'pg_catalog.uuid'::pg_catalog.regtype
        AND lang.lanname = 'plpgsql'
    )::integer,
    count(*)::integer
  INTO v_exact_count, v_total_count
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = proc.pronamespace
  JOIN pg_catalog.pg_language AS lang
    ON lang.oid = proc.prolang
  WHERE namespace.nspname = 'public'
    AND proc.proname = 'process_z_report_atomic'
    AND proc.prokind = 'f';

  IF v_exact_count <> 1 OR v_total_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = pg_catalog.format(
        'Z-report writer predecessor mismatch: exact=%s, total=%s.',
        v_exact_count,
        v_total_count
      );
  END IF;
END;
$z_writer_guard$;

CREATE OR REPLACE FUNCTION public.process_z_report_atomic(
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
    v_revalidated_batch_id uuid;
    v_lock_key bigint;
    v_update_count integer := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Oturum açmış bir kullanıcı gereklidir.' USING ERRCODE = '42501';
    END IF;

    IF p_organization_id IS NULL
       OR NOT public.is_organization_member(p_organization_id, v_user_id) THEN
        RAISE EXCEPTION 'Bu organizasyonda işlem yetkiniz yok.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles AS selected_profile
        WHERE selected_profile.id = auth.uid()
          AND selected_profile.active_organization_id = p_organization_id
    ) THEN
        RAISE EXCEPTION 'Seçili işletme değişti. Lütfen işlemi yeniden başlatın.' USING ERRCODE = '42501';
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

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            p_organization_id::text || ':z-report-date:' || p_report_date::text,
            0
        )
    );

    SELECT sale.batch_id
    INTO v_existing_batch_id
    FROM public.sales AS sale
    WHERE sale.organization_id = p_organization_id
      AND sale.sale_date::date = p_report_date
      AND sale.batch_id IS NOT NULL
    ORDER BY sale.created_at, sale.id
    LIMIT 1;

    FOR v_lock_key IN
        SELECT DISTINCT lock_keys.lock_key
        FROM pg_catalog.unnest(
            pg_catalog.array_remove(
                ARRAY[
                    pg_catalog.hashtextextended(
                        p_organization_id::text || ':' || v_batch_id::text,
                        0
                    ),
                    CASE
                        WHEN v_existing_batch_id IS NULL THEN NULL::bigint
                        ELSE pg_catalog.hashtextextended(
                            p_organization_id::text || ':' || v_existing_batch_id::text,
                            0
                        )
                    END
                ],
                NULL::bigint
            )
        ) AS lock_keys(lock_key)
        ORDER BY lock_keys.lock_key
    LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);
    END LOOP;

    SELECT sale.batch_id
    INTO v_revalidated_batch_id
    FROM public.sales AS sale
    WHERE sale.organization_id = p_organization_id
      AND sale.sale_date::date = p_report_date
      AND sale.batch_id IS NOT NULL
    ORDER BY sale.created_at, sale.id
    LIMIT 1;

    IF v_revalidated_batch_id IS DISTINCT FROM v_existing_batch_id
       AND v_revalidated_batch_id IS NOT NULL THEN
        RAISE EXCEPTION
            'Z-Raporu eşzamanlı olarak değişti. Lütfen işlemi yeniden deneyin.'
            USING ERRCODE = '40001';
    END IF;

    v_existing_batch_id := v_revalidated_batch_id;

    IF v_existing_batch_id IS NOT NULL AND NOT p_replace_existing THEN
        RAISE EXCEPTION 'Bu tarihe ait bir Z-Raporu zaten bulunuyor.' USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(sum(expense.amount), 0)
    INTO v_total_expense
    FROM jsonb_to_recordset(p_expenses) AS expense(expense_name text, category text, amount numeric)
    WHERE COALESCE(expense.category, '') <> 'indirim-ikram';

    SELECT account.id INTO v_cash_account_id
    FROM public.accounts AS account
    WHERE account.organization_id = p_organization_id AND account.type = 'cash'
    ORDER BY account.created_at, account.id
    LIMIT 1;

    SELECT account.id INTO v_bank_account_id
    FROM public.accounts AS account
    WHERE account.organization_id = p_organization_id AND account.type = 'bank'
    ORDER BY account.created_at, account.id
    LIMIT 1;

    IF (v_cash > 0 OR v_total_expense > 0) AND v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Z-Raporu için kasa hesabı bulunamadı.' USING ERRCODE = '22023';
    END IF;

    IF v_credit_card > 0 AND v_bank_account_id IS NULL THEN
        RAISE EXCEPTION 'Z-Raporu için banka hesabı bulunamadı.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_movements AS movement
        WHERE movement.batch_id = v_existing_batch_id
          AND movement.organization_id = p_organization_id
          AND (
              movement.material_id IS NULL
              OR movement.movement_type IS NULL
              OR movement.movement_type <> 'cikis'
          )
    ) THEN
        RAISE EXCEPTION 'Mevcut Z-Raporu stok hareketi geçersiz.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.account_movements AS movement
        WHERE movement.source_type = 'z_report'
          AND movement.source_id = v_existing_batch_id::text
          AND movement.organization_id = p_organization_id
          AND (
              movement.account_id IS NULL
              OR movement.movement_type IS NULL
              OR movement.movement_type NOT IN ('giris', 'cikis')
          )
    ) THEN
        RAISE EXCEPTION 'Mevcut Z-Raporu hesap hareketi geçersiz.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.stock_movements AS movement
        LEFT JOIN public.materials AS material
          ON material.id = movement.material_id
         AND material.organization_id = movement.organization_id
        WHERE movement.batch_id = v_existing_batch_id
          AND movement.organization_id = p_organization_id
          AND material.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Mevcut Z-Raporu malzeme kaydı bulunamadı.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.account_movements AS movement
        LEFT JOIN public.accounts AS account
          ON account.id = movement.account_id
         AND account.organization_id = movement.organization_id
        WHERE movement.source_type = 'z_report'
          AND movement.source_id = v_existing_batch_id::text
          AND movement.organization_id = p_organization_id
          AND account.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Mevcut Z-Raporu hesap kaydı bulunamadı.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH sales_input AS (
            SELECT product_id, quantity
            FROM jsonb_to_recordset(p_sales)
                AS sale(product_id uuid, quantity integer, total_price numeric)
            WHERE product_id IS NOT NULL
        ), deductions AS (
            SELECT ingredient.material_id
            FROM sales_input AS sale
            JOIN public.product_ingredients AS ingredient
              ON ingredient.product_id = sale.product_id
             AND ingredient.organization_id = p_organization_id
            WHERE ingredient.material_id IS NOT NULL
            UNION
            SELECT sub_ingredient.material_id
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
        )
        SELECT 1
        FROM deductions AS deduction
        LEFT JOIN public.materials AS material
          ON material.id = deduction.material_id
         AND material.organization_id = p_organization_id
        WHERE deduction.material_id IS NULL OR material.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Z-Raporu malzeme kaydı bulunamadı.' USING ERRCODE = '22023';
    END IF;

    PERFORM material.id
    FROM public.materials AS material
    WHERE material.organization_id = p_organization_id
      AND material.id IN (
          WITH sales_input AS (
              SELECT product_id, quantity
              FROM jsonb_to_recordset(p_sales)
                  AS sale(product_id uuid, quantity integer, total_price numeric)
              WHERE product_id IS NOT NULL
          ), deductions AS (
              SELECT ingredient.material_id
              FROM sales_input AS sale
              JOIN public.product_ingredients AS ingredient
                ON ingredient.product_id = sale.product_id
               AND ingredient.organization_id = p_organization_id
              WHERE ingredient.material_id IS NOT NULL
              UNION
              SELECT sub_ingredient.material_id
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
          )
          SELECT movement.material_id
          FROM public.stock_movements AS movement
          WHERE movement.batch_id = v_existing_batch_id
            AND movement.organization_id = p_organization_id
          UNION
          SELECT deduction.material_id
          FROM deductions AS deduction
      )
    ORDER BY material.id
    FOR UPDATE;

    PERFORM account.id
    FROM public.accounts AS account
    WHERE account.organization_id = p_organization_id
      AND account.id IN (
          SELECT movement.account_id
          FROM public.account_movements AS movement
          WHERE movement.source_type = 'z_report'
            AND movement.source_id = v_existing_batch_id::text
            AND movement.organization_id = p_organization_id
          UNION
          SELECT v_cash_account_id WHERE v_cash > 0 OR v_total_expense > 0
          UNION
          SELECT v_bank_account_id WHERE v_credit_card > 0
      )
    ORDER BY account.id
    FOR UPDATE;

    PERFORM movement.id
    FROM public.stock_movements AS movement
    WHERE movement.batch_id = v_existing_batch_id
      AND movement.organization_id = p_organization_id
    ORDER BY movement.id
    FOR UPDATE;

    PERFORM sale.id
    FROM public.sales AS sale
    WHERE sale.batch_id = v_existing_batch_id
      AND sale.organization_id = p_organization_id
    ORDER BY sale.id
    FOR UPDATE;

    PERFORM expense.id
    FROM public.expenses AS expense
    WHERE expense.batch_id = v_existing_batch_id
      AND expense.organization_id = p_organization_id
    ORDER BY expense.id
    FOR UPDATE;

    PERFORM movement.id
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = v_existing_batch_id::text
      AND movement.organization_id = p_organization_id
    ORDER BY movement.id
    FOR UPDATE;

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
                   sum(
                       CASE movement.movement_type
                           WHEN 'giris' THEN -movement.amount
                           WHEN 'cikis' THEN movement.amount
                       END
                   ) AS amount
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

    IF v_cash > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_cash_account_id, 'giris', v_cash, p_report_date || ' Z-Raporu Nakit Hasılat',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) + v_cash
        WHERE id = v_cash_account_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_update_count = ROW_COUNT;
        IF v_update_count <> 1 THEN
            RAISE EXCEPTION 'Z-Raporu kasa hesabı güncellenemedi.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_credit_card > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_bank_account_id, 'giris', v_credit_card, p_report_date || ' Z-Raporu Kredi Kartı Hasılat',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) + v_credit_card
        WHERE id = v_bank_account_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_update_count = ROW_COUNT;
        IF v_update_count <> 1 THEN
            RAISE EXCEPTION 'Z-Raporu banka hesabı güncellenemedi.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF v_total_expense > 0 THEN
        INSERT INTO public.account_movements (
            account_id, movement_type, amount, description, source_type, source_id, organization_id
        ) VALUES (
            v_cash_account_id, 'cikis', v_total_expense, p_report_date || ' Z-Raporu Kasadan Giderler',
            'z_report', v_batch_id::text, p_organization_id
        );
        UPDATE public.accounts SET balance = COALESCE(balance, 0) - v_total_expense
        WHERE id = v_cash_account_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_update_count = ROW_COUNT;
        IF v_update_count <> 1 THEN
            RAISE EXCEPTION 'Z-Raporu gider hesabı güncellenemedi.' USING ERRCODE = '22023';
        END IF;
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
        INSERT INTO public.stock_movements (
            batch_id, material_id, movement_type, quantity, note, user_id, organization_id
        ) VALUES (
            v_batch_id, v_deduction.material_id, 'cikis', v_deduction.quantity,
            format('Z Raporu Otomatik Düşümü (%s)', p_report_date), v_user_id, p_organization_id
        );

        UPDATE public.materials
        SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - v_deduction.quantity)
        WHERE id = v_deduction.material_id AND organization_id = p_organization_id;
        GET DIAGNOSTICS v_update_count = ROW_COUNT;
        IF v_update_count <> 1 THEN
            RAISE EXCEPTION 'Z-Raporu malzeme grubu güncellenemedi.' USING ERRCODE = '22023';
        END IF;
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

CREATE OR REPLACE FUNCTION public.delete_supplier_transaction(
  p_transaction_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid := coalesce(p_organization_id, private.current_organization_id());
  v_tx record;
  v_account_movement_count integer := 0;
  v_account_balance_reversed numeric := 0;
  v_expected_account_groups integer := 0;
  v_updated_account_groups integer := 0;
  v_supplier_update_count integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Oturum açmanız gerekiyor.';
  END IF;

  IF v_org_id IS NULL OR NOT private.is_current_user_organization_member(v_org_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Bu işletmede işlem yetkiniz yok.';
  END IF;

  SELECT
    supplier_tx.supplier_id,
    supplier_tx.amount,
    supplier_tx.transaction_type
  INTO v_tx
  FROM public.supplier_transactions AS supplier_tx
  WHERE supplier_tx.id = p_transaction_id
    AND supplier_tx.organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Cari işlem bulunamadı.';
  END IF;

  IF v_tx.transaction_type IS NULL
     OR v_tx.transaction_type NOT IN ('invoice', 'payment') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cari işlem türü geçersiz.';
  END IF;

  IF v_tx.supplier_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cari işlemin tedarikçi kaydı geçersiz.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'supplier_payment'
      AND movement.source_id = p_transaction_id::text
      AND movement.organization_id = v_org_id
      AND (
        movement.account_id IS NULL
        OR movement.movement_type IS NULL
        OR movement.movement_type <> 'cikis'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Tedarikçi hesap hareketi geçersiz.';
  END IF;

  PERFORM supplier.id
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_tx.supplier_id
    AND supplier.organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cari işlemin tedarikçi kaydı bulunamadı.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_movements AS movement
    LEFT JOIN public.accounts AS account
      ON account.id = movement.account_id
     AND account.organization_id = movement.organization_id
    WHERE movement.source_type = 'supplier_payment'
      AND movement.source_id = p_transaction_id::text
      AND movement.organization_id = v_org_id
      AND account.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Tedarikçi hesap hareketinin hesap kaydı bulunamadı.';
  END IF;

  PERFORM account.id
  FROM public.accounts AS account
  WHERE account.organization_id = v_org_id
    AND account.id IN (
      SELECT movement.account_id
      FROM public.account_movements AS movement
      WHERE movement.source_type = 'supplier_payment'
        AND movement.source_id = p_transaction_id::text
        AND movement.organization_id = v_org_id
    )
  ORDER BY account.id
  FOR UPDATE;

  SELECT count(DISTINCT movement.account_id)::integer
  INTO v_expected_account_groups
  FROM public.account_movements AS movement
  WHERE movement.source_type = 'supplier_payment'
    AND movement.source_id = p_transaction_id::text
    AND movement.organization_id = v_org_id;

  DELETE FROM public.supplier_transactions AS supplier_tx
  WHERE supplier_tx.id = p_transaction_id
    AND supplier_tx.organization_id = v_org_id;

  IF v_tx.transaction_type = 'invoice' THEN
    UPDATE public.suppliers AS supplier
    SET total_debt = coalesce(supplier.total_debt, 0) - v_tx.amount
    WHERE supplier.id = v_tx.supplier_id
      AND supplier.organization_id = v_org_id;
  ELSIF v_tx.transaction_type = 'payment' THEN
    UPDATE public.suppliers AS supplier
    SET total_debt = coalesce(supplier.total_debt, 0) + v_tx.amount
    WHERE supplier.id = v_tx.supplier_id
      AND supplier.organization_id = v_org_id;
  END IF;
  GET DIAGNOSTICS v_supplier_update_count = ROW_COUNT;

  IF v_supplier_update_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Cari işlemin tedarikçi bakiyesi güncellenemedi.';
  END IF;

  WITH deleted_movements AS (
    DELETE FROM public.account_movements AS movement
    WHERE movement.source_type = 'supplier_payment'
      AND movement.source_id = p_transaction_id::text
      AND movement.organization_id = v_org_id
    RETURNING movement.account_id, movement.amount
  ), account_reversals AS (
    SELECT
      deleted.account_id,
      count(*)::integer AS movement_count,
      pg_catalog.sum(deleted.amount) AS balance_reversed
    FROM deleted_movements AS deleted
    GROUP BY deleted.account_id
  ), updated_accounts AS (
    UPDATE public.accounts AS account
    SET balance = coalesce(account.balance, 0) + reversal.balance_reversed
    FROM account_reversals AS reversal
    WHERE account.id = reversal.account_id
      AND account.organization_id = v_org_id
    RETURNING reversal.movement_count, reversal.balance_reversed
  )
  SELECT
    coalesce(pg_catalog.sum(updated.movement_count), 0)::integer,
    coalesce(pg_catalog.sum(updated.balance_reversed), 0),
    count(*)::integer
  INTO
    v_account_movement_count,
    v_account_balance_reversed,
    v_updated_account_groups
  FROM updated_accounts AS updated;

  IF v_updated_account_groups <> v_expected_account_groups THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Tedarikçi hesap grupları güncellenemedi.';
  END IF;

  INSERT INTO public.activity_logs (
    module,
    action_type,
    description,
    details,
    user_id,
    organization_id
  ) VALUES (
    'Tedarikçi',
    'SILME',
    'Tedarikçi cari işlemi silindi ve finansal etkileri geri alındı.',
    pg_catalog.jsonb_build_object(
      'transaction_id', p_transaction_id,
      'organization_id', v_org_id,
      'supplier_id', v_tx.supplier_id,
      'transaction_type', v_tx.transaction_type,
      'amount', v_tx.amount,
      'account_movements_deleted', v_account_movement_count,
      'account_balance_reversed', v_account_balance_reversed
    ),
    v_user_id::text,
    v_org_id
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_z_report_transaction(
  p_batch_id uuid,
  p_organization_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_org_id uuid := coalesce(p_organization_id, private.current_organization_id());
  v_stock_count integer := 0;
  v_sales_count integer := 0;
  v_expense_count integer := 0;
  v_account_movement_count integer := 0;
  v_stock_quantity_restored numeric := 0;
  v_account_balance_reversed numeric := 0;
  v_expected_material_groups integer := 0;
  v_updated_material_groups integer := 0;
  v_expected_account_groups integer := 0;
  v_updated_account_groups integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '28000',
      MESSAGE = 'Oturum açmanız gerekiyor.';
  END IF;

  IF v_org_id IS NULL OR NOT private.is_current_user_organization_member(v_org_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Bu işletmede işlem yetkiniz yok.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org_id::text || ':' || p_batch_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.batch_id = p_batch_id
      AND movement.organization_id = v_org_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.sales AS sale
    WHERE sale.batch_id = p_batch_id
      AND sale.organization_id = v_org_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.expenses AS expense
    WHERE expense.batch_id = p_batch_id
      AND expense.organization_id = v_org_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = p_batch_id::text
      AND movement.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Z-Raporu bulunamadı.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    WHERE movement.batch_id = p_batch_id
      AND movement.organization_id = v_org_id
      AND (
        movement.material_id IS NULL
        OR movement.movement_type IS NULL
        OR movement.movement_type <> 'cikis'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu stok hareketi geçersiz.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = p_batch_id::text
      AND movement.organization_id = v_org_id
      AND (
        movement.account_id IS NULL
        OR movement.movement_type IS NULL
        OR movement.movement_type NOT IN ('giris', 'cikis')
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu hesap hareketi geçersiz.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements AS movement
    LEFT JOIN public.materials AS material
      ON material.id = movement.material_id
     AND material.organization_id = movement.organization_id
    WHERE movement.batch_id = p_batch_id
      AND movement.organization_id = v_org_id
      AND material.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu malzeme kaydı bulunamadı.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.account_movements AS movement
    LEFT JOIN public.accounts AS account
      ON account.id = movement.account_id
     AND account.organization_id = movement.organization_id
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = p_batch_id::text
      AND movement.organization_id = v_org_id
      AND account.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu hesap kaydı bulunamadı.';
  END IF;

  PERFORM material.id
  FROM public.materials AS material
  WHERE material.organization_id = v_org_id
    AND material.id IN (
      SELECT movement.material_id
      FROM public.stock_movements AS movement
      WHERE movement.batch_id = p_batch_id
        AND movement.organization_id = v_org_id
    )
  ORDER BY material.id
  FOR UPDATE;

  PERFORM account.id
  FROM public.accounts AS account
  WHERE account.organization_id = v_org_id
    AND account.id IN (
      SELECT movement.account_id
      FROM public.account_movements AS movement
      WHERE movement.source_type = 'z_report'
        AND movement.source_id = p_batch_id::text
        AND movement.organization_id = v_org_id
    )
  ORDER BY account.id
  FOR UPDATE;

  PERFORM movement.id
  FROM public.stock_movements AS movement
  WHERE movement.batch_id = p_batch_id
    AND movement.organization_id = v_org_id
  ORDER BY movement.id
  FOR UPDATE;

  PERFORM sale.id
  FROM public.sales AS sale
  WHERE sale.batch_id = p_batch_id
    AND sale.organization_id = v_org_id
  ORDER BY sale.id
  FOR UPDATE;

  PERFORM expense.id
  FROM public.expenses AS expense
  WHERE expense.batch_id = p_batch_id
    AND expense.organization_id = v_org_id
  ORDER BY expense.id
  FOR UPDATE;

  PERFORM movement.id
  FROM public.account_movements AS movement
  WHERE movement.source_type = 'z_report'
    AND movement.source_id = p_batch_id::text
    AND movement.organization_id = v_org_id
  ORDER BY movement.id
  FOR UPDATE;

  SELECT count(DISTINCT movement.material_id)::integer
  INTO v_expected_material_groups
  FROM public.stock_movements AS movement
  WHERE movement.batch_id = p_batch_id
    AND movement.organization_id = v_org_id;

  WITH material_totals AS (
    SELECT
      movement.material_id,
      pg_catalog.sum(movement.quantity) AS quantity_restored
    FROM public.stock_movements AS movement
    WHERE movement.batch_id = p_batch_id
      AND movement.organization_id = v_org_id
    GROUP BY movement.material_id
  ), updated_materials AS (
    UPDATE public.materials AS material
    SET stock_quantity = coalesce(material.stock_quantity, 0) + total.quantity_restored
    FROM material_totals AS total
    WHERE material.id = total.material_id
      AND material.organization_id = v_org_id
    RETURNING total.quantity_restored
  )
  SELECT
    coalesce(pg_catalog.sum(updated.quantity_restored), 0),
    count(*)::integer
  INTO v_stock_quantity_restored, v_updated_material_groups
  FROM updated_materials AS updated;

  IF v_updated_material_groups <> v_expected_material_groups THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu malzeme grupları güncellenemedi.';
  END IF;

  SELECT count(DISTINCT movement.account_id)::integer
  INTO v_expected_account_groups
  FROM public.account_movements AS movement
  WHERE movement.source_type = 'z_report'
    AND movement.source_id = p_batch_id::text
    AND movement.organization_id = v_org_id;

  WITH account_deltas AS (
    SELECT
      movement.account_id,
      pg_catalog.sum(
        CASE movement.movement_type
          WHEN 'giris' THEN -movement.amount
          WHEN 'cikis' THEN movement.amount
        END
      ) AS balance_delta
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = p_batch_id::text
      AND movement.organization_id = v_org_id
    GROUP BY movement.account_id
  ), updated_accounts AS (
    UPDATE public.accounts AS account
    SET balance = coalesce(account.balance, 0) + delta.balance_delta
    FROM account_deltas AS delta
    WHERE account.id = delta.account_id
      AND account.organization_id = v_org_id
    RETURNING pg_catalog.abs(delta.balance_delta) AS balance_reversed
  )
  SELECT
    coalesce(pg_catalog.sum(updated.balance_reversed), 0),
    count(*)::integer
  INTO v_account_balance_reversed, v_updated_account_groups
  FROM updated_accounts AS updated;

  IF v_updated_account_groups <> v_expected_account_groups THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Z-Raporu hesap grupları güncellenemedi.';
  END IF;

  DELETE FROM public.stock_movements AS movement
  WHERE movement.batch_id = p_batch_id
    AND movement.organization_id = v_org_id;
  GET DIAGNOSTICS v_stock_count = ROW_COUNT;

  DELETE FROM public.sales AS sale
  WHERE sale.batch_id = p_batch_id
    AND sale.organization_id = v_org_id;
  GET DIAGNOSTICS v_sales_count = ROW_COUNT;

  DELETE FROM public.expenses AS expense
  WHERE expense.batch_id = p_batch_id
    AND expense.organization_id = v_org_id;
  GET DIAGNOSTICS v_expense_count = ROW_COUNT;

  DELETE FROM public.account_movements AS movement
  WHERE movement.source_type = 'z_report'
    AND movement.source_id = p_batch_id::text
    AND movement.organization_id = v_org_id;
  GET DIAGNOSTICS v_account_movement_count = ROW_COUNT;

  INSERT INTO public.activity_logs (
    module,
    action_type,
    description,
    details,
    user_id,
    organization_id
  ) VALUES (
    'Z-Raporu',
    'SILME',
    'Z-Raporu silindi; stok ve finansal etkiler geri alındı.',
    pg_catalog.jsonb_build_object(
      'batch_id', p_batch_id,
      'stock_movements_deleted', v_stock_count,
      'sales_deleted', v_sales_count,
      'expenses_deleted', v_expense_count,
      'account_movements_deleted', v_account_movement_count,
      'stock_quantity_restored', v_stock_quantity_restored,
      'account_balance_reversed', v_account_balance_reversed
    ),
    v_user_id::text,
    v_org_id
  );

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_z_report_atomic(
  uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_z_report_atomic(
  uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_supplier_transaction(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_z_report_transaction(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_supplier_transaction(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_z_report_transaction(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

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

  WITH deleted_movements AS (
    DELETE FROM public.account_movements AS movement
    WHERE movement.source_type = 'supplier_payment'
      AND movement.source_id = p_transaction_id::text
      AND movement.organization_id = v_org_id
    RETURNING movement.account_id, movement.amount, movement.movement_type
  ),
  account_reversals AS (
    SELECT
      deleted.account_id,
      count(*)::integer AS movement_count,
      coalesce(
        sum(deleted.amount) FILTER (WHERE deleted.movement_type = 'cikis'),
        0
      ) AS balance_reversed
    FROM deleted_movements AS deleted
    GROUP BY deleted.account_id
  ),
  updated_accounts AS (
    UPDATE public.accounts AS account
    SET balance = coalesce(account.balance, 0) + reversal.balance_reversed
    FROM account_reversals AS reversal
    WHERE account.id = reversal.account_id
      AND account.organization_id = v_org_id
    RETURNING reversal.balance_reversed
  )
  SELECT
    coalesce(
      (SELECT sum(reversal.movement_count) FROM account_reversals AS reversal),
      0
    )::integer,
    coalesce(
      (SELECT sum(updated.balance_reversed) FROM updated_accounts AS updated),
      0
    )
  INTO v_account_movement_count, v_account_balance_reversed;

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

  PERFORM 1
  FROM public.stock_movements AS movement
  WHERE movement.batch_id = p_batch_id
    AND movement.organization_id = v_org_id
  FOR UPDATE;

  PERFORM 1
  FROM public.sales AS sale
  WHERE sale.batch_id = p_batch_id
    AND sale.organization_id = v_org_id
  FOR UPDATE;

  PERFORM 1
  FROM public.expenses AS expense
  WHERE expense.batch_id = p_batch_id
    AND expense.organization_id = v_org_id
  FOR UPDATE;

  PERFORM 1
  FROM public.account_movements AS movement
  WHERE movement.source_type = 'z_report'
    AND movement.source_id = p_batch_id::text
    AND movement.organization_id = v_org_id
  FOR UPDATE;

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

  WITH material_totals AS (
    SELECT
      movement.material_id,
      sum(movement.quantity) AS quantity_restored
    FROM public.stock_movements AS movement
    WHERE movement.batch_id = p_batch_id
      AND movement.organization_id = v_org_id
    GROUP BY movement.material_id
  ),
  updated_materials AS (
    UPDATE public.materials AS material
    SET stock_quantity = coalesce(material.stock_quantity, 0) + total.quantity_restored
    FROM material_totals AS total
    WHERE material.id = total.material_id
      AND material.organization_id = v_org_id
    RETURNING total.quantity_restored
  )
  SELECT coalesce(sum(updated.quantity_restored), 0)
  INTO v_stock_quantity_restored
  FROM updated_materials AS updated;

  WITH account_deltas AS (
    SELECT
      movement.account_id,
      sum(
        CASE
          WHEN movement.movement_type = 'giris' THEN -movement.amount
          ELSE movement.amount
        END
      ) AS balance_delta
    FROM public.account_movements AS movement
    WHERE movement.source_type = 'z_report'
      AND movement.source_id = p_batch_id::text
      AND movement.organization_id = v_org_id
    GROUP BY movement.account_id
  ),
  updated_accounts AS (
    UPDATE public.accounts AS account
    SET balance = coalesce(account.balance, 0) + delta.balance_delta
    FROM account_deltas AS delta
    WHERE account.id = delta.account_id
      AND account.organization_id = v_org_id
    RETURNING pg_catalog.abs(delta.balance_delta) AS balance_reversed
  )
  SELECT coalesce(sum(updated.balance_reversed), 0)
  INTO v_account_balance_reversed
  FROM updated_accounts AS updated;

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

REVOKE ALL ON FUNCTION public.delete_supplier_transaction(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_z_report_transaction(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_supplier_transaction(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_z_report_transaction(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

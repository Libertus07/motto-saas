-- Prevent caller-controlled schemas from shadowing public database functions.
ALTER FUNCTION public.add_supplier_payment_transaction(uuid, text, numeric, text, uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_stock_count(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.buy_investment_transaction(text, text, numeric, numeric, uuid, text, date, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_ai_quota() SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_investment_transaction(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dashboard_stats(integer, numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.manage_expense(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_cash_reconciliation(json) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_investment_rent(uuid, uuid, numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_receipt_upload(json) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_z_report(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.record_stock_movement(uuid, text, numeric, numeric, text) SET search_path = public, pg_temp;

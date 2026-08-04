-- Avoid overloading the legacy process_z_report(jsonb) RPC and remove anonymous execution.

ALTER FUNCTION public.process_z_report(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
RENAME TO process_z_report_atomic;

REVOKE ALL ON FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_z_report_atomic(uuid, date, jsonb, jsonb, jsonb, text, boolean, jsonb)
TO authenticated;

NOTIFY pgrst, 'reload schema';

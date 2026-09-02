DO $migration_guard$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(required.signature ORDER BY required.signature)
  INTO v_missing
  FROM (VALUES
    ('public.current_organization_id()'),
    ('public.get_user_organizations()'),
    ('public.get_user_org_role(uuid)'),
    ('public.is_organization_member(uuid,uuid)'),
    ('public.has_organization_role(uuid,text[],uuid)')
  ) AS required(signature)
  WHERE to_regprocedure(required.signature) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'SECURITY DEFINER helper predecessors are incomplete.',
      DETAIL = array_to_string(v_missing, ', ');
  END IF;
END
$migration_guard$;

CREATE OR REPLACE FUNCTION private.active_organization_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT membership.organization_id
  FROM public.organization_members AS membership
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.status = 'active';
$function$;

CREATE OR REPLACE FUNCTION private.is_current_user_organization_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION private.current_user_organization_role(p_organization_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT membership.role
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_organization_id
    AND membership.user_id = (SELECT auth.uid())
    AND membership.status = 'active'
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION private.current_user_has_organization_role(p_organization_id uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members AS membership
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = (SELECT auth.uid())
        AND membership.status = 'active'
        AND membership.role = ANY (coalesce(p_roles, ARRAY[]::text[]))
    );
$function$;

CREATE OR REPLACE FUNCTION private.current_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT coalesce(
    (
      SELECT profile.active_organization_id
      FROM public.profiles AS profile
      JOIN public.organization_members AS membership
        ON membership.organization_id = profile.active_organization_id
       AND membership.user_id = profile.id
       AND membership.status = 'active'
      WHERE profile.id = (SELECT auth.uid())
    ),
    (
      SELECT membership.organization_id
      FROM public.organization_members AS membership
      WHERE membership.user_id = (SELECT auth.uid())
        AND membership.status = 'active'
      ORDER BY
        CASE membership.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        membership.created_at,
        membership.organization_id
      LIMIT 1
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$ SELECT private.current_organization_id(); $function$;

CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$ SELECT * FROM private.active_organization_ids(); $function$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(target_org_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$ SELECT private.current_user_organization_role(target_org_id); $function$;

CREATE OR REPLACE FUNCTION public.is_organization_member(p_organization_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())
    AND private.is_current_user_organization_member(p_organization_id);
$function$;

CREATE OR REPLACE FUNCTION public.has_organization_role(p_organization_id uuid, p_roles text[], p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_user_id IS NOT DISTINCT FROM (SELECT auth.uid())
    AND private.current_user_has_organization_role(p_organization_id, p_roles);
$function$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.active_organization_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_organization_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_current_user_organization_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_user_has_organization_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.active_organization_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_organization_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_current_user_organization_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_user_has_organization_role(uuid, text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_organizations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_org_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_organizations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[], uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.get_user_organizations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_users_info(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_users_info(uuid[]) TO service_role;
NOTIFY pgrst, 'reload schema';

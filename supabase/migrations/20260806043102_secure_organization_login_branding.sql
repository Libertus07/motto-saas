-- Organization-specific login branding is intentionally public: the login page
-- only receives the display name and logo URL for a caller-supplied public slug.
CREATE OR REPLACE FUNCTION public.get_public_login_branding(p_organization_slug text)
RETURNS TABLE (business_name text, business_logo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        COALESCE(
            NULLIF(BTRIM(name_setting.value #>> '{}'), ''),
            NULLIF(BTRIM(organization.name), ''),
            'Motto SaaS'
        ) AS business_name,
        NULLIF(BTRIM(logo_setting.value #>> '{}'), '') AS business_logo
    FROM public.organizations AS organization
    LEFT JOIN public.settings AS name_setting
      ON name_setting.organization_id = organization.id
     AND name_setting.key = 'business_name'
    LEFT JOIN public.settings AS logo_setting
      ON logo_setting.organization_id = organization.id
     AND logo_setting.key = 'business_logo'
    WHERE organization.slug = p_organization_slug
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_login_branding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_login_branding(text) TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'organization-branding',
    'organization-branding',
    true,
    2097152,
    ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Organization branding owners can select" ON storage.objects;
DROP POLICY IF EXISTS "Organization branding owners can insert" ON storage.objects;
DROP POLICY IF EXISTS "Organization branding owners can update" ON storage.objects;
DROP POLICY IF EXISTS "Organization branding owners can delete" ON storage.objects;

CREATE POLICY "Organization branding owners can select"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'organization-branding'
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id::text = (storage.foldername(name))[1]
          AND member.user_id = (SELECT auth.uid())
          AND member.status = 'active'
          AND member.role IN ('owner', 'admin')
    )
);

CREATE POLICY "Organization branding owners can insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'organization-branding'
    AND storage.extension(name) IN ('png', 'jpg', 'webp')
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id::text = (storage.foldername(name))[1]
          AND member.user_id = (SELECT auth.uid())
          AND member.status = 'active'
          AND member.role IN ('owner', 'admin')
    )
);

CREATE POLICY "Organization branding owners can update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'organization-branding'
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id::text = (storage.foldername(name))[1]
          AND member.user_id = (SELECT auth.uid())
          AND member.status = 'active'
          AND member.role IN ('owner', 'admin')
    )
)
WITH CHECK (
    bucket_id = 'organization-branding'
    AND storage.extension(name) IN ('png', 'jpg', 'webp')
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id::text = (storage.foldername(name))[1]
          AND member.user_id = (SELECT auth.uid())
          AND member.status = 'active'
          AND member.role IN ('owner', 'admin')
    )
);

CREATE POLICY "Organization branding owners can delete"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'organization-branding'
    AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id::text = (storage.foldername(name))[1]
          AND member.user_id = (SELECT auth.uid())
          AND member.status = 'active'
          AND member.role IN ('owner', 'admin')
    )
);

-- Keep general settings editable for tenant members, but protect the public
-- login logo from staff-level writes made directly through the REST API.
DROP POLICY IF EXISTS "Tenant Isolation Select Policy" ON public.settings;
DROP POLICY IF EXISTS "Tenant Isolation Insert Policy" ON public.settings;
DROP POLICY IF EXISTS "Tenant Isolation Update Policy" ON public.settings;
DROP POLICY IF EXISTS "Tenant Isolation Delete Policy" ON public.settings;
DROP POLICY IF EXISTS "Tenant Isolation Policy" ON public.settings;

CREATE POLICY "Tenant members can read settings"
ON public.settings FOR SELECT TO authenticated
USING (organization_id IN (SELECT public.get_user_organizations()));

CREATE POLICY "Tenant members can insert settings"
ON public.settings FOR INSERT TO authenticated
WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (key <> 'business_logo' OR public.get_user_org_role(organization_id) IN ('owner', 'admin'))
);

CREATE POLICY "Tenant members can update settings"
ON public.settings FOR UPDATE TO authenticated
USING (organization_id IN (SELECT public.get_user_organizations()))
WITH CHECK (
    organization_id IN (SELECT public.get_user_organizations())
    AND (key <> 'business_logo' OR public.get_user_org_role(organization_id) IN ('owner', 'admin'))
);

CREATE POLICY "Tenant members can delete settings"
ON public.settings FOR DELETE TO authenticated
USING (
    organization_id IN (SELECT public.get_user_organizations())
    AND (key <> 'business_logo' OR public.get_user_org_role(organization_id) IN ('owner', 'admin'))
);

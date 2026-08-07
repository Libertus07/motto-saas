-- Keep the database-side tenant context synchronized with the organization
-- selected in the application. The caller-provided organization id is never
-- trusted without checking active membership for auth.uid().
CREATE OR REPLACE FUNCTION public.set_active_organization(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_previous_organization_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '28000',
            MESSAGE = 'Aktif organizasyon seçmek için oturum açmalısınız.';
    END IF;

    IF p_organization_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22004',
            MESSAGE = 'Geçerli bir organizasyon seçmelisiniz.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        WHERE member.organization_id = p_organization_id
          AND member.user_id = v_user_id
          AND member.status = 'active'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Bu organizasyonu seçme yetkiniz yok.';
    END IF;

    SELECT profile.active_organization_id
    INTO v_previous_organization_id
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id;

    IF v_previous_organization_id IS NOT DISTINCT FROM p_organization_id THEN
        RETURN p_organization_id;
    END IF;

    INSERT INTO public.profiles (id, active_organization_id, updated_at)
    VALUES (v_user_id, p_organization_id, timezone('utc', now()))
    ON CONFLICT (id)
    DO UPDATE SET
        active_organization_id = EXCLUDED.active_organization_id,
        updated_at = EXCLUDED.updated_at;

    INSERT INTO public.activity_logs (
        module,
        action_type,
        description,
        details,
        user_id,
        organization_id
    )
    VALUES (
        'Organizasyon',
        'GUNCELLEME',
        'Aktif şube veya organizasyon değiştirildi.',
        jsonb_build_object(
            'previousOrganizationId', v_previous_organization_id,
            'activeOrganizationId', p_organization_id
        ),
        v_user_id::text,
        p_organization_id
    );

    RETURN p_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_organization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_active_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_active_organization(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_organization(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

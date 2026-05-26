-- =====================================================================
-- HRM ERP - Phase 1 Seed: Default Super Admin user
-- =====================================================================
-- Creates: admin@hrm.com / admin123 (force_password_change = true)
-- Assigns: Super Admin role (all 90 permissions)
-- =====================================================================

DO $$
DECLARE
    admin_id          UUID := '00000000-0000-0000-0000-00000000ffff';
    company_uuid      UUID := '00000000-0000-0000-0000-000000000001';
    super_admin_role  UUID := '00000000-0000-0000-0000-00000000aaa1';
BEGIN
    -- Remove previous (idempotent re-run)
    DELETE FROM auth.identities WHERE user_id = admin_id;
    DELETE FROM auth.users WHERE id = admin_id;

    -- Create Supabase Auth user
    INSERT INTO auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        admin_id,
        'authenticated',
        'authenticated',
        'admin@hrm.com',
        crypt('admin123', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"System Administrator","force_password_change":true}'::jsonb,
        NOW(), NOW(),
        '', '', '', ''
    );

    -- Required auth.identities row
    INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(),
        admin_id,
        jsonb_build_object('sub', admin_id::text, 'email', 'admin@hrm.com', 'email_verified', true),
        'email',
        admin_id::text,
        NOW(), NOW(), NOW()
    );

    -- Mirror in public.users
    INSERT INTO public.users (id, company_id, email, full_name, status, force_password_change)
    VALUES (admin_id, company_uuid, 'admin@hrm.com', 'System Administrator', 'Active', true)
    ON CONFLICT (id) DO UPDATE
        SET force_password_change = EXCLUDED.force_password_change,
            status                = EXCLUDED.status;

    -- Assign Super Admin role
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (admin_id, super_admin_role)
    ON CONFLICT DO NOTHING;
END $$;

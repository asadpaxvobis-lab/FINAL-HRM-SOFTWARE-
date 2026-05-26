-- =====================================================================
-- HRM ERP - Phase 1: Foundation (Auth, RBAC, Users, Audit, Master Org)
-- =====================================================================
-- This migration:
--   1. Drops all legacy public.* tables from previous attempt (clean slate)
--   2. Creates extensions and helpers
--   3. Creates Phase 1 schema: tenants, branches, depts, designations,
--      employees skeleton, users, roles, permissions, RBAC, 2FA,
--      audit_logs, app_settings
--   4. Enables RLS on every table with explicit policies
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Drop legacy tables (previous attempt)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS
    public.employee_emergency_contacts,
    public.audit_logs,
    public.leave_requests,
    public.shifts,
    public.employee_versions,
    public.users,
    public.designations,
    public.tax_rules,
    public.tenants,
    public.locations,
    public.roles,
    public.employee_bank_accounts,
    public.cost_centers,
    public.leave_types,
    public.user_roles,
    public.attendance_logs,
    public.companies,
    public.holiday_calendars,
    public.leave_approval_steps,
    public.statutory_rules,
    public.holidays,
    public.employee_documents,
    public.salary_components,
    public.payroll_items,
    public.shift_assignments,
    public.department_managers,
    public.salary_structure_lines,
    public.role_permissions,
    public.permissions,
    public.leave_balances,
    public.leave_policies,
    public.employees,
    public.employee_contracts,
    public.payroll_runs,
    public.attendance_daily_summaries,
    public.salary_structures,
    public.branches,
    public.refresh_tokens,
    public.employee_salary_assignments,
    public.departments
CASCADE;

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------
-- 2. Helper: updated_at trigger
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Companies (single company in this deployment; structure ready for multi-tenant later)
-- ---------------------------------------------------------------------
CREATE TABLE public.companies (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    legal_name   TEXT,
    ntn          TEXT,
    address      TEXT,
    phone        TEXT,
    email        CITEXT,
    logo_url     TEXT,
    currency     TEXT NOT NULL DEFAULT 'PKR',
    timezone     TEXT NOT NULL DEFAULT 'Asia/Karachi',
    fiscal_year_start_month INT NOT NULL DEFAULT 7 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Branches (with branch-specific calendar config)
-- ---------------------------------------------------------------------
CREATE TABLE public.branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    address         TEXT,
    city            TEXT,
    province        TEXT, -- Punjab, Sindh, KPK, Balochistan, ICT, AJK, GB
    phone           TEXT,
    geo_latitude    NUMERIC(10, 7),
    geo_longitude   NUMERIC(10, 7),
    geofence_radius_m INT DEFAULT 200,
    weekly_off_days INT[] NOT NULL DEFAULT ARRAY[0]::INT[],  -- 0=Sun, 1=Mon, ..., 6=Sat
    default_shift_start TIME,
    default_shift_end   TIME,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_branches_company ON public.branches(company_id);
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON public.branches
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. Departments
-- ---------------------------------------------------------------------
CREATE TABLE public.departments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    parent_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_departments_company ON public.departments(company_id);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Designations
-- ---------------------------------------------------------------------
CREATE TABLE public.designations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    title       TEXT NOT NULL,
    grade       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);
CREATE INDEX idx_designations_company ON public.designations(company_id);
CREATE TRIGGER trg_designations_updated_at BEFORE UPDATE ON public.designations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. Employees (skeleton; full master data in Phase 2)
-- ---------------------------------------------------------------------
CREATE TABLE public.employees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    branch_id           UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    department_id       UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    designation_id      UUID REFERENCES public.designations(id) ON DELETE SET NULL,
    reports_to_id       UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    employee_code       TEXT NOT NULL,
    first_name          TEXT NOT NULL,
    last_name           TEXT,
    full_name           TEXT GENERATED ALWAYS AS (COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) STORED,
    email               CITEXT,
    phone               TEXT,
    cnic                TEXT,
    gender              TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    date_of_birth       DATE,
    date_of_joining     DATE,
    employment_status   TEXT NOT NULL DEFAULT 'Active' CHECK (employment_status IN ('Active', 'Probation', 'Suspended', 'Resigned', 'Terminated')),
    photo_url           TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, employee_code)
);
CREATE INDEX idx_employees_company ON public.employees(company_id);
CREATE INDEX idx_employees_branch ON public.employees(branch_id);
CREATE INDEX idx_employees_department ON public.employees(department_id);
CREATE INDEX idx_employees_reports_to ON public.employees(reports_to_id);
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 8. Users (linked to Supabase auth.users)
-- ---------------------------------------------------------------------
CREATE TABLE public.users (
    id                       UUID PRIMARY KEY,   -- = auth.users.id
    company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id              UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    email                    CITEXT NOT NULL UNIQUE,
    full_name                TEXT,
    phone                    TEXT,
    status                   TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Disabled', 'Pending')),
    force_password_change    BOOLEAN NOT NULL DEFAULT true,
    last_login_at            TIMESTAMPTZ,
    last_login_ip            INET,
    failed_login_count       INT NOT NULL DEFAULT 0,
    locked_until             TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by               UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_users_company ON public.users(company_id);
CREATE INDEX idx_users_employee ON public.users(employee_id);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. Permissions catalog
-- ---------------------------------------------------------------------
CREATE TABLE public.permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module      TEXT NOT NULL,                  -- e.g. 'employee', 'payroll', 'attendance'
    action      TEXT NOT NULL,                  -- e.g. 'view', 'create', 'update', 'delete', 'approve', 'export', 'print'
    code        TEXT GENERATED ALWAYS AS (module || '.' || action) STORED UNIQUE,
    description TEXT,
    is_system   BOOLEAN NOT NULL DEFAULT false, -- auto-discovered from API endpoints
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_permissions_module ON public.permissions(module);

-- ---------------------------------------------------------------------
-- 10. Roles
-- ---------------------------------------------------------------------
CREATE TABLE public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    is_built_in BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);
CREATE INDEX idx_roles_company ON public.roles(company_id);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 11. Role-Permissions M:N
-- ---------------------------------------------------------------------
CREATE TABLE public.role_permissions (
    role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 12. User-Roles M:N
-- ---------------------------------------------------------------------
CREATE TABLE public.user_roles (
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------------------
-- 13. Per-user permission overrides (GRANT or DENY; DENY wins)
-- ---------------------------------------------------------------------
CREATE TABLE public.user_permission_overrides (
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    effect        TEXT NOT NULL CHECK (effect IN ('GRANT', 'DENY')),
    reason        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, permission_id)
);

-- ---------------------------------------------------------------------
-- 14. 2FA settings per user
-- ---------------------------------------------------------------------
CREATE TABLE public.user_2fa (
    user_id     UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    enabled     BOOLEAN NOT NULL DEFAULT false,
    secret_enc  TEXT,                 -- encrypted TOTP secret (Supabase Auth MFA handles this, mirror locally for UI)
    backup_codes TEXT[],
    enabled_at  TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 15. Allowed IP ranges (admin-only roles can only log in from these)
-- ---------------------------------------------------------------------
CREATE TABLE public.allowed_ip_ranges (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    cidr        CIDR NOT NULL,
    description TEXT,
    applies_to_roles UUID[], -- empty array = applies to all admin roles
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ip_ranges_company ON public.allowed_ip_ranges(company_id);

-- ---------------------------------------------------------------------
-- 16. Login attempts log
-- ---------------------------------------------------------------------
CREATE TABLE public.login_attempts (
    id         BIGSERIAL PRIMARY KEY,
    email      CITEXT,
    user_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    success    BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    failure_reason TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_attempts_email_time ON public.login_attempts(email, attempted_at DESC);

-- ---------------------------------------------------------------------
-- 17. User invitations
-- ---------------------------------------------------------------------
CREATE TABLE public.user_invitations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      CITEXT NOT NULL,
    invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    role_ids   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    token      TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invitations_email ON public.user_invitations(email);

-- ---------------------------------------------------------------------
-- 18. Audit logs (every mutation)
-- ---------------------------------------------------------------------
CREATE TABLE public.audit_logs (
    id            BIGSERIAL PRIMARY KEY,
    company_id    UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    user_id       UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_email    CITEXT,
    action        TEXT NOT NULL,           -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', etc.
    entity_type   TEXT NOT NULL,           -- 'employee', 'role', 'payroll_run', ...
    entity_id     TEXT,
    before_value  JSONB,
    after_value   JSONB,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_company_time ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 19. App settings (single-row keyed JSON per company)
-- ---------------------------------------------------------------------
CREATE TABLE public.app_settings (
    company_id  UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{
        "apply_income_tax": false,
        "standard_monthly_hours": 208,
        "standard_fortnightly_hours": 96,
        "standard_weekly_hours": 48,
        "payroll_cutoff_day": 25,
        "password_min_length": 6,
        "session_timeout_minutes": 60,
        "lockout_threshold": 5,
        "lockout_minutes": 15,
        "default_currency": "PKR",
        "enable_2fa_for_admin": true,
        "enable_ip_restriction": false
    }'::JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- 20. RLS - enable on all tables (policies defined after seeding for clarity)
-- =====================================================================
ALTER TABLE public.companies                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_2fa                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_ip_ranges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings             ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 21. Helper functions for RLS (current user's company + permission check)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id FROM public.users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_permission(perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    has_perm BOOLEAN;
    has_deny BOOLEAN;
    perm_id  UUID;
BEGIN
    SELECT id INTO perm_id FROM public.permissions WHERE code = perm_code;
    IF perm_id IS NULL THEN RETURN FALSE; END IF;

    -- DENY override wins
    SELECT EXISTS (
        SELECT 1 FROM public.user_permission_overrides
        WHERE user_id = auth.uid() AND permission_id = perm_id AND effect = 'DENY'
    ) INTO has_deny;
    IF has_deny THEN RETURN FALSE; END IF;

    -- GRANT override
    SELECT EXISTS (
        SELECT 1 FROM public.user_permission_overrides
        WHERE user_id = auth.uid() AND permission_id = perm_id AND effect = 'GRANT'
    ) INTO has_perm;
    IF has_perm THEN RETURN TRUE; END IF;

    -- Role-based
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = auth.uid() AND rp.permission_id = perm_id
    ) INTO has_perm;
    RETURN COALESCE(has_perm, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_company_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------
-- 22. RLS Policies
-- ---------------------------------------------------------------------

-- Companies: users can see their own company
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
    USING (id = public.current_user_company_id());
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
    USING (id = public.current_user_company_id() AND public.user_has_permission('company.update'));

-- Branches
CREATE POLICY branches_select ON public.branches FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY branches_insert ON public.branches FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('branch.create'));
CREATE POLICY branches_update ON public.branches FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('branch.update'));
CREATE POLICY branches_delete ON public.branches FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('branch.delete'));

-- Departments
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY departments_insert ON public.departments FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('department.create'));
CREATE POLICY departments_update ON public.departments FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('department.update'));
CREATE POLICY departments_delete ON public.departments FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('department.delete'));

-- Designations
CREATE POLICY designations_select ON public.designations FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY designations_insert ON public.designations FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('designation.create'));
CREATE POLICY designations_update ON public.designations FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('designation.update'));
CREATE POLICY designations_delete ON public.designations FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('designation.delete'));

-- Employees
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('employee.create'));
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('employee.update'));
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('employee.delete'));

-- Users: every authenticated user can see users of their own company; mutations gated by permission
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY users_insert ON public.users FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('user.create'));
CREATE POLICY users_update ON public.users FOR UPDATE TO authenticated
    USING (
        company_id = public.current_user_company_id()
        AND (public.user_has_permission('user.update') OR id = auth.uid())  -- can update self
    );
CREATE POLICY users_delete ON public.users FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('user.delete'));

-- Permissions (everyone can READ the catalog; only admin can modify - typically auto-managed by app)
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_modify ON public.permissions FOR ALL TO authenticated
    USING (public.user_has_permission('role.update'))
    WITH CHECK (public.user_has_permission('role.update'));

-- Roles
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY roles_insert ON public.roles FOR INSERT TO authenticated
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('role.create'));
CREATE POLICY roles_update ON public.roles FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('role.update'));
CREATE POLICY roles_delete ON public.roles FOR DELETE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('role.delete') AND is_built_in = false);

-- Role-permissions
CREATE POLICY role_perms_select ON public.role_permissions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.company_id = public.current_user_company_id()));
CREATE POLICY role_perms_modify ON public.role_permissions FOR ALL TO authenticated
    USING (
        public.user_has_permission('role.update')
        AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.company_id = public.current_user_company_id())
    )
    WITH CHECK (
        public.user_has_permission('role.update')
        AND EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_id AND r.company_id = public.current_user_company_id())
    );

-- User-roles
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id()));
CREATE POLICY user_roles_modify ON public.user_roles FOR ALL TO authenticated
    USING (
        public.user_has_permission('user.update')
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id())
    )
    WITH CHECK (
        public.user_has_permission('user.update')
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id())
    );

-- User permission overrides
CREATE POLICY user_overrides_select ON public.user_permission_overrides FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id()));
CREATE POLICY user_overrides_modify ON public.user_permission_overrides FOR ALL TO authenticated
    USING (
        public.user_has_permission('user.update')
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id())
    )
    WITH CHECK (
        public.user_has_permission('user.update')
        AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = user_id AND u.company_id = public.current_user_company_id())
    );

-- 2FA (self + admin)
CREATE POLICY user_2fa_self ON public.user_2fa FOR ALL TO authenticated
    USING (user_id = auth.uid() OR public.user_has_permission('user.update'))
    WITH CHECK (user_id = auth.uid() OR public.user_has_permission('user.update'));

-- Allowed IP ranges
CREATE POLICY ip_ranges_select ON public.allowed_ip_ranges FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY ip_ranges_modify ON public.allowed_ip_ranges FOR ALL TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('settings.update'))
    WITH CHECK (company_id = public.current_user_company_id() AND public.user_has_permission('settings.update'));

-- Login attempts (admins only)
CREATE POLICY login_attempts_select ON public.login_attempts FOR SELECT TO authenticated
    USING (public.user_has_permission('audit.view'));

-- User invitations (admins only)
CREATE POLICY invitations_modify ON public.user_invitations FOR ALL TO authenticated
    USING (public.user_has_permission('user.create'))
    WITH CHECK (public.user_has_permission('user.create'));

-- Audit logs (read-only for those with audit.view; system writes via service role)
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('audit.view'));

-- App settings
CREATE POLICY settings_select ON public.app_settings FOR SELECT TO authenticated
    USING (company_id = public.current_user_company_id());
CREATE POLICY settings_update ON public.app_settings FOR UPDATE TO authenticated
    USING (company_id = public.current_user_company_id() AND public.user_has_permission('settings.update'));

-- =====================================================================
-- END Migration 0001 - Auth + RBAC + Org skeleton with full RLS
-- =====================================================================

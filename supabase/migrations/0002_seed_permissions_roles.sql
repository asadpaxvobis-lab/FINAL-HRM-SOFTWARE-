-- =====================================================================
-- HRM ERP - Phase 1 Seed: Permissions catalog + built-in roles + company
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Default Company (single-tenant deployment)
-- ---------------------------------------------------------------------
INSERT INTO public.companies (id, name, legal_name, currency, timezone, fiscal_year_start_month)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'My Company',
    'My Company (Pvt) Ltd',
    'PKR',
    'Asia/Karachi',
    7  -- Fiscal year starts July (Pakistan standard)
)
ON CONFLICT (id) DO NOTHING;

-- App settings row
INSERT INTO public.app_settings (company_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (company_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Permissions catalog (Phase 1 + placeholders for later phases)
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (module, action, description, is_system) VALUES
    -- Company
    ('company',     'view',    'View company info', true),
    ('company',     'update',  'Edit company info', true),
    -- Branches
    ('branch',      'view',    'View branches', true),
    ('branch',      'create',  'Create branch', true),
    ('branch',      'update',  'Edit branch', true),
    ('branch',      'delete',  'Delete branch', true),
    -- Departments
    ('department',  'view',    'View departments', true),
    ('department',  'create',  'Create department', true),
    ('department',  'update',  'Edit department', true),
    ('department',  'delete',  'Delete department', true),
    -- Designations
    ('designation', 'view',    'View designations', true),
    ('designation', 'create',  'Create designation', true),
    ('designation', 'update',  'Edit designation', true),
    ('designation', 'delete',  'Delete designation', true),
    -- Employees
    ('employee',    'view',    'View employees', true),
    ('employee',    'create',  'Create employee', true),
    ('employee',    'update',  'Edit employee', true),
    ('employee',    'delete',  'Delete (deactivate) employee', true),
    ('employee',    'export',  'Export employees to Excel', true),
    ('employee',    'import',  'Bulk import employees', true),
    -- Users
    ('user',        'view',    'View users', true),
    ('user',        'create',  'Create user (admin)', true),
    ('user',        'update',  'Edit user / assign roles', true),
    ('user',        'delete',  'Disable user', true),
    ('user',        'reset_password', 'Reset another user password', true),
    -- Roles & permissions
    ('role',        'view',    'View roles & permissions', true),
    ('role',        'create',  'Create custom role', true),
    ('role',        'update',  'Edit role permissions or override per-user', true),
    ('role',        'delete',  'Delete custom role', true),
    -- Settings
    ('settings',    'view',    'View app settings', true),
    ('settings',    'update',  'Update app settings', true),
    -- Audit
    ('audit',       'view',    'View audit log', true),
    ('audit',       'export',  'Export audit log', true),
    -- Holidays (Phase 2)
    ('holiday',     'view',    'View holidays', true),
    ('holiday',     'create',  'Add holiday', true),
    ('holiday',     'update',  'Edit holiday', true),
    ('holiday',     'delete',  'Delete holiday', true),
    -- Shifts (Phase 2)
    ('shift',       'view',    'View shifts', true),
    ('shift',       'create',  'Create shift', true),
    ('shift',       'update',  'Edit shift', true),
    ('shift',       'delete',  'Delete shift', true),
    ('shift',       'assign',  'Assign roster', true),
    -- Attendance (Phase 3)
    ('attendance',  'view',    'View attendance', true),
    ('attendance',  'create',  'Manual punch', true),
    ('attendance',  'update',  'Correct attendance', true),
    ('attendance',  'approve', 'Approve correction', true),
    ('attendance',  'export',  'Export attendance', true),
    -- Leave (Phase 4)
    ('leave',       'view',    'View leave', true),
    ('leave',       'apply',   'Apply leave', true),
    ('leave',       'approve', 'Approve leave', true),
    ('leave',       'config',  'Configure leave types', true),
    -- Overtime (Phase 4)
    ('overtime',    'view',    'View overtime', true),
    ('overtime',    'apply',   'Request overtime', true),
    ('overtime',    'approve', 'Approve overtime', true),
    ('overtime',    'config',  'Configure overtime policy', true),
    -- Payroll (Phase 5)
    ('payroll',     'view',    'View payroll', true),
    ('payroll',     'run',     'Run payroll', true),
    ('payroll',     'approve', 'Approve payroll', true),
    ('payroll',     'release', 'Release payslips', true),
    ('payroll',     'export',  'Export bank file', true),
    ('payroll',     'config',  'Configure payroll components / tax slabs / rates', true),
    ('salary',      'view',    'View salary', true),
    ('salary',      'update',  'Edit employee salary', true),
    ('salary',      'bulk_update', 'Bulk salary increment wizard', true),
    -- Loans (Phase 6)
    ('loan',        'view',    'View loans', true),
    ('loan',        'create',  'Issue loan', true),
    ('loan',        'update',  'Edit loan', true),
    ('loan',        'approve', 'Approve loan', true),
    -- Expense claims (Phase 6)
    ('expense',     'view',    'View expense claims', true),
    ('expense',     'apply',   'Submit expense', true),
    ('expense',     'approve', 'Approve expense', true),
    ('expense',     'config',  'Configure expense categories', true),
    -- Letters (Phase 8)
    ('letter',      'view',    'View letters', true),
    ('letter',      'create',  'Generate letter', true),
    ('letter',      'template', 'Manage letter templates', true),
    -- Announcements (Phase 8)
    ('announcement','view',    'View announcements', true),
    ('announcement','create',  'Post announcement', true),
    ('announcement','update',  'Edit announcement', true),
    ('announcement','delete',  'Delete announcement', true),
    -- Resignation (Phase 8)
    ('resignation', 'view',    'View resignations', true),
    ('resignation', 'apply',   'Submit resignation', true),
    ('resignation', 'approve', 'Approve resignation', true),
    ('resignation', 'process', 'Process final settlement', true),
    -- Recruitment (Phase 9)
    ('recruitment', 'view',    'View recruitment pipeline', true),
    ('recruitment', 'manage',  'Manage job postings & candidates', true),
    ('recruitment', 'interview','Schedule / record interview', true),
    ('recruitment', 'offer',   'Generate offer letter', true),
    ('recruitment', 'hire',    'Convert candidate to employee', true),
    -- Reports (Phase 10)
    ('report',      'view',    'View reports', true),
    ('report',      'export',  'Export reports', true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Built-in roles
-- ---------------------------------------------------------------------
INSERT INTO public.roles (id, company_id, name, description, is_built_in) VALUES
    ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-000000000001', 'Super Admin',        'Full access to everything (system administrator)', true),
    ('00000000-0000-0000-0000-00000000aaa2', '00000000-0000-0000-0000-000000000001', 'HR Admin',           'Full HR + Payroll management', true),
    ('00000000-0000-0000-0000-00000000aaa3', '00000000-0000-0000-0000-000000000001', 'HR Officer',         'HR operations (no payroll approve / settings)', true),
    ('00000000-0000-0000-0000-00000000aaa4', '00000000-0000-0000-0000-000000000001', 'Payroll Officer',    'Payroll operations + reports', true),
    ('00000000-0000-0000-0000-00000000aaa5', '00000000-0000-0000-0000-000000000001', 'Department Manager', 'View own department, approve leave/OT/expense', true),
    ('00000000-0000-0000-0000-00000000aaa6', '00000000-0000-0000-0000-000000000001', 'Branch Manager',     'View own branch, approve actions for branch', true),
    ('00000000-0000-0000-0000-00000000aaa7', '00000000-0000-0000-0000-000000000001', 'Employee',           'Self-service only', true)
ON CONFLICT (company_id, name) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Built-in role -> permissions
-- ---------------------------------------------------------------------

-- Super Admin: every permission
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa1', id FROM public.permissions
ON CONFLICT DO NOTHING;

-- HR Admin: everything except role manage + settings update (still can view)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa2', p.id
FROM public.permissions p
WHERE p.code NOT IN ('role.create','role.update','role.delete','settings.update','user.delete')
ON CONFLICT DO NOTHING;

-- HR Officer: HR ops, no payroll approve / no settings / no role mgmt
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa3', p.id
FROM public.permissions p
WHERE p.module IN ('employee','department','designation','holiday','shift','leave','overtime','attendance','letter','announcement','resignation','recruitment','report','user','expense','loan')
  AND p.action IN ('view','create','update','apply','export','import','assign','interview','offer','template')
ON CONFLICT DO NOTHING;

-- Payroll Officer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa4', p.id
FROM public.permissions p
WHERE p.module IN ('payroll','salary','report','employee','attendance','leave','overtime','expense','loan')
  AND p.action IN ('view','run','export','update','bulk_update','approve')
ON CONFLICT DO NOTHING;

-- Department Manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa5', p.id
FROM public.permissions p
WHERE p.code IN (
    'employee.view','attendance.view','leave.view','leave.approve','overtime.view','overtime.approve',
    'expense.view','expense.approve','resignation.view','resignation.approve',
    'announcement.view','letter.view','report.view'
)
ON CONFLICT DO NOTHING;

-- Branch Manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa6', p.id
FROM public.permissions p
WHERE p.code IN (
    'employee.view','branch.view','department.view','attendance.view','attendance.approve',
    'leave.view','leave.approve','overtime.view','overtime.approve',
    'expense.view','expense.approve','resignation.view','resignation.approve',
    'announcement.view','letter.view','report.view','holiday.view','shift.view','shift.assign'
)
ON CONFLICT DO NOTHING;

-- Employee (self-service basics)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-00000000aaa7', p.id
FROM public.permissions p
WHERE p.code IN (
    'employee.view','attendance.view','attendance.create','leave.view','leave.apply',
    'overtime.view','overtime.apply','expense.view','expense.apply',
    'announcement.view','letter.view','holiday.view'
)
ON CONFLICT DO NOTHING;

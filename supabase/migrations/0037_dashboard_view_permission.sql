-- Dashboard is admin-only: employees and line managers land on Profile / first allowed page.

INSERT INTO public.permissions (module, action, description, is_system)
SELECT 'dashboard', 'view', 'View admin dashboard', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions WHERE code = 'dashboard.view'
);

-- Super Admin already has every permission via role_permissions seed pattern; ensure grant exists.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code = 'dashboard.view'
  AND r.name IN ('Super Admin', 'HR Admin', 'HR Officer', 'Payroll Officer')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

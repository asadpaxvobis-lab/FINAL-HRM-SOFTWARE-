-- Reliable permission resolution for the signed-in user (used by web AuthContext).
-- Mirrors user_has_permission() logic but returns the full effective permission set.

CREATE OR REPLACE FUNCTION public.get_my_permission_codes()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.code
  FROM public.permissions p
  WHERE (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND rp.permission_id = p.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_permission_overrides upo
      WHERE upo.user_id = auth.uid()
        AND upo.permission_id = p.id
        AND upo.effect = 'GRANT'
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_permission_overrides upo
    WHERE upo.user_id = auth.uid()
      AND upo.permission_id = p.id
      AND upo.effect = 'DENY'
  )
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role_names()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.name
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = auth.uid()
  ORDER BY r.is_built_in DESC, r.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permission_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role_names() TO authenticated;

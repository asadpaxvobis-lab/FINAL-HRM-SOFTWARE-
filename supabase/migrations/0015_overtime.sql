-- =============================================================================
-- 0015_overtime.sql
-- Overtime: requests, approvals, and rate config.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ot_no              text NOT NULL,
  employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  ot_date            date NOT NULL,
  start_time         time,
  end_time           time,
  planned_hours      numeric(6,2) NOT NULL CHECK (planned_hours > 0),
  actual_hours       numeric(6,2),
  ot_type            text NOT NULL DEFAULT 'NORMAL'
                       CHECK (ot_type IN ('NORMAL','WEEKEND','HOLIDAY','NIGHT')),
  rate_multiplier    numeric(4,2) NOT NULL DEFAULT 1.5,
  hourly_rate        numeric(12,2),
  amount             numeric(14,2),
  reason             text NOT NULL,
  status             text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','APPROVED','REJECTED','PAID','CANCELLED')),
  approved_by        uuid REFERENCES public.users(id),
  approved_at        timestamptz,
  decision_note      text,
  paid_at            timestamptz,
  payroll_period_id  uuid REFERENCES public.payroll_periods(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, ot_no)
);

CREATE INDEX IF NOT EXISTS idx_ot_employee ON public.overtime_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_status   ON public.overtime_requests(status);
CREATE INDEX IF NOT EXISTS idx_ot_date     ON public.overtime_requests(ot_date);
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ot_select ON public.overtime_requests;
CREATE POLICY ot_select ON public.overtime_requests FOR SELECT TO authenticated
  USING (
    public.user_has_permission('overtime.view')
    OR public.user_has_permission('overtime.approve')
    OR employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS ot_insert ON public.overtime_requests;
CREATE POLICY ot_insert ON public.overtime_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission('overtime.apply')
    AND employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS ot_update ON public.overtime_requests;
CREATE POLICY ot_update ON public.overtime_requests FOR UPDATE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'PENDING')
    OR public.user_has_permission('overtime.approve')
    OR public.user_has_permission('overtime.config')
  )
  WITH CHECK (
    employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
    OR public.user_has_permission('overtime.approve')
    OR public.user_has_permission('overtime.config')
  );

DROP POLICY IF EXISTS ot_delete ON public.overtime_requests;
CREATE POLICY ot_delete ON public.overtime_requests FOR DELETE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'PENDING')
    OR public.user_has_permission('overtime.config')
  );

DROP TRIGGER IF EXISTS trg_ot_updated ON public.overtime_requests;
CREATE TRIGGER trg_ot_updated BEFORE UPDATE ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grant overtime perms across roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Super Admin','HR Admin','HR Officer','Payroll Officer')
  AND p.code IN ('overtime.view','overtime.apply','overtime.approve','overtime.config')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Branch Manager','Department Manager')
  AND p.code IN ('overtime.view','overtime.approve')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Employee'
  AND p.code IN ('overtime.view','overtime.apply')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

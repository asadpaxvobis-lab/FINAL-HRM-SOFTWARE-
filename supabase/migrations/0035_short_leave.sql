-- Phase 4 extension: Short / hourly leave (within-day time off)

CREATE TABLE IF NOT EXISTS public.short_leave_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_date      date NOT NULL,
  start_time      time NOT NULL,
  end_time        time NOT NULL,
  duration_hours  numeric(4,2) NOT NULL CHECK (duration_hours > 0 AND duration_hours <= 8),
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending','Approved','Rejected','Cancelled')),
  approver_id     uuid REFERENCES public.users(id),
  decided_at      timestamptz,
  decision_note   text,
  requested_by    uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_short_leave_employee_date
  ON public.short_leave_applications (employee_id, leave_date DESC);
CREATE INDEX IF NOT EXISTS idx_short_leave_company_status
  ON public.short_leave_applications (company_id, status);

CREATE TRIGGER trg_short_leave_updated_at
  BEFORE UPDATE ON public.short_leave_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.short_leave_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS short_leave_select ON public.short_leave_applications;
CREATE POLICY short_leave_select ON public.short_leave_applications
  FOR SELECT TO authenticated
  USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.view')
  );

DROP POLICY IF EXISTS short_leave_insert ON public.short_leave_applications;
CREATE POLICY short_leave_insert ON public.short_leave_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.apply')
  );

DROP POLICY IF EXISTS short_leave_update_approve ON public.short_leave_applications;
CREATE POLICY short_leave_update_approve ON public.short_leave_applications
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.approve')
  );

DROP POLICY IF EXISTS short_leave_update_cancel ON public.short_leave_applications;
CREATE POLICY short_leave_update_cancel ON public.short_leave_applications
  FOR UPDATE TO authenticated
  USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.apply')
    AND employee_id = (SELECT u.employee_id FROM public.users u WHERE u.id = auth.uid())
    AND status = 'Pending'
  )
  WITH CHECK (status = 'Cancelled');

-- Default policy limits (admin can change via Settings JSON later)
UPDATE public.app_settings
SET settings = settings || '{"short_leave_max_hours": 3, "short_leave_max_per_month": 2}'::jsonb
WHERE company_id = '00000000-0000-0000-0000-000000000001';

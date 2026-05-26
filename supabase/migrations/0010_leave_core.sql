-- Phase 4: Leave management core

CREATE TABLE public.leave_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                text NOT NULL,
  name                text NOT NULL,
  is_paid             boolean NOT NULL DEFAULT true,
  default_yearly_days numeric(5,2) NOT NULL DEFAULT 0,
  carry_forward_days  numeric(5,2) NOT NULL DEFAULT 0,
  requires_attachment boolean NOT NULL DEFAULT false,
  allow_half_day      boolean NOT NULL DEFAULT true,
  applies_to_gender   text CHECK (applies_to_gender IS NULL OR applies_to_gender IN ('Male','Female')),
  color               text NOT NULL DEFAULT '#f59e0b',
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE public.leave_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year            integer NOT NULL,
  opening         numeric(7,2) NOT NULL DEFAULT 0,
  granted         numeric(7,2) NOT NULL DEFAULT 0,
  consumed        numeric(7,2) NOT NULL DEFAULT 0,
  carry_forward   numeric(7,2) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE INDEX idx_leave_balances_employee ON public.leave_balances (employee_id, year DESC);

CREATE TABLE public.leave_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id   uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  half_day        boolean NOT NULL DEFAULT false,
  half_day_part   text CHECK (half_day_part IS NULL OR half_day_part IN ('first','second')),
  total_days      numeric(5,2) NOT NULL DEFAULT 0,
  reason          text NOT NULL,
  attachment_path text,
  status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Cancelled')),
  approver_id     uuid REFERENCES public.users(id),
  decided_at      timestamptz,
  decision_note   text,
  requested_by    uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_apps_employee ON public.leave_applications (employee_id, start_date DESC);
CREATE INDEX idx_leave_apps_company_status ON public.leave_applications (company_id, status);
CREATE INDEX idx_leave_apps_dates ON public.leave_applications (start_date, end_date);

INSERT INTO public.leave_types (company_id, code, name, default_yearly_days, carry_forward_days, color, requires_attachment, applies_to_gender)
SELECT '00000000-0000-0000-0000-000000000001', code, name, days, cf, color, req_att, gender
FROM (VALUES
  ('ANNUAL',    'Annual Leave',     14, 5,  '#f59e0b', false, NULL),
  ('CASUAL',    'Casual Leave',     10, 0,  '#3b82f6', false, NULL),
  ('SICK',      'Sick Leave',       8,  0,  '#ef4444', true,  NULL),
  ('MATERNITY', 'Maternity Leave', 90,  0,  '#ec4899', true,  'Female'),
  ('PATERNITY', 'Paternity Leave',  5,  0,  '#0ea5e9', false, 'Male'),
  ('HAJJ',      'Hajj Leave',      30,  0,  '#10b981', true,  NULL),
  ('UNPAID',    'Unpaid Leave',     0,  0,  '#6b7280', false, NULL),
  ('BEREAVE',   'Bereavement',      3,  0,  '#64748b', false, NULL)
) AS t(code, name, days, cf, color, req_att, gender)
WHERE NOT EXISTS (
  SELECT 1 FROM public.leave_types lt
  WHERE lt.company_id = '00000000-0000-0000-0000-000000000001' AND lt.code = t.code
);

UPDATE public.leave_types SET is_paid = false WHERE code = 'UNPAID';

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY leave_types_select ON public.leave_types
  FOR SELECT USING (company_id = public.current_user_company_id());

CREATE POLICY leave_types_modify ON public.leave_types
  FOR ALL USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.config')
  )
  WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.config')
  );

CREATE POLICY leave_balances_select ON public.leave_balances
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_balances.employee_id
        AND e.company_id = public.current_user_company_id()
    )
    AND public.user_has_permission('leave.view')
  );

CREATE POLICY leave_balances_modify ON public.leave_balances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_balances.employee_id
        AND e.company_id = public.current_user_company_id()
    )
    AND public.user_has_permission('leave.config')
  )
  WITH CHECK (public.user_has_permission('leave.config'));

CREATE POLICY leave_apps_select ON public.leave_applications
  FOR SELECT USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.view')
  );

CREATE POLICY leave_apps_insert ON public.leave_applications
  FOR INSERT WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.apply')
  );

CREATE POLICY leave_apps_update ON public.leave_applications
  FOR UPDATE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.approve')
  );

CREATE POLICY leave_apps_delete ON public.leave_applications
  FOR DELETE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('leave.approve')
  );

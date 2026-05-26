-- Phase 2: Holidays, branch exclusions, Shifts, Employee statutory enrollment

CREATE TABLE public.holidays (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name          text NOT NULL,
  holiday_date  date NOT NULL,
  description   text,
  holiday_type  text NOT NULL DEFAULT 'Public',
  is_paid       boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holiday_date, name)
);

CREATE TABLE public.branch_holiday_exclusions (
  branch_id   uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  holiday_id  uuid NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  PRIMARY KEY (branch_id, holiday_id)
);

CREATE TABLE public.shifts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  start_time           time NOT NULL,
  end_time             time NOT NULL,
  break_minutes        integer NOT NULL DEFAULT 60,
  grace_late_minutes   integer NOT NULL DEFAULT 15,
  grace_early_minutes  integer NOT NULL DEFAULT 15,
  is_night             boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE public.employee_statutory_enrollment (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                   uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from                date NOT NULL,
  eobi_enabled                  boolean NOT NULL DEFAULT false,
  eobi_custom_amount            numeric,
  pf_enabled                    boolean NOT NULL DEFAULT false,
  pf_employee_pct               numeric,
  pf_employer_pct               numeric,
  social_security_enabled       boolean NOT NULL DEFAULT false,
  social_security_custom_amount numeric,
  income_tax_enabled            boolean NOT NULL DEFAULT true,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, effective_from)
);

CREATE INDEX idx_holidays_company_date ON public.holidays (company_id, holiday_date);
CREATE INDEX idx_shifts_company ON public.shifts (company_id);
CREATE INDEX idx_statutory_employee ON public.employee_statutory_enrollment (employee_id, effective_from DESC);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_holiday_exclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_statutory_enrollment ENABLE ROW LEVEL SECURITY;

CREATE POLICY holidays_select ON public.holidays
  FOR SELECT USING (company_id = public.current_user_company_id());

CREATE POLICY holidays_insert ON public.holidays
  FOR INSERT WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('holiday.create')
  );

CREATE POLICY holidays_update ON public.holidays
  FOR UPDATE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('holiday.update')
  );

CREATE POLICY holidays_delete ON public.holidays
  FOR DELETE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('holiday.delete')
  );

CREATE POLICY shifts_select ON public.shifts
  FOR SELECT USING (company_id = public.current_user_company_id());

CREATE POLICY shifts_insert ON public.shifts
  FOR INSERT WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('shift.create')
  );

CREATE POLICY shifts_update ON public.shifts
  FOR UPDATE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('shift.update')
  );

CREATE POLICY shifts_delete ON public.shifts
  FOR DELETE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('shift.delete')
  );

CREATE POLICY branch_hol_excl_select ON public.branch_holiday_exclusions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_holiday_exclusions.branch_id
        AND b.company_id = public.current_user_company_id()
    )
  );

CREATE POLICY branch_hol_excl_modify ON public.branch_holiday_exclusions
  FOR ALL USING (
    public.user_has_permission('holiday.update')
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = branch_holiday_exclusions.branch_id
        AND b.company_id = public.current_user_company_id()
    )
  )
  WITH CHECK (public.user_has_permission('holiday.update'));

CREATE POLICY statutory_select ON public.employee_statutory_enrollment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_statutory_enrollment.employee_id
        AND e.company_id = public.current_user_company_id()
    )
  );

CREATE POLICY statutory_modify ON public.employee_statutory_enrollment
  FOR ALL USING (
    public.user_has_permission('employee.update')
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_statutory_enrollment.employee_id
        AND e.company_id = public.current_user_company_id()
    )
  )
  WITH CHECK (public.user_has_permission('employee.update'));

-- Phase 2: Employee shift assignments, salary history, documents

CREATE TABLE public.employee_shift_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  shift_id        uuid NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  effective_from  date NOT NULL,
  effective_to    date,
  weekly_off      text[] NOT NULL DEFAULT ARRAY['Sunday']::text[],
  notes           text,
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_emp_shift_employee ON public.employee_shift_assignments (employee_id, effective_from DESC);
CREATE INDEX idx_emp_shift_shift ON public.employee_shift_assignments (shift_id);

CREATE TABLE public.employee_salary_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_from     date NOT NULL,
  effective_to       date,
  basic              numeric(14,2) NOT NULL DEFAULT 0,
  house_rent         numeric(14,2) NOT NULL DEFAULT 0,
  medical            numeric(14,2) NOT NULL DEFAULT 0,
  conveyance         numeric(14,2) NOT NULL DEFAULT 0,
  utilities          numeric(14,2) NOT NULL DEFAULT 0,
  other_allowances   numeric(14,2) NOT NULL DEFAULT 0,
  pay_frequency      text NOT NULL DEFAULT 'Monthly' CHECK (pay_frequency IN ('Weekly','Fortnightly','Monthly')),
  currency           text NOT NULL DEFAULT 'PKR',
  revision_reason    text,
  notes              text,
  created_by         uuid REFERENCES public.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_salary_employee ON public.employee_salary_history (employee_id, effective_from DESC);

CREATE TABLE public.employee_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  doc_type        text NOT NULL,
  title           text NOT NULL,
  storage_path    text NOT NULL,
  file_size       bigint,
  mime_type       text,
  issued_on       date,
  expires_on      date,
  notes           text,
  uploaded_by     uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_employee ON public.employee_documents (employee_id, created_at DESC);
CREATE INDEX idx_documents_expiry ON public.employee_documents (expires_on) WHERE expires_on IS NOT NULL;

ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_shift_select ON public.employee_shift_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.employees e
            WHERE e.id = employee_shift_assignments.employee_id
              AND e.company_id = public.current_user_company_id())
  );

CREATE POLICY emp_shift_modify ON public.employee_shift_assignments
  FOR ALL USING (
    public.user_has_permission('shift.assign')
    AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.id = employee_shift_assignments.employee_id
                  AND e.company_id = public.current_user_company_id())
  )
  WITH CHECK (public.user_has_permission('shift.assign'));

CREATE POLICY salary_select ON public.employee_salary_history
  FOR SELECT USING (
    (public.user_has_permission('payroll.view') OR public.user_has_permission('employee.update'))
    AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.id = employee_salary_history.employee_id
                  AND e.company_id = public.current_user_company_id())
  );

CREATE POLICY salary_modify ON public.employee_salary_history
  FOR ALL USING (
    public.user_has_permission('payroll.update')
    AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.id = employee_salary_history.employee_id
                  AND e.company_id = public.current_user_company_id())
  )
  WITH CHECK (public.user_has_permission('payroll.update'));

CREATE POLICY documents_select ON public.employee_documents
  FOR SELECT USING (
    public.user_has_permission('employee.view')
    AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.id = employee_documents.employee_id
                  AND e.company_id = public.current_user_company_id())
  );

CREATE POLICY documents_modify ON public.employee_documents
  FOR ALL USING (
    public.user_has_permission('employee.update')
    AND EXISTS (SELECT 1 FROM public.employees e
                WHERE e.id = employee_documents.employee_id
                  AND e.company_id = public.current_user_company_id())
  )
  WITH CHECK (public.user_has_permission('employee.update'));

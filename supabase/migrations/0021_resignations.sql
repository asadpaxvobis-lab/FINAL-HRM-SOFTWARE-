-- Phase 8c — Resignation & exit clearance / final settlement

CREATE TABLE IF NOT EXISTS public.resignations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  resignation_no          text NOT NULL,
  employee_id             uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  resignation_date        date NOT NULL DEFAULT CURRENT_DATE,
  requested_last_day      date NOT NULL,
  approved_last_day       date,
  notice_period_days      integer,
  reason_category         text NOT NULL DEFAULT 'Personal'
    CHECK (reason_category IN ('Personal','Better Opportunity','Relocation','Health','Education','Retirement','Other')),
  reason                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED','WITHDRAWN')),
  clearance_status        text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (clearance_status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
  settlement_status         text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (settlement_status IN ('NOT_STARTED','CALCULATED','PROCESSED')),
  approved_by             uuid REFERENCES public.users(id),
  approved_at             timestamptz,
  decision_note             text,
  gratuity_amount           numeric(14,2) NOT NULL DEFAULT 0,
  leave_encashment_amount   numeric(14,2) NOT NULL DEFAULT 0,
  pending_salary_amount     numeric(14,2) NOT NULL DEFAULT 0,
  loan_deduction            numeric(14,2) NOT NULL DEFAULT 0,
  other_deductions          numeric(14,2) NOT NULL DEFAULT 0,
  net_settlement            numeric(14,2) NOT NULL DEFAULT 0,
  settlement_notes          text,
  settlement_processed_at   timestamptz,
  settlement_processed_by   uuid REFERENCES public.users(id),
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, resignation_no)
);

CREATE INDEX IF NOT EXISTS idx_resignations_employee ON public.resignations(employee_id);
CREATE INDEX IF NOT EXISTS idx_resignations_status ON public.resignations(status);
CREATE INDEX IF NOT EXISTS idx_resignations_company ON public.resignations(company_id);

CREATE TABLE IF NOT EXISTS public.resignation_clearance_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resignation_id  uuid NOT NULL REFERENCES public.resignations(id) ON DELETE CASCADE,
  step_code       text NOT NULL,
  step_name       text NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  is_cleared      boolean NOT NULL DEFAULT false,
  cleared_by      uuid REFERENCES public.users(id),
  cleared_at      timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resignation_id, step_code)
);

CREATE INDEX IF NOT EXISTS idx_res_clearance_res ON public.resignation_clearance_steps(resignation_id);

ALTER TABLE public.resignations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resignation_clearance_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS res_select ON public.resignations;
CREATE POLICY res_select ON public.resignations FOR SELECT TO authenticated
  USING (
    public.user_has_permission('resignation.view')
    OR public.user_has_permission('resignation.approve')
    OR public.user_has_permission('resignation.process')
    OR employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS res_insert ON public.resignations;
CREATE POLICY res_insert ON public.resignations FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission('resignation.apply')
    AND employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS res_update ON public.resignations;
CREATE POLICY res_update ON public.resignations FOR UPDATE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'PENDING')
    OR public.user_has_permission('resignation.approve')
    OR public.user_has_permission('resignation.process')
  )
  WITH CHECK (
    employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
    OR public.user_has_permission('resignation.approve')
    OR public.user_has_permission('resignation.process')
  );

DROP POLICY IF EXISTS res_delete ON public.resignations;
CREATE POLICY res_delete ON public.resignations FOR DELETE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'PENDING')
    OR public.user_has_permission('resignation.approve')
  );

DROP POLICY IF EXISTS res_clear_select ON public.resignation_clearance_steps;
CREATE POLICY res_clear_select ON public.resignation_clearance_steps FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resignations r
      WHERE r.id = resignation_clearance_steps.resignation_id
        AND (
          public.user_has_permission('resignation.view')
          OR public.user_has_permission('resignation.approve')
          OR public.user_has_permission('resignation.process')
          OR r.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS res_clear_modify ON public.resignation_clearance_steps;
CREATE POLICY res_clear_modify ON public.resignation_clearance_steps FOR ALL TO authenticated
  USING (
    public.user_has_permission('resignation.approve')
    OR public.user_has_permission('resignation.process')
  )
  WITH CHECK (
    public.user_has_permission('resignation.approve')
    OR public.user_has_permission('resignation.process')
  );

DROP TRIGGER IF EXISTS trg_resignations_updated ON public.resignations;
CREATE TRIGGER trg_resignations_updated BEFORE UPDATE ON public.resignations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Role grants
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Super Admin','HR Admin','HR Officer')
  AND p.code IN ('resignation.view','resignation.apply','resignation.approve','resignation.process')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Department Manager','Branch Manager')
  AND p.code IN ('resignation.view','resignation.approve')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Employee'
  AND p.code IN ('resignation.view','resignation.apply')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name = 'Payroll Officer'
  AND p.code IN ('resignation.view','resignation.process')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

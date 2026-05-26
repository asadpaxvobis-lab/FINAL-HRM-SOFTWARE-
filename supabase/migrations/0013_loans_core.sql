-- =============================================================================
-- 0013_loans_core.sql
-- Phase 7 — Loans & advances: types, requests, amortization schedules,
-- approval & disbursement flow.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- loan_types — catalog of loan products (advance, festival, vehicle, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_types (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                 text NOT NULL,
  name                 text NOT NULL,
  description          text,
  max_amount           numeric(14,2),
  max_installments     int,
  interest_rate_pct    numeric(6,3) NOT NULL DEFAULT 0,
  requires_collateral  boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_loan_types_company ON public.loan_types(company_id);
ALTER TABLE public.loan_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lt_select ON public.loan_types;
CREATE POLICY lt_select ON public.loan_types FOR SELECT TO authenticated
  USING (public.user_has_permission('loan.view'));
DROP POLICY IF EXISTS lt_insert ON public.loan_types;
CREATE POLICY lt_insert ON public.loan_types FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('loan.approve'));
DROP POLICY IF EXISTS lt_update ON public.loan_types;
CREATE POLICY lt_update ON public.loan_types FOR UPDATE TO authenticated
  USING (public.user_has_permission('loan.approve'))
  WITH CHECK (public.user_has_permission('loan.approve'));
DROP POLICY IF EXISTS lt_delete ON public.loan_types;
CREATE POLICY lt_delete ON public.loan_types FOR DELETE TO authenticated
  USING (public.user_has_permission('loan.approve'));


-- -----------------------------------------------------------------------------
-- loans — request header + lifecycle
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  loan_no             text NOT NULL,
  employee_id         uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  loan_type_id        uuid REFERENCES public.loan_types(id),
  loan_type_code      text,
  loan_type_name      text,
  purpose             text NOT NULL,
  principal_amount    numeric(14,2) NOT NULL CHECK (principal_amount > 0),
  interest_rate_pct   numeric(6,3) NOT NULL DEFAULT 0,
  installments        int NOT NULL CHECK (installments > 0),
  monthly_installment numeric(14,2) NOT NULL DEFAULT 0,
  total_payable       numeric(14,2) NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  status              text NOT NULL DEFAULT 'REQUESTED'
                        CHECK (status IN ('REQUESTED','APPROVED','REJECTED','ACTIVE','CLOSED','CANCELLED')),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  decided_by          uuid REFERENCES public.users(id),
  decision_note       text,
  disbursed_at        timestamptz,
  closed_at           timestamptz,
  outstanding_amount  numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount         numeric(14,2) NOT NULL DEFAULT 0,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, loan_no)
);

CREATE INDEX IF NOT EXISTS idx_loans_employee ON public.loans(employee_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(status);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loan_select ON public.loans;
CREATE POLICY loan_select ON public.loans FOR SELECT TO authenticated
  USING (
    public.user_has_permission('loan.view')
    OR public.user_has_permission('loan.approve')
    OR employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS loan_insert ON public.loans;
CREATE POLICY loan_insert ON public.loans FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission('loan.create')
    AND employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS loan_update ON public.loans;
CREATE POLICY loan_update ON public.loans FOR UPDATE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'REQUESTED')
    OR public.user_has_permission('loan.approve')
    OR public.user_has_permission('loan.update')
  )
  WITH CHECK (
    employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
    OR public.user_has_permission('loan.approve')
    OR public.user_has_permission('loan.update')
  );

DROP POLICY IF EXISTS loan_delete ON public.loans;
CREATE POLICY loan_delete ON public.loans FOR DELETE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'REQUESTED')
    OR public.user_has_permission('loan.approve')
  );


-- -----------------------------------------------------------------------------
-- loan_installments — amortization schedule rows
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loan_installments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             uuid NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  installment_no      int NOT NULL,
  due_date            date NOT NULL,
  amount              numeric(14,2) NOT NULL,
  principal_portion   numeric(14,2) NOT NULL DEFAULT 0,
  interest_portion    numeric(14,2) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PAID','SKIPPED','WAIVED')),
  paid_at             timestamptz,
  payroll_period_id   uuid REFERENCES public.payroll_periods(id),
  paid_amount         numeric(14,2) NOT NULL DEFAULT 0,
  notes               text,
  UNIQUE (loan_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_installments_loan ON public.loan_installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due ON public.loan_installments(due_date);
ALTER TABLE public.loan_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS li_select ON public.loan_installments;
CREATE POLICY li_select ON public.loan_installments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.loans l
      WHERE l.id = loan_installments.loan_id
        AND (
          public.user_has_permission('loan.view')
          OR public.user_has_permission('loan.approve')
          OR l.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS li_insert ON public.loan_installments;
CREATE POLICY li_insert ON public.loan_installments FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('loan.approve') OR public.user_has_permission('loan.update'));

DROP POLICY IF EXISTS li_update ON public.loan_installments;
CREATE POLICY li_update ON public.loan_installments FOR UPDATE TO authenticated
  USING (public.user_has_permission('loan.approve') OR public.user_has_permission('loan.update'))
  WITH CHECK (public.user_has_permission('loan.approve') OR public.user_has_permission('loan.update'));

DROP POLICY IF EXISTS li_delete ON public.loan_installments;
CREATE POLICY li_delete ON public.loan_installments FOR DELETE TO authenticated
  USING (public.user_has_permission('loan.approve'));


-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_loan_types_updated ON public.loan_types;
CREATE TRIGGER trg_loan_types_updated BEFORE UPDATE ON public.loan_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_loans_updated ON public.loans;
CREATE TRIGGER trg_loans_updated BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Seed default loan types for the default company
-- -----------------------------------------------------------------------------
INSERT INTO public.loan_types (company_id, code, name, description, max_amount, max_installments, interest_rate_pct)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  v.code, v.name, v.description, v.max_amount, v.max_installments, v.rate
FROM (VALUES
  ('ADV',   'Salary advance',     'Short-term advance against upcoming salary',          100000::numeric, 3,  0::numeric),
  ('FEST',  'Festival / Eid loan','Interest-free loan around Eid',                       150000::numeric, 6,  0::numeric),
  ('EMRG',  'Emergency loan',     'Medical, family emergency',                           300000::numeric, 12, 0::numeric),
  ('MED',   'Medical loan',       'Hospitalization, surgery, parents medical',           500000::numeric, 18, 0::numeric),
  ('VEH',   'Vehicle loan',       'Bike or car down-payment',                            1000000::numeric, 36, 5::numeric),
  ('HOUSE', 'House loan',         'Marriage, house down-payment',                        2000000::numeric, 60, 7::numeric)
) AS v(code, name, description, max_amount, max_installments, rate)
WHERE NOT EXISTS (
  SELECT 1 FROM public.loan_types lt
  WHERE lt.company_id = '00000000-0000-0000-0000-000000000001' AND lt.code = v.code
);

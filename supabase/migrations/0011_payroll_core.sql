-- =============================================================================
-- 0011_payroll_core.sql
-- Phase 5 — Payroll: components catalog, periods, runs, payslips + lines,
-- Pakistan FY 2025-26 income-tax slabs. Permissions and RLS included.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payroll_components — catalog of earnings, deductions, employer contributions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_components (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code               text NOT NULL,
  name               text NOT NULL,
  -- EARNING | DEDUCTION | EMPLOYER_CONTRIB
  component_type     text NOT NULL CHECK (component_type IN ('EARNING','DEDUCTION','EMPLOYER_CONTRIB')),
  -- FIXED | PCT_BASIC | PCT_GROSS | FORMULA
  calc_method        text NOT NULL DEFAULT 'FIXED' CHECK (calc_method IN ('FIXED','PCT_BASIC','PCT_GROSS','FORMULA')),
  -- For PCT_* methods: percentage value (e.g. 12.5 means 12.5%)
  calc_value         numeric(10,4) NOT NULL DEFAULT 0,
  -- Free-text formula description (engine still uses calc_method/calc_value for now)
  formula            text,
  is_taxable         boolean NOT NULL DEFAULT false,
  is_eobi_applicable boolean NOT NULL DEFAULT false,
  is_pf_applicable   boolean NOT NULL DEFAULT false,
  is_system          boolean NOT NULL DEFAULT false,
  sort_order         int NOT NULL DEFAULT 100,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_payroll_components_company ON public.payroll_components(company_id);

ALTER TABLE public.payroll_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comp_select ON public.payroll_components;
CREATE POLICY comp_select ON public.payroll_components FOR SELECT TO authenticated
  USING (public.user_has_permission('payroll.view'));
DROP POLICY IF EXISTS comp_insert ON public.payroll_components;
CREATE POLICY comp_insert ON public.payroll_components FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.config'));
DROP POLICY IF EXISTS comp_update ON public.payroll_components;
CREATE POLICY comp_update ON public.payroll_components FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.config'))
  WITH CHECK (public.user_has_permission('payroll.config'));
DROP POLICY IF EXISTS comp_delete ON public.payroll_components;
CREATE POLICY comp_delete ON public.payroll_components FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.config') AND NOT is_system);


-- -----------------------------------------------------------------------------
-- payroll_periods — billing cycles (monthly / 15-day / weekly)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,
  frequency     text NOT NULL CHECK (frequency IN ('MONTHLY','SEMI_MONTHLY','WEEKLY')),
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  pay_date      date,
  status        text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PROCESSING','FINALIZED','RELEASED','PAID')),
  notes         text,
  created_by    uuid REFERENCES public.users(id),
  finalized_by  uuid REFERENCES public.users(id),
  finalized_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_company_date ON public.payroll_periods(company_id, period_start);

ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_select ON public.payroll_periods;
CREATE POLICY pp_select ON public.payroll_periods FOR SELECT TO authenticated
  USING (public.user_has_permission('payroll.view'));
DROP POLICY IF EXISTS pp_insert ON public.payroll_periods;
CREATE POLICY pp_insert ON public.payroll_periods FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS pp_update ON public.payroll_periods;
CREATE POLICY pp_update ON public.payroll_periods FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.run'))
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS pp_delete ON public.payroll_periods;
CREATE POLICY pp_delete ON public.payroll_periods FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.run') AND status = 'DRAFT');


-- -----------------------------------------------------------------------------
-- payroll_runs — execution of a period (one canonical run + optional retries)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id            uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  run_at               timestamptz NOT NULL DEFAULT now(),
  run_by               uuid REFERENCES public.users(id),
  total_employees      int NOT NULL DEFAULT 0,
  total_gross          numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions     numeric(14,2) NOT NULL DEFAULT 0,
  total_employer_cost  numeric(14,2) NOT NULL DEFAULT 0,
  total_net            numeric(14,2) NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','COMPLETED','FAILED')),
  error_message        text,
  notes                text
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON public.payroll_runs(period_id);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_select ON public.payroll_runs;
CREATE POLICY pr_select ON public.payroll_runs FOR SELECT TO authenticated
  USING (public.user_has_permission('payroll.view'));
DROP POLICY IF EXISTS pr_insert ON public.payroll_runs;
CREATE POLICY pr_insert ON public.payroll_runs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS pr_update ON public.payroll_runs;
CREATE POLICY pr_update ON public.payroll_runs FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.run'))
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS pr_delete ON public.payroll_runs;
CREATE POLICY pr_delete ON public.payroll_runs FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.run'));


-- -----------------------------------------------------------------------------
-- payslips — one row per employee per run (with snapshot fields)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslips (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id             uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  period_id          uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id        uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  employee_code      text NOT NULL,
  employee_name      text NOT NULL,
  designation        text,
  department         text,
  branch             text,
  -- Attendance / leave snapshot
  days_in_period     numeric(6,2) NOT NULL DEFAULT 0,
  working_days       numeric(6,2) NOT NULL DEFAULT 0,
  present_days       numeric(6,2) NOT NULL DEFAULT 0,
  paid_leave_days    numeric(6,2) NOT NULL DEFAULT 0,
  unpaid_leave_days  numeric(6,2) NOT NULL DEFAULT 0,
  absent_days        numeric(6,2) NOT NULL DEFAULT 0,
  holidays_count     numeric(6,2) NOT NULL DEFAULT 0,
  -- Base compensation snapshot
  basic              numeric(14,2) NOT NULL DEFAULT 0,
  -- Roll-ups (kept on parent for fast list views; mirrored in payslip_lines)
  gross_earnings     numeric(14,2) NOT NULL DEFAULT 0,
  total_deductions   numeric(14,2) NOT NULL DEFAULT 0,
  employer_contrib   numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount         numeric(14,2) NOT NULL DEFAULT 0,
  eobi_employee      numeric(14,2) NOT NULL DEFAULT 0,
  eobi_employer      numeric(14,2) NOT NULL DEFAULT 0,
  pf_employee        numeric(14,2) NOT NULL DEFAULT 0,
  pf_employer        numeric(14,2) NOT NULL DEFAULT 0,
  net_pay            numeric(14,2) NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINAL','PAID')),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payslips_period_employee ON public.payslips(period_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payslips_run ON public.payslips(run_id);

ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ps_select ON public.payslips;
CREATE POLICY ps_select ON public.payslips FOR SELECT TO authenticated
  USING (
    public.user_has_permission('payroll.view')
    OR employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );
DROP POLICY IF EXISTS ps_insert ON public.payslips;
CREATE POLICY ps_insert ON public.payslips FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS ps_update ON public.payslips;
CREATE POLICY ps_update ON public.payslips FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.run'))
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS ps_delete ON public.payslips;
CREATE POLICY ps_delete ON public.payslips FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.run'));


-- -----------------------------------------------------------------------------
-- payslip_lines — line-by-line breakdown
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payslip_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id      uuid NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  component_id    uuid REFERENCES public.payroll_components(id),
  component_code  text NOT NULL,
  component_name  text NOT NULL,
  component_type  text NOT NULL CHECK (component_type IN ('EARNING','DEDUCTION','EMPLOYER_CONTRIB')),
  amount          numeric(14,2) NOT NULL DEFAULT 0,
  base_amount     numeric(14,2),
  formula_used    text,
  sort_order      int NOT NULL DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_payslip_lines_payslip ON public.payslip_lines(payslip_id);

ALTER TABLE public.payslip_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS psl_select ON public.payslip_lines;
CREATE POLICY psl_select ON public.payslip_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payslips p
      WHERE p.id = payslip_lines.payslip_id
        AND (
          public.user_has_permission('payroll.view')
          OR p.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
        )
    )
  );
DROP POLICY IF EXISTS psl_insert ON public.payslip_lines;
CREATE POLICY psl_insert ON public.payslip_lines FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS psl_update ON public.payslip_lines;
CREATE POLICY psl_update ON public.payslip_lines FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.run'))
  WITH CHECK (public.user_has_permission('payroll.run'));
DROP POLICY IF EXISTS psl_delete ON public.payslip_lines;
CREATE POLICY psl_delete ON public.payslip_lines FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.run'));


-- -----------------------------------------------------------------------------
-- tax_slabs — Pakistan annual income-tax slabs for salaried persons
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_slabs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  fy_label    text NOT NULL,
  applies_to  text NOT NULL DEFAULT 'SALARIED' CHECK (applies_to IN ('SALARIED','AOP','NON_SALARIED')),
  slab_from   numeric(14,2) NOT NULL,
  slab_to     numeric(14,2),
  base_tax    numeric(14,2) NOT NULL DEFAULT 0,
  rate_pct    numeric(6,3) NOT NULL DEFAULT 0,
  sort_order  int NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_slabs_company_fy ON public.tax_slabs(company_id, fy_label);

ALTER TABLE public.tax_slabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tx_select ON public.tax_slabs;
CREATE POLICY tx_select ON public.tax_slabs FOR SELECT TO authenticated
  USING (public.user_has_permission('payroll.view'));
DROP POLICY IF EXISTS tx_insert ON public.tax_slabs;
CREATE POLICY tx_insert ON public.tax_slabs FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('payroll.config'));
DROP POLICY IF EXISTS tx_update ON public.tax_slabs;
CREATE POLICY tx_update ON public.tax_slabs FOR UPDATE TO authenticated
  USING (public.user_has_permission('payroll.config'))
  WITH CHECK (public.user_has_permission('payroll.config'));
DROP POLICY IF EXISTS tx_delete ON public.tax_slabs;
CREATE POLICY tx_delete ON public.tax_slabs FOR DELETE TO authenticated
  USING (public.user_has_permission('payroll.config'));


-- -----------------------------------------------------------------------------
-- Trigger to bump updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_payroll_components_updated ON public.payroll_components;
CREATE TRIGGER trg_payroll_components_updated BEFORE UPDATE ON public.payroll_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_periods_updated ON public.payroll_periods;
CREATE TRIGGER trg_payroll_periods_updated BEFORE UPDATE ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_payslips_updated ON public.payslips;
CREATE TRIGGER trg_payslips_updated BEFORE UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Permissions (idempotent)
-- -----------------------------------------------------------------------------
INSERT INTO public.permissions (module, action, description, is_system)
SELECT v.module, v.action, v.description, true
FROM (VALUES
  ('payroll','config','Configure payroll components, tax slabs, statutory rates')
) AS v(module, action, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p WHERE p.module = v.module AND p.action = v.action
);

-- Grant new permissions to Super Admin + HR Admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('payroll.config')
WHERE r.name IN ('Super Admin','HR Admin')
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_id = r.id AND x.permission_id = p.id
  );


-- -----------------------------------------------------------------------------
-- Seed default payroll components for the default company
-- -----------------------------------------------------------------------------
INSERT INTO public.payroll_components (
  company_id, code, name, component_type, calc_method, calc_value,
  is_taxable, is_eobi_applicable, is_pf_applicable, is_system, sort_order
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid, v.code, v.name, v.ctype, v.method, v.val,
  v.taxable, v.eobi, v.pf, true, v.so
FROM (VALUES
  ('BASIC',        'Basic salary',                'EARNING',         'FIXED',     0,    true,  true,  true,  10),
  ('HRA',          'House rent allowance',        'EARNING',         'PCT_BASIC', 45,   true,  false, false, 20),
  ('MED',          'Medical allowance',           'EARNING',         'PCT_BASIC', 10,   false, false, false, 30),
  ('CONV',         'Conveyance allowance',        'EARNING',         'FIXED',     0,    true,  false, false, 40),
  ('UTIL',         'Utilities allowance',         'EARNING',         'FIXED',     0,    true,  false, false, 50),
  ('OTH',          'Other allowances',            'EARNING',         'FIXED',     0,    true,  false, false, 60),
  ('OT',           'Overtime',                    'EARNING',         'FIXED',     0,    true,  false, false, 70),
  ('BONUS',        'Bonus / commission',          'EARNING',         'FIXED',     0,    true,  false, false, 80),
  ('LOP',          'Loss of pay (unpaid leave)',  'DEDUCTION',       'FIXED',     0,    false, false, false, 100),
  ('TAX',          'Income tax (PAYE)',           'DEDUCTION',       'FORMULA',   0,    false, false, false, 110),
  ('EOBI_E',       'EOBI employee contribution',  'DEDUCTION',       'FIXED',     370,  false, false, false, 120),
  ('PF_E',         'Provident fund (employee)',   'DEDUCTION',       'PCT_BASIC', 8.33, false, false, false, 130),
  ('ADV',          'Salary advance recovery',     'DEDUCTION',       'FIXED',     0,    false, false, false, 140),
  ('EOBI_R',       'EOBI employer contribution',  'EMPLOYER_CONTRIB','FIXED',     1500, false, false, false, 200),
  ('PF_R',         'Provident fund (employer)',   'EMPLOYER_CONTRIB','PCT_BASIC', 8.33, false, false, false, 210)
) AS v(code, name, ctype, method, val, taxable, eobi, pf, so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payroll_components c
  WHERE c.company_id = '00000000-0000-0000-0000-000000000001' AND c.code = v.code
);


-- -----------------------------------------------------------------------------
-- Seed Pakistan FY 2025-26 salaried income-tax slabs
-- Source: Finance Act 2025 (taxable income thresholds annual PKR)
-- Effective 1 July 2025 to 30 June 2026
-- -----------------------------------------------------------------------------
INSERT INTO public.tax_slabs (company_id, fy_label, applies_to, slab_from, slab_to, base_tax, rate_pct, sort_order)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  '2025-26', 'SALARIED', v.slab_from, v.slab_to, v.base_tax, v.rate_pct, v.so
FROM (VALUES
  (0,         600000,   0,        0,    10),
  (600000,    1200000,  0,        1,    20),
  (1200000,   2200000,  6000,     11,   30),
  (2200000,   3200000,  116000,   23,   40),
  (3200000,   4100000,  346000,   30,   50),
  (4100000,   NULL,     616000,   35,   60)
) AS v(slab_from, slab_to, base_tax, rate_pct, so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_slabs t
  WHERE t.company_id = '00000000-0000-0000-0000-000000000001'
    AND t.fy_label = '2025-26'
    AND t.applies_to = 'SALARIED'
    AND t.slab_from = v.slab_from
);

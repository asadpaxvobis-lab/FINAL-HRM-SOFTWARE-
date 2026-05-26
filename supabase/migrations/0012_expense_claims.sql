-- =============================================================================
-- 0012_expense_claims.sql
-- Phase 6 — Expense claims: categories, claims, line items, approval workflow,
-- receipts storage bucket.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- expense_categories
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code                  text NOT NULL,
  name                  text NOT NULL,
  description           text,
  max_per_claim         numeric(14,2),
  max_per_month         numeric(14,2),
  requires_attachment   boolean NOT NULL DEFAULT true,
  gl_account            text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_company ON public.expense_categories(company_id);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ec_select ON public.expense_categories;
CREATE POLICY ec_select ON public.expense_categories FOR SELECT TO authenticated
  USING (public.user_has_permission('expense.view'));
DROP POLICY IF EXISTS ec_insert ON public.expense_categories;
CREATE POLICY ec_insert ON public.expense_categories FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('expense.config'));
DROP POLICY IF EXISTS ec_update ON public.expense_categories;
CREATE POLICY ec_update ON public.expense_categories FOR UPDATE TO authenticated
  USING (public.user_has_permission('expense.config'))
  WITH CHECK (public.user_has_permission('expense.config'));
DROP POLICY IF EXISTS ec_delete ON public.expense_categories;
CREATE POLICY ec_delete ON public.expense_categories FOR DELETE TO authenticated
  USING (public.user_has_permission('expense.config'));


-- -----------------------------------------------------------------------------
-- expense_claims (header)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_claims (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_no        text NOT NULL,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  title           text NOT NULL,
  claim_date      date NOT NULL DEFAULT CURRENT_DATE,
  currency        text NOT NULL DEFAULT 'PKR',
  total_amount    numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','REIMBURSED','CANCELLED')),
  submitted_at    timestamptz,
  decided_at      timestamptz,
  decided_by      uuid REFERENCES public.users(id),
  decision_note   text,
  paid_at         timestamptz,
  payroll_period_id uuid REFERENCES public.payroll_periods(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, claim_no)
);

CREATE INDEX IF NOT EXISTS idx_claims_employee ON public.expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON public.expense_claims(status);
ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claim_select ON public.expense_claims;
CREATE POLICY claim_select ON public.expense_claims FOR SELECT TO authenticated
  USING (
    public.user_has_permission('expense.approve')
    OR public.user_has_permission('expense.view')
    OR employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS claim_insert ON public.expense_claims;
CREATE POLICY claim_insert ON public.expense_claims FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_permission('expense.apply')
    AND employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS claim_update ON public.expense_claims;
CREATE POLICY claim_update ON public.expense_claims FOR UPDATE TO authenticated
  USING (
    -- Owner can edit DRAFT claims, approver can update any
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'DRAFT')
    OR public.user_has_permission('expense.approve')
  )
  WITH CHECK (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()))
    OR public.user_has_permission('expense.approve')
  );

DROP POLICY IF EXISTS claim_delete ON public.expense_claims;
CREATE POLICY claim_delete ON public.expense_claims FOR DELETE TO authenticated
  USING (
    (employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND status = 'DRAFT')
    OR public.user_has_permission('expense.approve')
  );


-- -----------------------------------------------------------------------------
-- expense_claim_lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_claim_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id       uuid NOT NULL REFERENCES public.expense_claims(id) ON DELETE CASCADE,
  category_id    uuid REFERENCES public.expense_categories(id),
  category_code  text,
  category_name  text,
  expense_date   date NOT NULL,
  amount         numeric(14,2) NOT NULL DEFAULT 0,
  description    text,
  vendor         text,
  attachment_url text,
  has_receipt    boolean NOT NULL DEFAULT false,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_lines_claim ON public.expense_claim_lines(claim_id);
ALTER TABLE public.expense_claim_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cl_select ON public.expense_claim_lines;
CREATE POLICY cl_select ON public.expense_claim_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id = expense_claim_lines.claim_id
        AND (
          public.user_has_permission('expense.approve')
          OR public.user_has_permission('expense.view')
          OR c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS cl_insert ON public.expense_claim_lines;
CREATE POLICY cl_insert ON public.expense_claim_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id = expense_claim_lines.claim_id
        AND (
          c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
          OR public.user_has_permission('expense.approve')
        )
    )
  );

DROP POLICY IF EXISTS cl_update ON public.expense_claim_lines;
CREATE POLICY cl_update ON public.expense_claim_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id = expense_claim_lines.claim_id
        AND (
          (c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND c.status = 'DRAFT')
          OR public.user_has_permission('expense.approve')
        )
    )
  );

DROP POLICY IF EXISTS cl_delete ON public.expense_claim_lines;
CREATE POLICY cl_delete ON public.expense_claim_lines FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.id = expense_claim_lines.claim_id
        AND (
          (c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()) AND c.status = 'DRAFT')
          OR public.user_has_permission('expense.approve')
        )
    )
  );


-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_expense_categories_updated ON public.expense_categories;
CREATE TRIGGER trg_expense_categories_updated BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_expense_claims_updated ON public.expense_claims;
CREATE TRIGGER trg_expense_claims_updated BEFORE UPDATE ON public.expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Permissions (idempotent) — most already exist; add nothing new since
-- expense.{apply, approve, config, view} were seeded in 0002.
-- -----------------------------------------------------------------------------


-- -----------------------------------------------------------------------------
-- Seed default expense categories for the default company
-- -----------------------------------------------------------------------------
INSERT INTO public.expense_categories (company_id, code, name, description, max_per_claim, requires_attachment, gl_account)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  v.code, v.name, v.description, v.max_per_claim, v.req, v.gl
FROM (VALUES
  ('TRV',   'Travel',                    'Bus, train, taxi, fuel, airfare',                      NULL,    true,  '6300'),
  ('LDG',   'Lodging',                   'Hotel and Airbnb stays during business travel',         NULL,    true,  '6310'),
  ('MEAL',  'Meals & entertainment',     'Client meetings, team dinners, daily allowance',        5000::numeric, true, '6320'),
  ('FUEL',  'Vehicle fuel',              'Personal car used for company business',                NULL,    true,  '6330'),
  ('COMM',  'Communication',             'Mobile, internet top-ups',                              3000::numeric, false, '6340'),
  ('OFC',   'Office supplies',           'Stationery, printer ink, small consumables',            NULL,    true,  '6350'),
  ('CLT',   'Client entertainment',      'Coffee meetings, gifts',                                10000::numeric, true, '6360'),
  ('TRN',   'Training & courses',        'Books, online courses, conference fees',                NULL,    true,  '6370'),
  ('MED',   'Medical reimbursement',     'Out-of-pocket medical bills covered by policy',         NULL,    true,  '6380'),
  ('OTH',   'Other',                     'Miscellaneous business expenses',                       NULL,    true,  '6390')
) AS v(code, name, description, max_per_claim, req, gl)
WHERE NOT EXISTS (
  SELECT 1 FROM public.expense_categories ec
  WHERE ec.company_id = '00000000-0000-0000-0000-000000000001' AND ec.code = v.code
);


-- -----------------------------------------------------------------------------
-- Storage bucket for expense receipts
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts', 'expense-receipts', false, 10485760,
  ARRAY['image/png','image/jpeg','image/webp','application/pdf']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS exp_storage_read ON storage.objects;
CREATE POLICY exp_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      public.user_has_permission('expense.approve')
      OR public.user_has_permission('expense.view')
      OR EXISTS (
        SELECT 1 FROM public.expense_claims c
        WHERE storage.objects.name LIKE c.id::text || '/%'
          AND c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS exp_storage_insert ON storage.objects;
CREATE POLICY exp_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (
      public.user_has_permission('expense.approve')
      OR EXISTS (
        SELECT 1 FROM public.expense_claims c
        WHERE storage.objects.name LIKE c.id::text || '/%'
          AND c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
          AND c.status = 'DRAFT'
      )
    )
  );

DROP POLICY IF EXISTS exp_storage_delete ON storage.objects;
CREATE POLICY exp_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      public.user_has_permission('expense.approve')
      OR EXISTS (
        SELECT 1 FROM public.expense_claims c
        WHERE storage.objects.name LIKE c.id::text || '/%'
          AND c.employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid())
          AND c.status = 'DRAFT'
      )
    )
  );

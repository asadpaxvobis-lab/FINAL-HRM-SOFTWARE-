-- =============================================================================
-- 0017_letters.sql
-- Letter templates and issued letters (offer, experience, NOC, warnings, etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.letter_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code         text NOT NULL,
  name         text NOT NULL,
  letter_type  text NOT NULL
                 CHECK (letter_type IN ('OFFER','APPOINTMENT','CONFIRMATION','PROMOTION','EXPERIENCE','SALARY_CERTIFICATE','NOC','WARNING','TERMINATION','RELIEVING','TRANSFER','GENERAL')),
  subject      text NOT NULL,
  body         text NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_letter_templates_company ON public.letter_templates(company_id);
ALTER TABLE public.letter_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lt_tpl_select ON public.letter_templates;
CREATE POLICY lt_tpl_select ON public.letter_templates FOR SELECT TO authenticated
  USING (public.user_has_permission('letter.view') OR public.user_has_permission('letter.create'));

DROP POLICY IF EXISTS lt_tpl_modify ON public.letter_templates;
CREATE POLICY lt_tpl_modify ON public.letter_templates FOR ALL TO authenticated
  USING (public.user_has_permission('letter.template'))
  WITH CHECK (public.user_has_permission('letter.template'));


CREATE TABLE IF NOT EXISTS public.letters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  letter_no     text NOT NULL,
  employee_id   uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  template_id   uuid REFERENCES public.letter_templates(id),
  letter_type   text NOT NULL,
  subject       text NOT NULL,
  body          text NOT NULL,
  status        text NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','ISSUED','SENT','ARCHIVED')),
  issued_at     timestamptz,
  issued_by     uuid REFERENCES public.users(id),
  sent_at       timestamptz,
  signatory_name  text,
  signatory_title text,
  notes         text,
  created_by    uuid REFERENCES public.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, letter_no)
);

CREATE INDEX IF NOT EXISTS idx_letters_employee ON public.letters(employee_id);
CREATE INDEX IF NOT EXISTS idx_letters_status   ON public.letters(status);
CREATE INDEX IF NOT EXISTS idx_letters_type     ON public.letters(letter_type);
ALTER TABLE public.letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS letters_select ON public.letters;
CREATE POLICY letters_select ON public.letters FOR SELECT TO authenticated
  USING (
    public.user_has_permission('letter.view')
    OR public.user_has_permission('letter.create')
    OR (status IN ('ISSUED','SENT') AND employee_id IN (SELECT employee_id FROM public.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS letters_insert ON public.letters;
CREATE POLICY letters_insert ON public.letters FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('letter.create'));

DROP POLICY IF EXISTS letters_update ON public.letters;
CREATE POLICY letters_update ON public.letters FOR UPDATE TO authenticated
  USING (public.user_has_permission('letter.create'))
  WITH CHECK (public.user_has_permission('letter.create'));

DROP POLICY IF EXISTS letters_delete ON public.letters;
CREATE POLICY letters_delete ON public.letters FOR DELETE TO authenticated
  USING (public.user_has_permission('letter.create') AND status = 'DRAFT');

DROP TRIGGER IF EXISTS trg_lt_tpl_updated ON public.letter_templates;
CREATE TRIGGER trg_lt_tpl_updated BEFORE UPDATE ON public.letter_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_letters_updated ON public.letters;
CREATE TRIGGER trg_letters_updated BEFORE UPDATE ON public.letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Grants
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Super Admin','HR Admin','HR Officer')
  AND p.code IN ('letter.view','letter.create','letter.template')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Branch Manager','Department Manager','Payroll Officer','Employee')
  AND p.code = 'letter.view'
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

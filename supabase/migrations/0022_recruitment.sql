-- Phase 9 — Recruitment / ATS: job postings, candidates, interviews

CREATE TABLE IF NOT EXISTS public.job_postings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_no            text NOT NULL,
  title             text NOT NULL,
  branch_id         uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  department_id     uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  designation_id    uuid REFERENCES public.designations(id) ON DELETE SET NULL,
  description       text,
  requirements      text,
  openings          integer NOT NULL DEFAULT 1 CHECK (openings > 0),
  salary_min        numeric(14,2),
  salary_max        numeric(14,2),
  employment_type   text NOT NULL DEFAULT 'Full-time'
    CHECK (employment_type IN ('Full-time','Part-time','Contract','Intern')),
  status            text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','OPEN','ON_HOLD','CLOSED','CANCELLED')),
  posted_at         date,
  closes_at         date,
  hired_count       integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES public.users(id),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, job_no)
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.job_postings(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.job_postings(status);

CREATE TABLE IF NOT EXISTS public.candidates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_no      text NOT NULL,
  job_posting_id    uuid NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,
  full_name         text NOT NULL,
  email             text,
  phone             text,
  cnic              text,
  source            text NOT NULL DEFAULT 'Direct'
    CHECK (source IN ('Direct','Referral','LinkedIn','Job Portal','Agency','Walk-in','Other')),
  stage             text NOT NULL DEFAULT 'APPLIED'
    CHECK (stage IN ('APPLIED','SCREENING','INTERVIEW','OFFER','HIRED','REJECTED','WITHDRAWN')),
  rating            integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  resume_url        text,
  notes             text,
  employee_id       uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  stage_updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, candidate_no)
);

CREATE INDEX IF NOT EXISTS idx_candidates_job ON public.candidates(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_candidates_stage ON public.candidates(stage);

CREATE TABLE IF NOT EXISTS public.recruitment_interviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  scheduled_at      timestamptz NOT NULL,
  interview_type    text NOT NULL DEFAULT 'HR'
    CHECK (interview_type IN ('Phone','HR','Technical','Manager','Final','Other')),
  location          text,
  interviewer_name  text,
  status            text NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED','NO_SHOW')),
  rating            integer CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  feedback          text,
  completed_at      timestamptz,
  created_by        uuid REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON public.recruitment_interviews(candidate_id);

ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_interviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jobs_select ON public.job_postings;
CREATE POLICY jobs_select ON public.job_postings FOR SELECT TO authenticated
  USING (public.user_has_permission('recruitment.view') OR public.user_has_permission('recruitment.manage'));

DROP POLICY IF EXISTS jobs_modify ON public.job_postings;
CREATE POLICY jobs_modify ON public.job_postings FOR ALL TO authenticated
  USING (public.user_has_permission('recruitment.manage'))
  WITH CHECK (public.user_has_permission('recruitment.manage'));

DROP POLICY IF EXISTS cand_select ON public.candidates;
CREATE POLICY cand_select ON public.candidates FOR SELECT TO authenticated
  USING (
    public.user_has_permission('recruitment.view')
    OR public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
    OR public.user_has_permission('recruitment.offer')
    OR public.user_has_permission('recruitment.hire')
  );

DROP POLICY IF EXISTS cand_insert ON public.candidates;
CREATE POLICY cand_insert ON public.candidates FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('recruitment.manage'));

DROP POLICY IF EXISTS cand_update ON public.candidates;
CREATE POLICY cand_update ON public.candidates FOR UPDATE TO authenticated
  USING (
    public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
    OR public.user_has_permission('recruitment.offer')
    OR public.user_has_permission('recruitment.hire')
  )
  WITH CHECK (
    public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
    OR public.user_has_permission('recruitment.offer')
    OR public.user_has_permission('recruitment.hire')
  );

DROP POLICY IF EXISTS cand_delete ON public.candidates;
CREATE POLICY cand_delete ON public.candidates FOR DELETE TO authenticated
  USING (public.user_has_permission('recruitment.manage'));

DROP POLICY IF EXISTS int_select ON public.recruitment_interviews;
CREATE POLICY int_select ON public.recruitment_interviews FOR SELECT TO authenticated
  USING (
    public.user_has_permission('recruitment.view')
    OR public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
  );

DROP POLICY IF EXISTS int_modify ON public.recruitment_interviews;
CREATE POLICY int_modify ON public.recruitment_interviews FOR ALL TO authenticated
  USING (
    public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
  )
  WITH CHECK (
    public.user_has_permission('recruitment.manage')
    OR public.user_has_permission('recruitment.interview')
  );

DROP TRIGGER IF EXISTS trg_jobs_updated ON public.job_postings;
CREATE TRIGGER trg_jobs_updated BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_candidates_updated ON public.candidates;
CREATE TRIGGER trg_candidates_updated BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_interviews_updated ON public.recruitment_interviews;
CREATE TRIGGER trg_interviews_updated BEFORE UPDATE ON public.recruitment_interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Super Admin','HR Admin','HR Officer')
  AND p.code IN ('recruitment.view','recruitment.manage','recruitment.interview','recruitment.offer','recruitment.hire')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Department Manager','Branch Manager')
  AND p.code IN ('recruitment.view','recruitment.interview')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

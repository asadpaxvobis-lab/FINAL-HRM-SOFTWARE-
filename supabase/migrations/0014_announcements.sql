-- =============================================================================
-- 0014_announcements.sql
-- Phase 8a — Announcements / company-wide notice board.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL,
  body            text NOT NULL,
  category        text NOT NULL DEFAULT 'GENERAL'
                    CHECK (category IN ('GENERAL','POLICY','EVENT','HOLIDAY','URGENT','HR','IT','FINANCE')),
  priority        text NOT NULL DEFAULT 'NORMAL'
                    CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status          text NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  pinned          boolean NOT NULL DEFAULT false,
  acknowledgement_required boolean NOT NULL DEFAULT false,
  publish_at      timestamptz,
  expires_at      timestamptz,
  published_at    timestamptz,
  -- Targeting
  target_type     text NOT NULL DEFAULT 'ALL'
                    CHECK (target_type IN ('ALL','DEPARTMENT','BRANCH','ROLE','EMPLOYEE')),
  target_ids      jsonb,
  -- Attachment
  attachment_url  text,
  attachment_name text,
  -- Audit
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_company ON public.announcements(company_id);
CREATE INDEX IF NOT EXISTS idx_announcements_status ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_announcements_publish ON public.announcements(publish_at);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ann_select ON public.announcements;
CREATE POLICY ann_select ON public.announcements FOR SELECT TO authenticated
  USING (
    public.user_has_permission('announcement.view')
    AND (
      status = 'PUBLISHED'
      OR created_by = auth.uid()
      OR public.user_has_permission('announcement.update')
    )
  );

DROP POLICY IF EXISTS ann_insert ON public.announcements;
CREATE POLICY ann_insert ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission('announcement.create'));

DROP POLICY IF EXISTS ann_update ON public.announcements;
CREATE POLICY ann_update ON public.announcements FOR UPDATE TO authenticated
  USING (
    public.user_has_permission('announcement.update')
    OR (created_by = auth.uid() AND status = 'DRAFT')
  )
  WITH CHECK (
    public.user_has_permission('announcement.update')
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS ann_delete ON public.announcements;
CREATE POLICY ann_delete ON public.announcements FOR DELETE TO authenticated
  USING (
    public.user_has_permission('announcement.delete')
    OR (created_by = auth.uid() AND status = 'DRAFT')
  );


-- -----------------------------------------------------------------------------
-- announcement_reads — per-user read receipts and acknowledgements
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id   uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at           timestamptz NOT NULL DEFAULT now(),
  acknowledged_at   timestamptz,
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_reads_user ON public.announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_ann_reads_ann  ON public.announcement_reads(announcement_id);
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_select ON public.announcement_reads;
CREATE POLICY ar_select ON public.announcement_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_permission('announcement.update'));

DROP POLICY IF EXISTS ar_insert ON public.announcement_reads;
CREATE POLICY ar_insert ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS ar_update ON public.announcement_reads;
CREATE POLICY ar_update ON public.announcement_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ann_updated ON public.announcements;
CREATE TRIGGER trg_ann_updated BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- -----------------------------------------------------------------------------
-- Storage bucket for announcement attachments
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'announcement-files',
  'announcement-files',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','application/pdf',
        'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS ann_files_read ON storage.objects;
CREATE POLICY ann_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'announcement-files' AND public.user_has_permission('announcement.view'));

DROP POLICY IF EXISTS ann_files_write ON storage.objects;
CREATE POLICY ann_files_write ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'announcement-files' AND public.user_has_permission('announcement.create'));

DROP POLICY IF EXISTS ann_files_update ON storage.objects;
CREATE POLICY ann_files_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'announcement-files' AND public.user_has_permission('announcement.create'));

DROP POLICY IF EXISTS ann_files_delete ON storage.objects;
CREATE POLICY ann_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'announcement-files' AND (public.user_has_permission('announcement.delete') OR public.user_has_permission('announcement.update')));


-- -----------------------------------------------------------------------------
-- Grant announcement permissions to all roles (everyone should view; create/update for HR+)
-- -----------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Admin','Super Admin','HR Admin','HR Officer','Payroll Officer','Employee')
  AND p.code = 'announcement.view'
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r CROSS JOIN public.permissions p
WHERE r.name IN ('Admin','Super Admin','HR Admin','HR Officer')
  AND p.code IN ('announcement.create','announcement.update','announcement.delete')
  AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

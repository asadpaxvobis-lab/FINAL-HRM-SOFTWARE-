-- Phase 3: Attendance core schema

CREATE TABLE public.attendance_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id     uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name          text NOT NULL,
  serial_no     text,
  device_type   text NOT NULL DEFAULT 'ZKTeco' CHECK (device_type IN ('ZKTeco','Face Kiosk','Mobile','Manual')),
  ip_address    text,
  push_token    text UNIQUE,
  last_seen_at  timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_company ON public.attendance_devices (company_id);

CREATE TABLE public.attendance_punches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  device_id       uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  punch_at        timestamptz NOT NULL,
  punch_type      text NOT NULL DEFAULT 'auto' CHECK (punch_type IN ('in','out','auto')),
  source          text NOT NULL DEFAULT 'manual' CHECK (source IN ('zkteco','face_kiosk','mobile','manual','import')),
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  notes           text,
  raw_payload     jsonb,
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_punches_employee_time ON public.attendance_punches (employee_id, punch_at DESC);
CREATE INDEX idx_punches_company_time ON public.attendance_punches (company_id, punch_at DESC);
CREATE INDEX idx_punches_device ON public.attendance_punches (device_id);

CREATE TABLE public.attendance_daily (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id         uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date     date NOT NULL,
  shift_id            uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  scheduled_start     timestamptz,
  scheduled_end       timestamptz,
  first_in            timestamptz,
  last_out            timestamptz,
  worked_minutes      integer NOT NULL DEFAULT 0,
  late_minutes        integer NOT NULL DEFAULT 0,
  early_out_minutes   integer NOT NULL DEFAULT 0,
  overtime_minutes    integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'Absent' CHECK (status IN ('Present','Absent','Leave','Holiday','Weekly Off','Half Day','Late')),
  is_weekly_off       boolean NOT NULL DEFAULT false,
  is_holiday          boolean NOT NULL DEFAULT false,
  notes               text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, attendance_date)
);

CREATE INDEX idx_daily_employee_date ON public.attendance_daily (employee_id, attendance_date DESC);
CREATE INDEX idx_daily_company_date ON public.attendance_daily (company_id, attendance_date DESC);

CREATE TABLE public.attendance_corrections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  reason          text NOT NULL,
  proposed_in     timestamptz,
  proposed_out    timestamptz,
  status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  approver_id     uuid REFERENCES public.users(id),
  decided_at      timestamptz,
  decision_note   text,
  requested_by    uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_employee ON public.attendance_corrections (employee_id, attendance_date DESC);
CREATE INDEX idx_corrections_status ON public.attendance_corrections (status);

-- New permission for managing devices
INSERT INTO public.permissions (module, action, description, is_system)
SELECT 'attendance', 'device', 'Manage attendance devices', true
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE module='attendance' AND action='device');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Super Admin'
  AND p.code = 'attendance.device'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

ALTER TABLE public.attendance_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_select ON public.attendance_devices
  FOR SELECT USING (company_id = public.current_user_company_id());

CREATE POLICY devices_modify ON public.attendance_devices
  FOR ALL USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.device')
  )
  WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.device')
  );

CREATE POLICY punches_select ON public.attendance_punches
  FOR SELECT USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.view')
  );

CREATE POLICY punches_insert ON public.attendance_punches
  FOR INSERT WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.create')
  );

CREATE POLICY punches_update ON public.attendance_punches
  FOR UPDATE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.update')
  );

CREATE POLICY punches_delete ON public.attendance_punches
  FOR DELETE USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.update')
  );

CREATE POLICY daily_select ON public.attendance_daily
  FOR SELECT USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.view')
  );

CREATE POLICY daily_modify ON public.attendance_daily
  FOR ALL USING (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.update')
  )
  WITH CHECK (
    company_id = public.current_user_company_id()
    AND public.user_has_permission('attendance.update')
  );

CREATE POLICY corrections_select ON public.attendance_corrections
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_corrections.employee_id
        AND e.company_id = public.current_user_company_id()
    )
    AND public.user_has_permission('attendance.view')
  );

CREATE POLICY corrections_insert ON public.attendance_corrections
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_corrections.employee_id
        AND e.company_id = public.current_user_company_id()
    )
  );

CREATE POLICY corrections_decide ON public.attendance_corrections
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_corrections.employee_id
        AND e.company_id = public.current_user_company_id()
    )
    AND public.user_has_permission('attendance.approve')
  );

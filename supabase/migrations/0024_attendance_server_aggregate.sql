-- Phase 3: Server-side attendance aggregation + device PIN mapping

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS device_pin integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_company_device_pin
  ON public.employees (company_id, device_pin)
  WHERE device_pin IS NOT NULL;

COMMENT ON COLUMN public.employees.device_pin IS 'ZKTeco / biometric user ID (PIN) on attendance devices';

-- ---------------------------------------------------------------------
-- Recompute one employee × date (mirrors apps/web/src/lib/attendance.ts)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_attendance_for_employee(
  p_employee_id uuid,
  p_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_company_tz text;
  v_shift_id uuid;
  v_shift_start time;
  v_shift_end time;
  v_break_minutes integer;
  v_grace_late integer;
  v_grace_early integer;
  v_is_night boolean;
  v_weekly_off text[];
  v_weekday text;
  v_is_holiday boolean;
  v_is_weekly_off boolean;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_punch_count integer;
  v_metrics record;
  v_status text;
  v_worked integer;
  v_late integer;
BEGIN
  SELECT e.company_id, COALESCE(c.timezone, 'Asia/Karachi')
  INTO v_company_id, v_company_tz
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = p_employee_id;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  SELECT esa.shift_id, s.start_time, s.end_time, s.break_minutes,
         s.grace_late_minutes, s.grace_early_minutes, s.is_night, esa.weekly_off
  INTO v_shift_id, v_shift_start, v_shift_end, v_break_minutes,
       v_grace_late, v_grace_early, v_is_night, v_weekly_off
  FROM public.employee_shift_assignments esa
  JOIN public.shifts s ON s.id = esa.shift_id
  WHERE esa.employee_id = p_employee_id
    AND esa.effective_from <= p_date
    AND (esa.effective_to IS NULL OR esa.effective_to >= p_date)
  ORDER BY esa.effective_from DESC
  LIMIT 1;

  v_shift_start := COALESCE(v_shift_start, time '09:00');
  v_shift_end := COALESCE(v_shift_end, time '17:00');
  v_break_minutes := COALESCE(v_break_minutes, 0);
  v_grace_late := COALESCE(v_grace_late, 15);
  v_grace_early := COALESCE(v_grace_early, 15);
  v_is_night := COALESCE(v_is_night, false);

  v_weekday := (ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[EXTRACT(DOW FROM p_date)::int + 1];
  v_is_weekly_off := COALESCE(v_weekly_off, ARRAY[]::text[]) @> ARRAY[v_weekday];

  SELECT EXISTS (
    SELECT 1 FROM public.holidays h
    WHERE h.company_id = v_company_id
      AND h.holiday_date = p_date
      AND h.is_active = true
      AND h.branch_id IS NULL
  ) INTO v_is_holiday;

  SELECT MIN(p.punch_at), MAX(p.punch_at), COUNT(*)::integer
  INTO v_first_in, v_last_out, v_punch_count
  FROM public.attendance_punches p
  WHERE p.employee_id = p_employee_id
    AND p.company_id = v_company_id
    AND (p.punch_at AT TIME ZONE v_company_tz)::date = p_date;

  IF v_punch_count <= 1 THEN
    v_last_out := NULL;
  END IF;

  SELECT * INTO v_metrics FROM public.compute_attendance_metrics(
    p_date,
    v_first_in,
    v_last_out,
    v_shift_start,
    v_shift_end,
    v_break_minutes,
    v_grace_late,
    v_grace_early,
    v_is_night,
    v_company_tz,
    NULL,
    NULL
  );

  v_worked := v_metrics.worked_minutes;
  v_late := v_metrics.late_minutes;

  IF v_is_holiday THEN
    v_status := 'Holiday';
  ELSIF v_is_weekly_off THEN
    v_status := 'Weekly Off';
  ELSIF v_punch_count = 0 THEN
    v_status := 'Absent';
  ELSIF v_worked >= (CASE WHEN v_shift_id IS NOT NULL THEN 360 ELSE 240 END) AND v_late > 0 THEN
    v_status := 'Late';
  ELSIF v_worked >= (CASE WHEN v_shift_id IS NOT NULL THEN 360 ELSE 240 END) THEN
    v_status := 'Present';
  ELSIF v_worked > 0 THEN
    v_status := 'Half Day';
  ELSE
    v_status := 'Absent';
  END IF;

  INSERT INTO public.attendance_daily (
    company_id, employee_id, attendance_date, shift_id,
    scheduled_start, scheduled_end, first_in, last_out,
    worked_minutes, late_minutes, early_out_minutes, overtime_minutes,
    status, is_weekly_off, is_holiday, updated_at
  ) VALUES (
    v_company_id, p_employee_id, p_date, v_shift_id,
    v_metrics.scheduled_start, v_metrics.scheduled_end,
    v_first_in, v_last_out,
    v_metrics.worked_minutes, v_metrics.late_minutes,
    v_metrics.early_out_minutes, v_metrics.overtime_minutes,
    v_status, v_is_weekly_off, v_is_holiday, now()
  )
  ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
    shift_id = EXCLUDED.shift_id,
    scheduled_start = EXCLUDED.scheduled_start,
    scheduled_end = EXCLUDED.scheduled_end,
    first_in = EXCLUDED.first_in,
    last_out = EXCLUDED.last_out,
    worked_minutes = EXCLUDED.worked_minutes,
    late_minutes = EXCLUDED.late_minutes,
    early_out_minutes = EXCLUDED.early_out_minutes,
    overtime_minutes = EXCLUDED.overtime_minutes,
    status = CASE
      WHEN attendance_daily.status = 'Leave' THEN attendance_daily.status
      ELSE EXCLUDED.status
    END,
    is_weekly_off = EXCLUDED.is_weekly_off,
    is_holiday = EXCLUDED.is_holiday,
    updated_at = now();
END;
$$;

-- ---------------------------------------------------------------------
-- Recompute all active employees for a company × date
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_attendance_daily(
  p_company_id uuid,
  p_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp record;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.user_has_permission('attendance.update') THEN
      RAISE EXCEPTION 'attendance.update permission required';
    END IF;
    IF p_company_id IS DISTINCT FROM public.current_user_company_id() THEN
      RAISE EXCEPTION 'company mismatch';
    END IF;
  END IF;

  FOR v_emp IN
    SELECT id FROM public.employees
    WHERE company_id = p_company_id AND is_active = true
  LOOP
    PERFORM public.recompute_attendance_for_employee(v_emp.id, p_date);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_attendance_daily(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_attendance_for_employee(uuid, date) TO authenticated, service_role;

-- Auto-reaggregate when punches change
CREATE OR REPLACE FUNCTION public.trg_attendance_punch_reaggregate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_old_date date;
  v_new_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT COALESCE(c.timezone, 'Asia/Karachi') INTO v_tz
    FROM public.companies c WHERE c.id = OLD.company_id;
    PERFORM public.recompute_attendance_for_employee(
      OLD.employee_id,
      (OLD.punch_at AT TIME ZONE v_tz)::date
    );
    RETURN OLD;
  END IF;

  SELECT COALESCE(c.timezone, 'Asia/Karachi') INTO v_tz
  FROM public.companies c WHERE c.id = NEW.company_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_attendance_for_employee(
      NEW.employee_id,
      (NEW.punch_at AT TIME ZONE v_tz)::date
    );
    RETURN NEW;
  END IF;

  -- UPDATE
  v_old_date := (OLD.punch_at AT TIME ZONE v_tz)::date;
  v_new_date := (NEW.punch_at AT TIME ZONE v_tz)::date;
  PERFORM public.recompute_attendance_for_employee(OLD.employee_id, v_old_date);
  IF OLD.employee_id IS DISTINCT FROM NEW.employee_id OR v_old_date IS DISTINCT FROM v_new_date THEN
    PERFORM public.recompute_attendance_for_employee(NEW.employee_id, v_new_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_punch_reaggregate ON public.attendance_punches;
CREATE TRIGGER trg_attendance_punch_reaggregate
  AFTER INSERT OR UPDATE OR DELETE ON public.attendance_punches
  FOR EACH ROW EXECUTE FUNCTION public.trg_attendance_punch_reaggregate();

-- Realtime for live dashboard feed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_punches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_punches;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_daily'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_daily;
  END IF;
END $$;

-- Persist manual attendance edits as punches + recompute (keeps late/OT in sync).

CREATE OR REPLACE FUNCTION public.set_manual_attendance_day(
  p_employee_id uuid,
  p_date date,
  p_first_in timestamptz DEFAULT NULL,
  p_last_out timestamptz DEFAULT NULL,
  p_status text DEFAULT 'Present',
  p_notes text DEFAULT NULL,
  p_is_holiday boolean DEFAULT false,
  p_is_weekly_off boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_tz text;
  v_daily_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_has_permission('attendance.update') THEN
    RAISE EXCEPTION 'attendance.update permission required';
  END IF;

  SELECT e.company_id, COALESCE(c.timezone, 'Asia/Karachi')
  INTO v_company_id, v_tz
  FROM public.employees e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = p_employee_id;

  IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM public.current_user_company_id() THEN
    RAISE EXCEPTION 'Employee not found in your company';
  END IF;

  DELETE FROM public.attendance_punches p
  WHERE p.employee_id = p_employee_id
    AND p.company_id = v_company_id
    AND p.source = 'manual'
    AND (p.punch_at AT TIME ZONE v_tz)::date = p_date;

  IF p_first_in IS NOT NULL THEN
    INSERT INTO public.attendance_punches (
      company_id, employee_id, punch_at, punch_type, source, notes, created_by
    ) VALUES (
      v_company_id, p_employee_id, p_first_in, 'in', 'manual', p_notes, auth.uid()
    );
  END IF;

  IF p_last_out IS NOT NULL THEN
    INSERT INTO public.attendance_punches (
      company_id, employee_id, punch_at, punch_type, source, notes, created_by
    ) VALUES (
      v_company_id, p_employee_id, p_last_out, 'out', 'manual', p_notes, auth.uid()
    );
  END IF;

  PERFORM public.recompute_attendance_for_employee(p_employee_id, p_date);

  UPDATE public.attendance_daily ad
  SET
    status = COALESCE(p_status, ad.status),
    notes = p_notes,
    is_holiday = COALESCE(p_is_holiday, ad.is_holiday),
    is_weekly_off = COALESCE(p_is_weekly_off, ad.is_weekly_off),
    updated_at = now()
  WHERE ad.employee_id = p_employee_id
    AND ad.attendance_date = p_date
  RETURNING ad.id INTO v_daily_id;

  IF v_daily_id IS NULL THEN
    INSERT INTO public.attendance_daily (
      company_id, employee_id, attendance_date, status, notes, is_holiday, is_weekly_off
    ) VALUES (
      v_company_id, p_employee_id, p_date, COALESCE(p_status, 'Absent'),
      p_notes, COALESCE(p_is_holiday, false), COALESCE(p_is_weekly_off, false)
    )
    RETURNING id INTO v_daily_id;
  END IF;

  RETURN v_daily_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_manual_attendance_day(uuid, date, timestamptz, timestamptz, text, text, boolean, boolean) TO authenticated;

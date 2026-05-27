-- Overtime must not include late minutes (late is start-of-day only, not end-of-day OT).

CREATE OR REPLACE FUNCTION public.compute_attendance_metrics(
  p_date date,
  p_first_in timestamptz,
  p_last_out timestamptz,
  p_shift_start time,
  p_shift_end time,
  p_break_minutes integer,
  p_grace_late integer,
  p_grace_early integer,
  p_is_night boolean,
  p_timezone text DEFAULT 'Asia/Karachi',
  p_scheduled_start timestamptz DEFAULT NULL,
  p_scheduled_end timestamptz DEFAULT NULL
)
RETURNS TABLE (
  worked_minutes integer,
  late_minutes integer,
  early_out_minutes integer,
  overtime_minutes integer,
  scheduled_start timestamptz,
  scheduled_end timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'Asia/Karachi');
  v_sched_start timestamptz;
  v_sched_end timestamptz;
  v_worked integer := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot integer := 0;
  v_late_raw integer;
  v_early_raw integer;
BEGIN
  v_sched_start := COALESCE(
    p_scheduled_start,
    timezone(v_tz, (p_date + p_shift_start)::timestamp)
  );
  v_sched_end := COALESCE(
    p_scheduled_end,
    timezone(v_tz, (p_date + p_shift_end)::timestamp)
  );
  IF p_is_night AND v_sched_end <= v_sched_start THEN
    v_sched_end := v_sched_end + interval '1 day';
  END IF;

  IF p_first_in IS NOT NULL AND p_last_out IS NOT NULL THEN
    v_worked := GREATEST(0, (EXTRACT(EPOCH FROM (p_last_out - p_first_in)) / 60)::integer - COALESCE(p_break_minutes, 0));
  END IF;

  IF p_first_in IS NOT NULL AND v_sched_start IS NOT NULL THEN
    v_late_raw := GREATEST(0, (EXTRACT(EPOCH FROM (p_first_in - v_sched_start)) / 60)::integer);
    v_late := GREATEST(0, v_late_raw - COALESCE(p_grace_late, 0));
  END IF;

  IF p_last_out IS NOT NULL AND v_sched_end IS NOT NULL THEN
    IF p_last_out < v_sched_end THEN
      v_early_raw := GREATEST(0, (EXTRACT(EPOCH FROM (v_sched_end - p_last_out)) / 60)::integer);
      v_early := GREATEST(0, v_early_raw - COALESCE(p_grace_early, 0));
    ELSIF p_last_out > v_sched_end THEN
      v_ot := GREATEST(0, (EXTRACT(EPOCH FROM (p_last_out - v_sched_end)) / 60)::integer);
    END IF;
  ELSIF v_worked > 0 THEN
    v_ot := GREATEST(0, v_worked - 480);
  END IF;

  IF v_late > 0 AND v_ot > 0 THEN
    v_ot := GREATEST(0, v_ot - v_late);
  END IF;

  RETURN QUERY SELECT v_worked, v_late, v_early, v_ot, v_sched_start, v_sched_end;
END;
$$;

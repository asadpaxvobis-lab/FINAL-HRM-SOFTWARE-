-- Backfill attendance_daily late / early-out / overtime from punch times and shift rules.
-- Mirrors client logic in apps/web/src/lib/attendance.ts (DEFAULT_SHIFT + computeAttendanceMetrics).

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
  v_sched_start timestamptz;
  v_sched_end timestamptz;
  v_worked integer := 0;
  v_late integer := 0;
  v_early integer := 0;
  v_ot integer := 0;
  v_late_raw integer;
  v_early_raw integer;
BEGIN
  v_sched_start := COALESCE(p_scheduled_start, (p_date + p_shift_start)::timestamptz);
  v_sched_end := COALESCE(p_scheduled_end, (p_date + p_shift_end)::timestamptz);
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

  RETURN QUERY SELECT v_worked, v_late, v_early, v_ot, v_sched_start, v_sched_end;
END;
$$;

-- Resolve effective shift per row, recompute metrics, refresh status.
WITH resolved AS (
  SELECT
    ad.id,
    ad.attendance_date,
    ad.first_in,
    ad.last_out,
    ad.status AS old_status,
    ad.is_holiday,
    ad.is_weekly_off,
    COALESCE(ad.shift_id, asn.shift_id) AS resolved_shift_id,
    COALESCE(s.start_time, time '09:00') AS shift_start,
    COALESCE(s.end_time, time '17:00') AS shift_end,
    COALESCE(s.break_minutes, 0) AS break_minutes,
    COALESCE(s.grace_late_minutes, 15) AS grace_late,
    COALESCE(s.grace_early_minutes, 15) AS grace_early,
    COALESCE(s.is_night, false) AS is_night,
    ad.scheduled_start,
    ad.scheduled_end
  FROM public.attendance_daily ad
  LEFT JOIN LATERAL (
    SELECT esa.shift_id
    FROM public.employee_shift_assignments esa
    WHERE esa.employee_id = ad.employee_id
      AND esa.effective_from <= ad.attendance_date
      AND (esa.effective_to IS NULL OR esa.effective_to >= ad.attendance_date)
    ORDER BY esa.effective_from DESC
    LIMIT 1
  ) asn ON true
  LEFT JOIN public.shifts s ON s.id = COALESCE(ad.shift_id, asn.shift_id)
  WHERE ad.first_in IS NOT NULL
),
computed AS (
  SELECT
    r.id,
    r.resolved_shift_id,
    r.is_holiday,
    r.is_weekly_off,
    r.first_in,
    m.worked_minutes,
    m.late_minutes,
    m.early_out_minutes,
    m.overtime_minutes,
    m.scheduled_start,
    m.scheduled_end,
    CASE
      WHEN r.is_holiday THEN 'Holiday'
      WHEN r.is_weekly_off THEN 'Weekly Off'
      WHEN r.first_in IS NULL THEN 'Absent'
      WHEN m.worked_minutes >= CASE WHEN r.resolved_shift_id IS NOT NULL THEN 360 ELSE 240 END
           AND m.late_minutes > 0 THEN 'Late'
      WHEN m.worked_minutes >= CASE WHEN r.resolved_shift_id IS NOT NULL THEN 360 ELSE 240 END THEN 'Present'
      WHEN m.worked_minutes > 0 THEN 'Half Day'
      ELSE 'Absent'
    END AS new_status
  FROM resolved r
  CROSS JOIN LATERAL public.compute_attendance_metrics(
    r.attendance_date,
    r.first_in,
    r.last_out,
    r.shift_start,
    r.shift_end,
    r.break_minutes,
    r.grace_late,
    r.grace_early,
    r.is_night,
    r.scheduled_start,
    r.scheduled_end
  ) m
)
UPDATE public.attendance_daily ad
SET
  shift_id = COALESCE(ad.shift_id, c.resolved_shift_id),
  scheduled_start = c.scheduled_start,
  scheduled_end = c.scheduled_end,
  worked_minutes = c.worked_minutes,
  late_minutes = c.late_minutes,
  early_out_minutes = c.early_out_minutes,
  overtime_minutes = c.overtime_minutes,
  status = CASE
    WHEN ad.status IN ('Leave') THEN ad.status
    ELSE c.new_status
  END,
  updated_at = now()
FROM computed c
WHERE ad.id = c.id;

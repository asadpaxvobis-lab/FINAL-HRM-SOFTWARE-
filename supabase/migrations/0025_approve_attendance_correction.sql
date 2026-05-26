-- Approve/reject corrections server-side (approvers often lack attendance.create).

CREATE OR REPLACE FUNCTION public.approve_attendance_correction(
  p_correction_id uuid,
  p_status text,
  p_decision_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corr public.attendance_corrections%ROWTYPE;
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_has_permission('attendance.approve') THEN
    RAISE EXCEPTION 'attendance.approve permission required';
  END IF;

  IF p_status NOT IN ('Approved', 'Rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_corr
  FROM public.attendance_corrections
  WHERE id = p_correction_id;

  IF v_corr.id IS NULL THEN
    RAISE EXCEPTION 'Correction not found';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.employees
  WHERE id = v_corr.employee_id;

  IF v_company_id IS DISTINCT FROM public.current_user_company_id() THEN
    RAISE EXCEPTION 'company mismatch';
  END IF;

  IF v_corr.status <> 'Pending' THEN
    RAISE EXCEPTION 'Correction is not pending';
  END IF;

  UPDATE public.attendance_corrections
  SET
    status = p_status,
    decision_note = NULLIF(trim(p_decision_note), ''),
    decided_at = now(),
    approver_id = auth.uid()
  WHERE id = p_correction_id;

  IF p_status = 'Approved' THEN
    IF v_corr.proposed_in IS NOT NULL THEN
      INSERT INTO public.attendance_punches (
        company_id, employee_id, punch_at, punch_type, source, notes, created_by
      ) VALUES (
        v_company_id,
        v_corr.employee_id,
        v_corr.proposed_in,
        'in',
        'manual',
        left('Correction approved: ' || v_corr.reason, 500),
        auth.uid()
      );
    END IF;

    IF v_corr.proposed_out IS NOT NULL THEN
      INSERT INTO public.attendance_punches (
        company_id, employee_id, punch_at, punch_type, source, notes, created_by
      ) VALUES (
        v_company_id,
        v_corr.employee_id,
        v_corr.proposed_out,
        'out',
        'manual',
        left('Correction approved: ' || v_corr.reason, 500),
        auth.uid()
      );
    END IF;

    PERFORM public.recompute_attendance_for_employee(v_corr.employee_id, v_corr.attendance_date);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_attendance_correction(uuid, text, text) TO authenticated;

-- Allow approvers to run day re-aggregate (not only attendance.update).
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
    IF NOT (
      public.user_has_permission('attendance.update')
      OR public.user_has_permission('attendance.approve')
    ) THEN
      RAISE EXCEPTION 'attendance.update or attendance.approve permission required';
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

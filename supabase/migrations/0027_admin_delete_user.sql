-- Remove login users from the admin UI (public.users + auth.users).

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.user_has_permission('user.delete') THEN
    RAISE EXCEPTION 'user.delete permission required';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  v_company_id := public.current_user_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Company not found for current user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id AND u.company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'User not found in your company';
  END IF;

  -- Clear optional user references so DELETE on public.users succeeds.
  UPDATE public.leave_applications SET approver_id = NULL WHERE approver_id = p_user_id;
  UPDATE public.leave_applications SET requested_by = NULL WHERE requested_by = p_user_id;
  UPDATE public.expense_claims SET decided_by = NULL WHERE decided_by = p_user_id;
  UPDATE public.attendance_punches SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.attendance_corrections SET approver_id = NULL WHERE approver_id = p_user_id;
  UPDATE public.attendance_corrections SET requested_by = NULL WHERE requested_by = p_user_id;
  UPDATE public.employee_shift_assignments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.employee_salary_history SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.employee_documents SET uploaded_by = NULL WHERE uploaded_by = p_user_id;
  UPDATE public.letters SET issued_by = NULL WHERE issued_by = p_user_id;
  UPDATE public.letters SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.loans SET decided_by = NULL WHERE decided_by = p_user_id;
  UPDATE public.payroll_periods SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.payroll_periods SET finalized_by = NULL WHERE finalized_by = p_user_id;
  UPDATE public.payroll_runs SET run_by = NULL WHERE run_by = p_user_id;
  UPDATE public.overtime_requests SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE public.resignations SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE public.resignations SET settlement_processed_by = NULL WHERE settlement_processed_by = p_user_id;
  UPDATE public.resignation_clearance_steps SET cleared_by = NULL WHERE cleared_by = p_user_id;
  UPDATE public.job_postings SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.recruitment_interviews SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.announcements SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.users SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.user_roles SET assigned_by = NULL WHERE assigned_by = p_user_id;

  DELETE FROM public.users WHERE id = p_user_id;

  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

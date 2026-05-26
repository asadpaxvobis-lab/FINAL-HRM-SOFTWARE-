-- Allow authenticated users to append audit log entries for their company
CREATE POLICY audit_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_user_company_id());

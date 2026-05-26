-- Phase 2: Storage bucket for employee documents

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS emp_docs_read ON storage.objects;
CREATE POLICY emp_docs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.user_has_permission('employee.view')
  );

DROP POLICY IF EXISTS emp_docs_insert ON storage.objects;
CREATE POLICY emp_docs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND public.user_has_permission('employee.update')
  );

DROP POLICY IF EXISTS emp_docs_update ON storage.objects;
CREATE POLICY emp_docs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.user_has_permission('employee.update')
  );

DROP POLICY IF EXISTS emp_docs_delete ON storage.objects;
CREATE POLICY emp_docs_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.user_has_permission('employee.update')
  );

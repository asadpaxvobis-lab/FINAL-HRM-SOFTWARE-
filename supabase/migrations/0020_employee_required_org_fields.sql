-- Require branch, department, designation, and joining date on every employee.

-- Backfill existing rows before NOT NULL constraints.
UPDATE public.employees e
SET date_of_joining = COALESCE(e.date_of_joining, e.created_at::date)
WHERE e.date_of_joining IS NULL;

UPDATE public.employees e
SET branch_id = (
  SELECT b.id
  FROM public.branches b
  WHERE b.company_id = e.company_id AND b.is_active
  ORDER BY b.name
  LIMIT 1
)
WHERE e.branch_id IS NULL;

UPDATE public.employees e
SET department_id = (
  SELECT d.id
  FROM public.departments d
  WHERE d.company_id = e.company_id AND d.is_active
  ORDER BY d.name
  LIMIT 1
)
WHERE e.department_id IS NULL;

UPDATE public.employees e
SET designation_id = (
  SELECT d.id
  FROM public.designations d
  WHERE d.company_id = e.company_id AND d.is_active
  ORDER BY d.title
  LIMIT 1
)
WHERE e.designation_id IS NULL;

ALTER TABLE public.employees
  ALTER COLUMN branch_id SET NOT NULL,
  ALTER COLUMN department_id SET NOT NULL,
  ALTER COLUMN designation_id SET NOT NULL,
  ALTER COLUMN date_of_joining SET NOT NULL;

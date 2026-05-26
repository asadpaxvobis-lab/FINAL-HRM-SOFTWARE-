import { supabase } from '@/lib/supabase'
import { nextCode } from '@/lib/codegen'

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'CANCELLED'] as const
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'] as const
export const CANDIDATE_SOURCES = ['Direct', 'Referral', 'LinkedIn', 'Job Portal', 'Agency', 'Walk-in', 'Other'] as const
export const CANDIDATE_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const
export const INTERVIEW_TYPES = ['Phone', 'HR', 'Technical', 'Manager', 'Final', 'Other'] as const
export const INTERVIEW_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const

export type CandidateStage = (typeof CANDIDATE_STAGES)[number]

export const STAGE_LABELS: Record<CandidateStage, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
}

export const ACTIVE_PIPELINE_STAGES: CandidateStage[] = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER']

export async function hireCandidate(
  candidateId: string,
  companyId: string,
  joiningDate: string
): Promise<{ employeeId: string; employeeCode: string }> {
  const { data: cand, error: cErr } = await supabase
    .from('candidates')
    .select(
      `id, full_name, email, phone, cnic, job_posting_id,
       job_postings(branch_id, department_id, designation_id, title, hired_count, openings)`
    )
    .eq('id', candidateId)
    .single()
  if (cErr || !cand) throw cErr ?? new Error('Candidate not found')

  const job = Array.isArray(cand.job_postings) ? cand.job_postings[0] : cand.job_postings
  if (!job?.branch_id || !job?.department_id || !job?.designation_id) {
    throw new Error('Job posting must have branch, department, and designation before hiring')
  }

  const parts = String(cand.full_name).trim().split(/\s+/)
  const first_name = parts[0] ?? cand.full_name
  const last_name = parts.slice(1).join(' ') || null

  const employee_code = await nextCode({
    table: 'employees',
    column: 'employee_code',
    prefix: 'EMP-',
    width: 4,
    companyId,
  })

  const { data: emp, error: eErr } = await supabase
    .from('employees')
    .insert({
      company_id: companyId,
      employee_code,
      first_name,
      last_name,
      email: cand.email?.trim() || null,
      phone: cand.phone?.trim() || null,
      cnic: cand.cnic?.trim() || null,
      branch_id: job.branch_id,
      department_id: job.department_id,
      designation_id: job.designation_id,
      date_of_joining: joiningDate,
      employment_status: 'Probation',
      is_active: true,
    })
    .select('id, employee_code')
    .single()
  if (eErr || !emp) throw eErr ?? new Error('Could not create employee')

  const hired_count = Number(job.hired_count ?? 0) + 1
  const jobStatus = hired_count >= Number(job.openings ?? 1) ? 'CLOSED' : undefined

  await supabase
    .from('candidates')
    .update({
      stage: 'HIRED',
      employee_id: emp.id,
      stage_updated_at: new Date().toISOString(),
    })
    .eq('id', candidateId)

  await supabase
    .from('job_postings')
    .update({
      hired_count,
      ...(jobStatus ? { status: jobStatus } : {}),
    })
    .eq('id', cand.job_posting_id)

  return { employeeId: emp.id, employeeCode: emp.employee_code }
}

export const pkr = (n: number | null | undefined) =>
  n != null ? `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}` : '—'

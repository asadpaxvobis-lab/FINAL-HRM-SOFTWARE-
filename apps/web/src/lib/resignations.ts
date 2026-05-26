import { supabase } from '@/lib/supabase'

export const REASON_CATEGORIES = [
  'Personal',
  'Better Opportunity',
  'Relocation',
  'Health',
  'Education',
  'Retirement',
  'Other',
] as const

export const DEFAULT_CLEARANCE_STEPS = [
  { step_code: 'MANAGER', step_name: 'Reporting manager', sort_order: 1 },
  { step_code: 'IT', step_name: 'IT — laptop & access', sort_order: 2 },
  { step_code: 'HR', step_name: 'HR — documents & ID card', sort_order: 3 },
  { step_code: 'FINANCE', step_name: 'Finance — advances & dues', sort_order: 4 },
  { step_code: 'ADMIN', step_name: 'Admin — keys & assets', sort_order: 5 },
] as const

export type SettlementInput = {
  gratuity_amount: number
  leave_encashment_amount: number
  pending_salary_amount: number
  loan_deduction: number
  other_deductions: number
}

export function calcNetSettlement(s: SettlementInput): number {
  const credits = s.gratuity_amount + s.leave_encashment_amount + s.pending_salary_amount
  const debits = s.loan_deduction + s.other_deductions
  return Math.round((credits - debits) * 100) / 100
}

export async function seedClearanceSteps(resignationId: string) {
  const rows = DEFAULT_CLEARANCE_STEPS.map((s) => ({
    resignation_id: resignationId,
    step_code: s.step_code,
    step_name: s.step_name,
    sort_order: s.sort_order,
  }))
  const { error } = await supabase.from('resignation_clearance_steps').insert(rows)
  if (error) throw error
}

export async function syncClearanceStatus(resignationId: string) {
  const { data: steps, error } = await supabase
    .from('resignation_clearance_steps')
    .select('is_cleared')
    .eq('resignation_id', resignationId)
  if (error) throw error
  if (!steps?.length) return
  const allDone = steps.every((s) => s.is_cleared)
  const anyDone = steps.some((s) => s.is_cleared)
  const clearance_status = allDone ? 'COMPLETED' : anyDone ? 'IN_PROGRESS' : 'NOT_STARTED'
  await supabase.from('resignations').update({ clearance_status }).eq('id', resignationId)
}

export const pkr = (n: number) => `PKR ${Number(n).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`

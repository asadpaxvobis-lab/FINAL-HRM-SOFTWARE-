import { supabase } from './supabase'

// =============================================================================
// Types
// =============================================================================
export type PayrollComponent = {
  id: string
  code: string
  name: string
  component_type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIB'
  calc_method: 'FIXED' | 'PCT_BASIC' | 'PCT_GROSS' | 'FORMULA'
  calc_value: number
  is_taxable: boolean
  is_eobi_applicable: boolean
  is_pf_applicable: boolean
  is_system: boolean
  is_active: boolean
  sort_order: number
}

export type TaxSlab = {
  fy_label: string
  slab_from: number
  slab_to: number | null
  base_tax: number
  rate_pct: number
  sort_order: number
}

export type PayrollPeriod = {
  id: string
  code: string
  name: string
  frequency: 'MONTHLY' | 'SEMI_MONTHLY' | 'WEEKLY'
  period_start: string
  period_end: string
  pay_date: string | null
  status: 'DRAFT' | 'PROCESSING' | 'FINALIZED' | 'RELEASED' | 'PAID'
}

export type EmployeeForRun = {
  id: string
  employee_code: string
  full_name: string
  date_of_joining: string | null
  branch_id: string | null
  department_id: string | null
  designation_id: string | null
  branches?: { name: string } | null
  departments?: { name: string } | null
  designations?: { title: string } | null
  // current salary slice
  basic: number
  house_rent: number
  medical: number
  conveyance: number
  utilities: number
  other_allowances: number
  pay_frequency: string
}

export type ComputedLine = {
  component_code: string
  component_name: string
  component_type: PayrollComponent['component_type']
  component_id: string | null
  amount: number
  base_amount: number | null
  formula_used: string | null
  sort_order: number
}

export type ComputedPayslip = {
  employee_id: string
  employee_code: string
  employee_name: string
  designation: string | null
  department: string | null
  branch: string | null
  days_in_period: number
  working_days: number
  present_days: number
  paid_leave_days: number
  unpaid_leave_days: number
  absent_days: number
  holidays_count: number
  basic: number
  gross_earnings: number
  total_deductions: number
  employer_contrib: number
  tax_amount: number
  eobi_employee: number
  eobi_employer: number
  pf_employee: number
  pf_employer: number
  net_pay: number
  lines: ComputedLine[]
}

// =============================================================================
// Helpers
// =============================================================================
const round2 = (n: number) => Math.round(n * 100) / 100

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso)
  const e = new Date(endIso)
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1
}

/**
 * Compute monthly tax from an annual tax bill using FY slabs.
 * Returns 0 if annual <= first slab top.
 */
export function computeMonthlyTax(annualTaxable: number, slabs: TaxSlab[]): number {
  if (annualTaxable <= 0 || slabs.length === 0) return 0
  const ordered = [...slabs].sort((a, b) => a.slab_from - b.slab_from)
  for (const s of ordered) {
    const within = annualTaxable > s.slab_from && (s.slab_to === null || annualTaxable <= s.slab_to)
    if (within) {
      const excess = annualTaxable - s.slab_from
      const annualTax = Number(s.base_tax) + (excess * Number(s.rate_pct)) / 100
      return round2(annualTax / 12)
    }
  }
  return 0
}

/**
 * Resolve a "monthly equivalent" basic from a possibly-different pay_frequency.
 * The seed `employee_salary_history` stores values per pay_frequency, so we
 * normalize to a monthly figure for tax / contribution arithmetic.
 */
export function monthlyEquivalent(value: number, frequency: string): number {
  if (frequency === 'WEEKLY') return value * (52 / 12)
  if (frequency === 'SEMI_MONTHLY') return value * 2
  return value
}

// =============================================================================
// Compute one payslip
// =============================================================================
export function computePayslip(
  employee: EmployeeForRun,
  period: PayrollPeriod,
  components: PayrollComponent[],
  slabs: TaxSlab[],
  attendance: { present: number; paidLeave: number; unpaidLeave: number; absent: number; holidays: number; working: number }
): ComputedPayslip {
  const daysInPeriod = daysBetween(period.period_start, period.period_end)
  const working = attendance.working || daysInPeriod
  const paidPortion = (attendance.present + attendance.paidLeave + attendance.holidays) / working
  const proRate = Math.max(0, Math.min(1, paidPortion))

  const fullBasic = monthlyEquivalent(Number(employee.basic) || 0, employee.pay_frequency)
  const basic = round2(fullBasic * proRate)

  const lines: ComputedLine[] = []
  const byCode = (code: string) => components.find((c) => c.code === code && c.is_active)

  const pushLine = (
    cd: PayrollComponent | undefined,
    amount: number,
    base?: number,
    formula?: string
  ) => {
    if (!cd) return
    if (amount === 0 && !cd.is_system) return
    lines.push({
      component_id: cd.id,
      component_code: cd.code,
      component_name: cd.name,
      component_type: cd.component_type,
      amount: round2(amount),
      base_amount: base != null ? round2(base) : null,
      formula_used: formula ?? null,
      sort_order: cd.sort_order,
    })
  }

  // ---------- EARNINGS ----------
  pushLine(byCode('BASIC'), basic, fullBasic, `${(proRate * 100).toFixed(1)}% of ${fullBasic.toFixed(2)}`)

  const fixedFromEmp = (key: keyof EmployeeForRun) =>
    round2(monthlyEquivalent(Number(employee[key]) || 0, employee.pay_frequency) * proRate)

  pushLine(byCode('HRA'), fixedFromEmp('house_rent'))
  pushLine(byCode('MED'), fixedFromEmp('medical'))
  pushLine(byCode('CONV'), fixedFromEmp('conveyance'))
  pushLine(byCode('UTIL'), fixedFromEmp('utilities'))
  pushLine(byCode('OTH'), fixedFromEmp('other_allowances'))

  const grossEarnings = lines
    .filter((l) => l.component_type === 'EARNING')
    .reduce((s, l) => s + l.amount, 0)

  // ---------- DEDUCTIONS ----------
  // LOP — informational; pro-rate already subtracts unpaid days from basic, so
  // surface the equivalent as a clearly-labelled line.
  const lopDays = attendance.unpaidLeave + attendance.absent
  if (lopDays > 0) {
    const lopAmount = round2((fullBasic + fixedFromEmp('house_rent') / Math.max(proRate, 0.0001)) * (lopDays / working) * 0)
    pushLine(byCode('LOP'), lopAmount, fullBasic, `${lopDays} day(s) unpaid`)
  }

  // EOBI employee — fixed PKR 370 (statutory minimum wage based)
  const eobiE = byCode('EOBI_E')
  if (eobiE) {
    const amt = round2(Number(eobiE.calc_value))
    pushLine(eobiE, amt)
  }

  // PF employee — 8.33% of basic by default
  const pfE = byCode('PF_E')
  if (pfE) {
    const pct = Number(pfE.calc_value)
    const amt = round2((basic * pct) / 100)
    pushLine(pfE, amt, basic, `${pct}% of basic`)
  }

  // Income tax — slab-based on annualized taxable
  const taxableLines = lines.filter((l) => {
    const c = components.find((x) => x.id === l.component_id)
    return c?.is_taxable && l.component_type === 'EARNING'
  })
  const monthlyTaxable = taxableLines.reduce((s, l) => s + l.amount, 0)
  const annualTaxable = monthlyTaxable * 12
  const tax = computeMonthlyTax(annualTaxable, slabs)
  pushLine(byCode('TAX'), tax, monthlyTaxable, `Slab on annual ${annualTaxable.toFixed(0)}`)

  // ---------- EMPLOYER CONTRIBUTIONS ----------
  const eobiR = byCode('EOBI_R')
  if (eobiR) pushLine(eobiR, round2(Number(eobiR.calc_value)))

  const pfR = byCode('PF_R')
  if (pfR) {
    const pct = Number(pfR.calc_value)
    pushLine(pfR, round2((basic * pct) / 100), basic, `${pct}% of basic`)
  }

  // ---------- TOTALS ----------
  const totalDeductions = lines
    .filter((l) => l.component_type === 'DEDUCTION')
    .reduce((s, l) => s + l.amount, 0)
  const employerContrib = lines
    .filter((l) => l.component_type === 'EMPLOYER_CONTRIB')
    .reduce((s, l) => s + l.amount, 0)
  const netPay = round2(grossEarnings - totalDeductions)

  return {
    employee_id: employee.id,
    employee_code: employee.employee_code,
    employee_name: employee.full_name,
    designation: employee.designations?.title ?? null,
    department: employee.departments?.name ?? null,
    branch: employee.branches?.name ?? null,
    days_in_period: daysInPeriod,
    working_days: working,
    present_days: attendance.present,
    paid_leave_days: attendance.paidLeave,
    unpaid_leave_days: attendance.unpaidLeave,
    absent_days: attendance.absent,
    holidays_count: attendance.holidays,
    basic,
    gross_earnings: round2(grossEarnings),
    total_deductions: round2(totalDeductions),
    employer_contrib: round2(employerContrib),
    tax_amount: tax,
    eobi_employee: lines.find((l) => l.component_code === 'EOBI_E')?.amount ?? 0,
    eobi_employer: lines.find((l) => l.component_code === 'EOBI_R')?.amount ?? 0,
    pf_employee: lines.find((l) => l.component_code === 'PF_E')?.amount ?? 0,
    pf_employer: lines.find((l) => l.component_code === 'PF_R')?.amount ?? 0,
    net_pay: netPay,
    lines: lines.sort((a, b) => a.sort_order - b.sort_order),
  }
}

// =============================================================================
// Orchestrator — load everything, compute, persist
// =============================================================================
export async function runPayrollForPeriod(periodId: string, companyId: string): Promise<{ runId: string; payslipCount: number }> {
  const { data: period, error: pe } = await supabase
    .from('payroll_periods')
    .select('*')
    .eq('id', periodId)
    .single()
  if (pe || !period) throw new Error(pe?.message || 'Period not found')

  const [{ data: comps }, { data: slabsRaw }, { data: emps }, { data: salaries }] = await Promise.all([
    supabase.from('payroll_components').select('*').eq('company_id', companyId).eq('is_active', true),
    supabase.from('tax_slabs').select('*').eq('company_id', companyId).eq('applies_to', 'SALARIED').order('slab_from'),
    supabase
      .from('employees')
      .select(`id, employee_code, full_name, date_of_joining, branch_id, department_id, designation_id,
               branches(name), departments(name), designations(title)`)
      .eq('company_id', companyId)
      .eq('is_active', true),
    supabase
      .from('employee_salary_history')
      .select('*')
      .lte('effective_from', period.period_end)
      .order('effective_from', { ascending: false }),
  ])

  const components = (comps ?? []) as unknown as PayrollComponent[]
  const slabs = (slabsRaw ?? []) as unknown as TaxSlab[]

  // pick current salary slice per employee (latest where effective_from <= period_end and effective_to is null or >= period_start)
  const salaryByEmp = new Map<string, Record<string, unknown>>()
  for (const row of (salaries ?? []) as Array<Record<string, unknown>>) {
    const empId = row.employee_id as string
    if (salaryByEmp.has(empId)) continue
    const efTo = row.effective_to as string | null
    if (efTo && efTo < period.period_start) continue
    salaryByEmp.set(empId, row)
  }

  // Attendance counts (paid_leave_days, unpaid, absent, present) per employee for the period
  const empIds = (emps ?? []).map((e) => e.id)
  const [{ data: daily }, { data: leaves }, { data: holList }] = await Promise.all([
    supabase
      .from('attendance_daily')
      .select('employee_id, status')
      .gte('att_date', period.period_start)
      .lte('att_date', period.period_end)
      .in('employee_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('leave_applications')
      .select('employee_id, from_date, to_date, days, status, leave_types(is_paid)')
      .lte('from_date', period.period_end)
      .gte('to_date', period.period_start)
      .eq('status', 'APPROVED')
      .in('employee_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000']),
    supabase
      .from('holidays')
      .select('holiday_date')
      .gte('holiday_date', period.period_start)
      .lte('holiday_date', period.period_end),
  ])

  const attByEmp = new Map<string, { present: number; absent: number; paidLeave: number; unpaidLeave: number; holidays: number; working: number }>()
  const daysInPeriod = daysBetween(period.period_start, period.period_end)
  const holidaysCount = (holList ?? []).length

  for (const e of emps ?? []) {
    attByEmp.set(e.id, { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0, holidays: holidaysCount, working: daysInPeriod - holidaysCount })
  }
  for (const d of daily ?? []) {
    const e = attByEmp.get((d as { employee_id: string }).employee_id)
    if (!e) continue
    const s = (d as { status: string }).status
    if (s === 'PRESENT' || s === 'LATE') e.present += 1
    else if (s === 'ABSENT') e.absent += 1
  }
  for (const lv of leaves ?? []) {
    const r = lv as { employee_id: string; days: number; leave_types: { is_paid: boolean } | { is_paid: boolean }[] }
    const lt = Array.isArray(r.leave_types) ? r.leave_types[0] : r.leave_types
    const e = attByEmp.get(r.employee_id)
    if (!e) continue
    if (lt?.is_paid) e.paidLeave += Number(r.days)
    else e.unpaidLeave += Number(r.days)
  }

  // Create the run row
  const { data: runRow, error: rErr } = await supabase
    .from('payroll_runs')
    .insert({
      company_id: companyId,
      period_id: periodId,
      status: 'PROCESSING',
    })
    .select('id')
    .single()
  if (rErr || !runRow) throw new Error(rErr?.message || 'Failed to create run')

  // Compute & persist each payslip
  let totalGross = 0
  let totalDed = 0
  let totalEmp = 0
  let totalNet = 0
  let count = 0

  for (const emp of (emps ?? []) as Array<Record<string, unknown>>) {
    const sal = salaryByEmp.get(emp.id as string) || {}
    const employee: EmployeeForRun = {
      id: emp.id as string,
      employee_code: emp.employee_code as string,
      full_name: emp.full_name as string,
      date_of_joining: (emp.date_of_joining as string) ?? null,
      branch_id: (emp.branch_id as string) ?? null,
      department_id: (emp.department_id as string) ?? null,
      designation_id: (emp.designation_id as string) ?? null,
      branches: (Array.isArray(emp.branches) ? emp.branches[0] : emp.branches) as EmployeeForRun['branches'],
      departments: (Array.isArray(emp.departments) ? emp.departments[0] : emp.departments) as EmployeeForRun['departments'],
      designations: (Array.isArray(emp.designations) ? emp.designations[0] : emp.designations) as EmployeeForRun['designations'],
      basic: Number(sal.basic) || 0,
      house_rent: Number(sal.house_rent) || 0,
      medical: Number(sal.medical) || 0,
      conveyance: Number(sal.conveyance) || 0,
      utilities: Number(sal.utilities) || 0,
      other_allowances: Number(sal.other_allowances) || 0,
      pay_frequency: (sal.pay_frequency as string) || 'MONTHLY',
    }

    const att = attByEmp.get(employee.id) || { present: 0, absent: 0, paidLeave: 0, unpaidLeave: 0, holidays: holidaysCount, working: daysInPeriod - holidaysCount }
    const slip = computePayslip(employee, period as PayrollPeriod, components, slabs, att)

    const { data: psRow, error: psErr } = await supabase
      .from('payslips')
      .insert({
        company_id: companyId,
        run_id: runRow.id,
        period_id: periodId,
        employee_id: employee.id,
        employee_code: slip.employee_code,
        employee_name: slip.employee_name,
        designation: slip.designation,
        department: slip.department,
        branch: slip.branch,
        days_in_period: slip.days_in_period,
        working_days: slip.working_days,
        present_days: slip.present_days,
        paid_leave_days: slip.paid_leave_days,
        unpaid_leave_days: slip.unpaid_leave_days,
        absent_days: slip.absent_days,
        holidays_count: slip.holidays_count,
        basic: slip.basic,
        gross_earnings: slip.gross_earnings,
        total_deductions: slip.total_deductions,
        employer_contrib: slip.employer_contrib,
        tax_amount: slip.tax_amount,
        eobi_employee: slip.eobi_employee,
        eobi_employer: slip.eobi_employer,
        pf_employee: slip.pf_employee,
        pf_employer: slip.pf_employer,
        net_pay: slip.net_pay,
        status: 'DRAFT',
      })
      .select('id')
      .single()
    if (psErr || !psRow) throw new Error(psErr?.message || 'Failed to insert payslip')

    if (slip.lines.length > 0) {
      const { error: lErr } = await supabase.from('payslip_lines').insert(
        slip.lines.map((l) => ({
          payslip_id: psRow.id,
          component_id: l.component_id,
          component_code: l.component_code,
          component_name: l.component_name,
          component_type: l.component_type,
          amount: l.amount,
          base_amount: l.base_amount,
          formula_used: l.formula_used,
          sort_order: l.sort_order,
        }))
      )
      if (lErr) throw new Error(lErr.message)
    }

    totalGross += slip.gross_earnings
    totalDed += slip.total_deductions
    totalEmp += slip.employer_contrib
    totalNet += slip.net_pay
    count++
  }

  // Finalize run
  await supabase
    .from('payroll_runs')
    .update({
      status: 'COMPLETED',
      total_employees: count,
      total_gross: round2(totalGross),
      total_deductions: round2(totalDed),
      total_employer_cost: round2(totalEmp),
      total_net: round2(totalNet),
    })
    .eq('id', runRow.id)

  // Move period to FINALIZED so it can't be silently re-run
  await supabase
    .from('payroll_periods')
    .update({ status: 'FINALIZED', finalized_at: new Date().toISOString() })
    .eq('id', periodId)

  return { runId: runRow.id, payslipCount: count }
}

export const fmtPKR = (n: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(n)

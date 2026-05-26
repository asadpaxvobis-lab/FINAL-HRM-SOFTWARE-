import { supabase } from '@/lib/supabase'

type Shift = {
  id: string
  start_time: string
  end_time: string
  break_minutes: number
  grace_late_minutes: number
  grace_early_minutes: number
  is_night: boolean
}

type Assignment = {
  employee_id: string
  shift_id: string
  effective_from: string
  effective_to: string | null
  weekly_off: string[]
  shifts: Shift | null
}

type Punch = {
  employee_id: string
  punch_at: string
}

type Employee = { id: string; company_id: string }

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Used when an employee has no shift assignment. */
export const DEFAULT_SHIFT = {
  start_time: '09:00',
  end_time: '17:00',
  break_minutes: 0,
  grace_late_minutes: 15,
  grace_early_minutes: 15,
  is_night: false,
}

const STANDARD_DAY_MINUTES = 8 * 60

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(`${dateStr}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d
}

function diffMinutes(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000))
}

type ShiftLike = {
  start_time?: string
  end_time?: string
  break_minutes?: number
  grace_late_minutes?: number
  grace_early_minutes?: number
  is_night?: boolean
}

/** Derive worked / late / early-out / OT from punch times (used by UI + aggregator). */
export function computeAttendanceMetrics(
  dateStr: string,
  first_in: string | null,
  last_out: string | null,
  shift?: ShiftLike | null,
  scheduled_start?: string | null,
  scheduled_end?: string | null
): { worked_minutes: number; late_minutes: number; early_out_minutes: number; overtime_minutes: number } {
  const cfg = shift?.start_time && shift?.end_time ? shift : DEFAULT_SHIFT
  const firstIn = first_in ? new Date(first_in) : null
  const lastOut = last_out ? new Date(last_out) : null

  let scheduledStart: Date | null = scheduled_start ? new Date(scheduled_start) : null
  let scheduledEnd: Date | null = scheduled_end ? new Date(scheduled_end) : null
  if (!scheduledStart && cfg.start_time) scheduledStart = combineDateTime(dateStr, cfg.start_time)
  if (!scheduledEnd && cfg.end_time) scheduledEnd = combineDateTime(dateStr, cfg.end_time)
  if (scheduledStart && scheduledEnd && cfg.is_night && scheduledEnd <= scheduledStart) {
    scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 3600 * 1000)
  }

  let worked_minutes = 0
  if (firstIn && lastOut) {
    worked_minutes = Math.max(0, diffMinutes(firstIn, lastOut) - (cfg.break_minutes ?? 0))
  }

  let late_minutes = 0
  let early_out_minutes = 0
  let overtime_minutes = 0

  if (firstIn && scheduledStart) {
    const lateRaw = diffMinutes(scheduledStart, firstIn)
    late_minutes = Math.max(0, lateRaw - (cfg.grace_late_minutes ?? 0))
  }
  if (lastOut && scheduledEnd) {
    if (lastOut < scheduledEnd) {
      const earlyRaw = diffMinutes(lastOut, scheduledEnd)
      early_out_minutes = Math.max(0, earlyRaw - (cfg.grace_early_minutes ?? 0))
    } else if (lastOut > scheduledEnd) {
      overtime_minutes = diffMinutes(scheduledEnd, lastOut)
    }
  } else if (worked_minutes > 0) {
    overtime_minutes = Math.max(0, worked_minutes - STANDARD_DAY_MINUTES)
  }

  return { worked_minutes, late_minutes, early_out_minutes, overtime_minutes }
}

export type DailyComputed = {
  employee_id: string
  company_id: string
  attendance_date: string
  shift_id: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  first_in: string | null
  last_out: string | null
  worked_minutes: number
  late_minutes: number
  early_out_minutes: number
  overtime_minutes: number
  status: string
  is_weekly_off: boolean
  is_holiday: boolean
}

/**
 * Recompute attendance_daily rows for all employees in the company for a given date.
 * - Looks up active employees
 * - Uses each employee's effective shift assignment
 * - Aggregates punches into first_in / last_out / worked / late / early-out / OT
 * - Marks Holiday / Weekly Off / Absent as applicable
 *
 * Note: this is a client-side aggregator. It is moved to a Postgres function or .NET worker in a later phase.
 */
export async function recomputeAttendanceDaily(companyId: string, dateStr: string) {
  const { data: empData, error: empErr } = await supabase
    .from('employees')
    .select('id, company_id, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
  if (empErr) throw empErr
  const employees = (empData ?? []) as Employee[]
  if (employees.length === 0) return { rows: 0 }

  const empIds = employees.map((e) => e.id)

  const [{ data: asnData }, { data: punchData }, { data: holidayData }] = await Promise.all([
    supabase
      .from('employee_shift_assignments')
      .select('employee_id, shift_id, effective_from, effective_to, weekly_off, shifts(id, start_time, end_time, break_minutes, grace_late_minutes, grace_early_minutes, is_night)')
      .in('employee_id', empIds)
      .lte('effective_from', dateStr),
    supabase
      .from('attendance_punches')
      .select('employee_id, punch_at')
      .eq('company_id', companyId)
      .gte('punch_at', `${dateStr}T00:00:00`)
      .lt('punch_at', `${dateStr}T23:59:59.999`),
    supabase
      .from('holidays')
      .select('id, branch_id')
      .eq('company_id', companyId)
      .eq('holiday_date', dateStr)
      .eq('is_active', true),
  ])

  const punches = (punchData ?? []) as Punch[]
  const holidays = (holidayData ?? []) as { id: string; branch_id: string | null }[]
  const hasCompanyHoliday = holidays.some((h) => !h.branch_id)

  const assignments = new Map<string, Assignment>()
  for (const raw of (asnData ?? []) as Record<string, unknown>[]) {
    const eid = raw.employee_id as string
    const existing = assignments.get(eid)
    const effFrom = raw.effective_from as string
    const effTo = raw.effective_to as string | null
    if (effTo && effTo < dateStr) continue
    if (existing && existing.effective_from >= effFrom) continue
    const sh = raw.shifts
    const shift = (Array.isArray(sh) ? sh[0] : sh) as Shift | null
    assignments.set(eid, {
      employee_id: eid,
      shift_id: raw.shift_id as string,
      effective_from: effFrom,
      effective_to: effTo,
      weekly_off: (raw.weekly_off as string[]) ?? [],
      shifts: shift,
    })
  }

  const punchesByEmployee = new Map<string, Date[]>()
  for (const p of punches) {
    const arr = punchesByEmployee.get(p.employee_id) ?? []
    arr.push(new Date(p.punch_at))
    punchesByEmployee.set(p.employee_id, arr)
  }

  const weekdayName = WEEKDAY_NAMES[new Date(`${dateStr}T00:00:00`).getDay()]
  const computed: DailyComputed[] = []

  for (const emp of employees) {
    const asn = assignments.get(emp.id)
    const empPunches = (punchesByEmployee.get(emp.id) ?? []).sort((a, b) => a.getTime() - b.getTime())
    const shift = asn?.shifts ?? null
    const isWeeklyOff = asn ? asn.weekly_off.includes(weekdayName) : false
    const isHoliday = hasCompanyHoliday

    let scheduled_start: Date | null = null
    let scheduled_end: Date | null = null
    if (shift) {
      scheduled_start = combineDateTime(dateStr, shift.start_time)
      scheduled_end = combineDateTime(dateStr, shift.end_time)
      if (shift.is_night && scheduled_end <= scheduled_start) {
        scheduled_end = new Date(scheduled_end.getTime() + 24 * 3600 * 1000)
      }
    }

    const first_in = empPunches[0] ?? null
    const last_out = empPunches.length > 1 ? empPunches[empPunches.length - 1] : null

    let worked_minutes = 0
    if (first_in && last_out) {
      worked_minutes = Math.max(0, diffMinutes(first_in, last_out) - (shift?.break_minutes ?? 0))
    }

    const metrics = computeAttendanceMetrics(
      dateStr,
      first_in?.toISOString() ?? null,
      last_out?.toISOString() ?? null,
      shift,
      scheduled_start?.toISOString() ?? null,
      scheduled_end?.toISOString() ?? null
    )
    worked_minutes = metrics.worked_minutes
    const { late_minutes, early_out_minutes, overtime_minutes } = metrics

    let status: DailyComputed['status'] = 'Absent'
    if (isHoliday) status = 'Holiday'
    else if (isWeeklyOff) status = 'Weekly Off'
    else if (empPunches.length === 0) status = 'Absent'
    else if (worked_minutes >= (shift ? 6 * 60 : 4 * 60)) status = late_minutes > 0 ? 'Late' : 'Present'
    else if (worked_minutes > 0) status = 'Half Day'

    computed.push({
      employee_id: emp.id,
      company_id: companyId,
      attendance_date: dateStr,
      shift_id: shift?.id ?? null,
      scheduled_start: scheduled_start?.toISOString() ?? null,
      scheduled_end: scheduled_end?.toISOString() ?? null,
      first_in: first_in?.toISOString() ?? null,
      last_out: last_out?.toISOString() ?? null,
      worked_minutes,
      late_minutes,
      early_out_minutes,
      overtime_minutes,
      status,
      is_weekly_off: isWeeklyOff,
      is_holiday: isHoliday,
    })
  }

  const { error: upErr } = await supabase
    .from('attendance_daily')
    .upsert(computed, { onConflict: 'employee_id,attendance_date' })
  if (upErr) throw upErr

  return { rows: computed.length }
}

export function fmtMinutes(mins: number, alwaysShow = false): string {
  if (!mins && !alwaysShow) return '—'
  if (!mins) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

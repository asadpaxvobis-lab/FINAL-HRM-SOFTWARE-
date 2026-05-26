import { supabase } from '@/lib/supabase'

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
 * Recompute attendance_daily via Postgres (recompute_attendance_daily RPC).
 * Punch inserts also auto-reaggregate via DB trigger.
 */
export async function recomputeAttendanceDaily(companyId: string, dateStr: string) {
  const { data, error } = await supabase.rpc('recompute_attendance_daily', {
    p_company_id: companyId,
    p_date: dateStr,
  })
  if (error) throw error
  return { rows: (data as number) ?? 0 }
}

export function fmtMinutes(mins: number, alwaysShow = false): string {
  if (!mins && !alwaysShow) return '—'
  if (!mins) return '0m'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

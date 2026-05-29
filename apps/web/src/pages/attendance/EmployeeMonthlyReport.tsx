import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fmtMinutes, displayOvertimeMinutes } from '@/lib/attendance'
import { printableStyles, monthOptions } from '@/pages/reports/shared'
import { AppLogo } from '@/components/branding/AppLogo'
import { toast } from 'sonner'

type Daily = {
  attendance_date: string
  status: string
  first_in: string | null
  last_out: string | null
  worked_minutes: number
  late_minutes: number
  early_out_minutes: number
  overtime_minutes: number
  is_weekly_off: boolean
  is_holiday: boolean
  notes: string | null
  shifts?: { code: string; name: string } | null
}

type Employee = {
  id: string
  employee_code: string
  full_name: string
  branches?: { name: string } | null
  departments?: { name: string } | null
  designations?: { title: string } | null
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

function parseParams(searchParams: URLSearchParams) {
  const employeeId = searchParams.get('employee') ?? ''
  const year = Number(searchParams.get('year')) || new Date().getFullYear()
  const month = Number(searchParams.get('month'))
  const monthIndex = Number.isFinite(month) && month >= 0 && month <= 11 ? month : new Date().getMonth()
  return { employeeId, year, monthIndex }
}

export function EmployeeMonthlyReportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { employeeId, year, monthIndex } = parseParams(searchParams)

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [company, setCompany] = useState<{ name: string; legal_name: string | null; address: string | null } | null>(
    null
  )
  const [dailyRows, setDailyRows] = useState<Daily[]>([])
  const [loading, setLoading] = useState(true)

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const monthLabel = monthOptions.find((m) => m.v === monthIndex)?.l ?? ''
  const rangeStart = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`
  const rangeEnd = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  useEffect(() => {
    if (!employeeId) {
      setLoading(false)
      return
    }

    const load = async () => {
      setLoading(true)
      const [emp, co, daily] = await Promise.all([
        supabase
          .from('employees')
          .select('id, employee_code, full_name, branches(name), departments(name), designations(title)')
          .eq('id', employeeId)
          .single(),
        supabase.from('companies').select('name, legal_name, address').limit(1).maybeSingle(),
        supabase
          .from('attendance_daily')
          .select(
            'attendance_date, status, first_in, last_out, worked_minutes, late_minutes, early_out_minutes, overtime_minutes, is_weekly_off, is_holiday, notes, shifts(code, name)'
          )
          .eq('employee_id', employeeId)
          .gte('attendance_date', rangeStart)
          .lte('attendance_date', rangeEnd)
          .order('attendance_date'),
      ])

      if (emp.error || !emp.data) {
        toast.error('Employee not found', { description: emp.error?.message })
        setEmployee(null)
      } else {
        const r = emp.data as Record<string, unknown>
        const rel = (k: string) => {
          const v = r[k]
          return Array.isArray(v) ? v[0] : v
        }
        setEmployee({
          ...(r as object),
          branches: rel('branches') as Employee['branches'],
          departments: rel('departments') as Employee['departments'],
          designations: rel('designations') as Employee['designations'],
        } as Employee)
      }

      if (co.data) setCompany(co.data as { name: string; legal_name: string | null; address: string | null })

      const mapped = (daily.data ?? []).map((row: Record<string, unknown>) => {
        const sh = row.shifts
        return { ...row, shifts: Array.isArray(sh) ? sh[0] : sh } as Daily
      })
      setDailyRows(mapped)
      setLoading(false)
    }

    void load()
  }, [employeeId, rangeStart, rangeEnd])

  const byDate = useMemo(() => {
    const map = new Map<string, Daily>()
    for (const r of dailyRows) map.set(r.attendance_date, r)
    return map
  }, [dailyRows])

  const calendarDays = useMemo(() => {
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const d = byDate.get(dateStr)
      const weekday = new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-PK', { weekday: 'short' })
      const netOt = d
        ? displayOvertimeMinutes({
            overtime_minutes: d.overtime_minutes,
            late_minutes: d.late_minutes,
            gross_overtime_minutes: d.overtime_minutes,
          })
        : 0
      let status = d?.status ?? '—'
      if (d?.first_in && status === 'Present' && (d.late_minutes ?? 0) > 0) status = 'Late'
      return { dateStr, day, weekday, record: d, status, netOt }
    })
  }, [byDate, daysInMonth, year, monthIndex])

  const summary = useMemo(() => {
    let present = 0
    let late = 0
    let halfDay = 0
    let absent = 0
    let leave = 0
    let holiday = 0
    let weeklyOff = 0
    let worked = 0
    let lateMins = 0
    let otMins = 0

    for (const { record, status } of calendarDays) {
      if (!record) continue
      const s = status
      if (s === 'Present') present++
      else if (s === 'Late') late++
      else if (s === 'Half Day') halfDay++
      else if (s === 'Absent') absent++
      else if (s === 'Leave') leave++
      else if (s === 'Holiday') holiday++
      else if (s === 'Weekly Off') weeklyOff++
      worked += record.worked_minutes ?? 0
      lateMins += record.late_minutes ?? 0
      otMins += displayOvertimeMinutes({
        overtime_minutes: record.overtime_minutes,
        late_minutes: record.late_minutes,
        gross_overtime_minutes: record.overtime_minutes,
      })
    }

    return { present, late, halfDay, absent, leave, holiday, weeklyOff, worked, lateMins, otMins }
  }, [calendarDays])

  if (!employeeId) {
    return (
      <div className="space-y-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate('/attendance')}>
          <ArrowLeft className="h-4 w-4" /> Back to attendance
        </Button>
        <p className="text-sm text-muted-foreground">Pick an employee and month from the Attendance page.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!employee) return null

  const attendanceRate =
    summary.present + summary.late + summary.halfDay + summary.absent > 0
      ? Math.round(
          ((summary.present + summary.late + summary.halfDay) /
            (summary.present + summary.late + summary.halfDay + summary.absent)) *
            1000
        ) / 10
      : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate('/attendance')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="default" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
              <AppLogo centered className="h-56 w-full max-w-[560px] sm:max-w-[560px] shrink-0 sm:object-left sm:mx-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-2xl">{company?.name ?? 'Company'}</CardTitle>
                {company?.legal_name && <CardDescription>{company.legal_name}</CardDescription>}
                {company?.address && <p className="text-xs text-muted-foreground mt-1">{company.address}</p>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Monthly attendance</div>
              <div className="font-semibold">
                {monthLabel} {year}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {rangeStart} → {rangeEnd}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Employee</div>
              <div className="font-medium text-lg">{employee.full_name}</div>
              <div className="font-mono text-xs text-muted-foreground">{employee.employee_code}</div>
              <div className="text-muted-foreground">
                {employee.designations?.title ?? '—'}
                {employee.departments?.name ? ` · ${employee.departments.name}` : ''}
              </div>
              {employee.branches?.name && <div className="text-muted-foreground">{employee.branches.name}</div>}
            </div>
            <div className="sm:text-right">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Summary</div>
              {attendanceRate !== null && (
                <div className="text-2xl font-semibold tabular-nums">{attendanceRate}%</div>
              )}
              <div className="text-xs text-muted-foreground">Attendance rate (working days)</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs border rounded-lg p-3 bg-muted/20">
            <div>
              <div className="text-muted-foreground">Present</div>
              <div className="font-semibold tabular-nums">{summary.present}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Late</div>
              <div className="font-semibold tabular-nums">{summary.late}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Half day</div>
              <div className="font-semibold tabular-nums">{summary.halfDay}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Absent</div>
              <div className="font-semibold tabular-nums">{summary.absent}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Leave</div>
              <div className="font-semibold tabular-nums">{summary.leave}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Holiday</div>
              <div className="font-semibold tabular-nums">{summary.holiday}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Weekly off</div>
              <div className="font-semibold tabular-nums">{summary.weeklyOff}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Worked</div>
              <div className="font-semibold tabular-nums">{fmtMinutes(summary.worked, true)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Late (total)</div>
              <div className="font-semibold tabular-nums">{fmtMinutes(summary.lateMins, true)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Overtime</div>
              <div className="font-semibold tabular-nums">{fmtMinutes(summary.otMins, true)}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm report-table border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  <th className="text-left px-3 py-2 font-medium">Day</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Shift</th>
                  <th className="text-left px-3 py-2 font-medium">In</th>
                  <th className="text-left px-3 py-2 font-medium">Out</th>
                  <th className="text-right px-3 py-2 font-medium">Worked</th>
                  <th className="text-right px-3 py-2 font-medium">Late</th>
                  <th className="text-right px-3 py-2 font-medium">OT</th>
                </tr>
              </thead>
              <tbody>
                {calendarDays.map(({ dateStr, day, weekday, record, status, netOt }) => (
                  <tr key={dateStr} className="border-b border-border/60">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                      {String(day).padStart(2, '0')}/{String(monthIndex + 1).padStart(2, '0')}/{year}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{weekday}</td>
                    <td className="px-3 py-2">
                      {record ? (
                        <Badge variant={status === 'Absent' ? 'outline' : status === 'Present' || status === 'Late' ? 'warm' : 'secondary'}>
                          {status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{record?.shifts?.code ?? '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(record?.first_in ?? null)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtTime(record?.last_out ?? null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {record ? fmtMinutes(record.worked_minutes, true) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {record && record.late_minutes > 0 ? fmtMinutes(record.late_minutes, true) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {record && netOt > 0 ? fmtMinutes(netOt, true) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground print:mt-4">
            Generated {new Date().toLocaleString('en-PK')} · SAFWA HRM
          </p>
        </CardContent>
      </Card>

      <style>{printableStyles}</style>
    </div>
  )
}

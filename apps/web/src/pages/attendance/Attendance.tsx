import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Search, Activity, Calendar, Clock, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { avatarColorFor, initialsFromName } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { recomputeAttendanceDaily, fmtMinutes } from '@/lib/attendance'
import { toCsv, downloadCsv } from '@/lib/csv'

type Daily = {
  id: string
  employee_id: string
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
  shifts?: { code: string; name: string } | null
}

type Employee = {
  id: string
  employee_code: string
  full_name: string
  branch_id: string | null
  department_id: string | null
  branches?: { name: string } | null
  departments?: { name: string } | null
}

type Branch = { id: string; name: string }
type Department = { id: string; name: string }

const today = () => new Date().toISOString().slice(0, 10)

const statusVariant = (s: string): 'warm' | 'outline' | 'secondary' => {
  if (s === 'Present') return 'warm'
  if (s === 'Late' || s === 'Half Day') return 'warm'
  if (s === 'Holiday' || s === 'Weekly Off' || s === 'Leave') return 'secondary'
  return 'outline'
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'

export function AttendancePage() {
  const { appUser, hasPermission } = useAuth()
  const canCreate = hasPermission('attendance.create')
  const canUpdate = hasPermission('attendance.update')
  const [date, setDate] = useState(today())
  const [rows, setRows] = useState<Daily[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [punchOpen, setPunchOpen] = useState(false)
  const [punchForm, setPunchForm] = useState({
    employee_id: '',
    punch_at: '',
    punch_type: 'in',
    notes: '',
  })

  async function load() {
    setLoading(true)
    const [emp, br, dp, daily] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_code, full_name, branch_id, department_id, branches(name), departments(name)')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
      supabase
        .from('attendance_daily')
        .select(
          'id, employee_id, attendance_date, status, first_in, last_out, worked_minutes, late_minutes, early_out_minutes, overtime_minutes, is_weekly_off, is_holiday, shifts(code, name)'
        )
        .eq('attendance_date', date),
    ])
    if (emp.data) {
      const list = emp.data.map((r: Record<string, unknown>) => {
        const b = r.branches
        const d = r.departments
        return { ...r, branches: Array.isArray(b) ? b[0] : b, departments: Array.isArray(d) ? d[0] : d } as Employee
      })
      setEmployees(list)
    }
    setBranches((br.data ?? []) as Branch[])
    setDepartments((dp.data ?? []) as Department[])
    if (daily.data) {
      const dailyRows = daily.data.map((r: Record<string, unknown>) => {
        const sh = r.shifts
        return { ...r, shifts: Array.isArray(sh) ? sh[0] : sh } as Daily
      })
      setRows(dailyRows)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [date])

  const byEmployee = useMemo(() => {
    const map = new Map<string, Daily>()
    for (const r of rows) map.set(r.employee_id, r)
    return map
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) => {
      if (branchFilter && e.branch_id !== branchFilter) return false
      if (deptFilter && e.department_id !== deptFilter) return false
      if (q && !e.full_name.toLowerCase().includes(q) && !e.employee_code.toLowerCase().includes(q)) return false
      return true
    })
  }, [employees, query, branchFilter, deptFilter])

  const counts = useMemo(() => {
    const acc: Record<string, number> = { Present: 0, Late: 0, Absent: 0, Leave: 0, 'Weekly Off': 0, Holiday: 0, 'Half Day': 0 }
    for (const e of filtered) {
      const d = byEmployee.get(e.id)
      const s = d?.status ?? 'Absent'
      acc[s] = (acc[s] ?? 0) + 1
    }
    return acc
  }, [filtered, byEmployee])

  const onRecompute = async () => {
    if (!appUser) return
    setBusy(true)
    try {
      const res = await recomputeAttendanceDaily(appUser.company_id, date)
      await writeAuditLog({ action: 'UPDATE', entityType: 'attendance_recompute', after: { date, rows: res.rows } })
      toast.success(`Re-aggregated ${res.rows} employee(s) for ${date}`)
      void load()
    } catch (err) {
      toast.error('Recompute failed', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const openPunch = () => {
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setPunchForm({ employee_id: '', punch_at: local, punch_type: 'in', notes: '' })
    setPunchOpen(true)
  }

  const submitPunch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      employee_id: punchForm.employee_id,
      punch_at: new Date(punchForm.punch_at).toISOString(),
      punch_type: punchForm.punch_type,
      source: 'manual',
      notes: punchForm.notes.trim() || null,
      created_by: appUser.id,
    }
    const { data, error } = await supabase.from('attendance_punches').insert(payload).select('id').single()
    if (error) {
      setBusy(false)
      toast.error('Could not record punch', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'attendance_punch', entityId: data?.id, after: payload })
    toast.success('Punch recorded')
    setPunchOpen(false)
    try {
      const punchDate = punchForm.punch_at.slice(0, 10)
      await recomputeAttendanceDaily(appUser.company_id, punchDate)
    } catch (err) {
      console.warn('Recompute after punch failed:', err)
    }
    setBusy(false)
    void load()
  }

  const exportDay = () => {
    const data = filtered.map((e) => {
      const d = byEmployee.get(e.id)
      return {
        employee_code: e.employee_code,
        full_name: e.full_name,
        branch: e.branches?.name ?? '',
        department: e.departments?.name ?? '',
        status: d?.status ?? 'Absent',
        first_in: d?.first_in ? new Date(d.first_in).toLocaleString('en-PK') : '',
        last_out: d?.last_out ? new Date(d.last_out).toLocaleString('en-PK') : '',
        worked_minutes: d?.worked_minutes ?? 0,
        late_minutes: d?.late_minutes ?? 0,
        early_out_minutes: d?.early_out_minutes ?? 0,
        overtime_minutes: d?.overtime_minutes ?? 0,
      }
    })
    downloadCsv(`attendance-${date}.csv`, toCsv(data))
    toast.success('Exported')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily attendance from devices and manual punches. Aggregates can be re-computed on demand."
        actions={
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="attendance.export">
              <Button variant="outline" size="sm" onClick={exportDay} disabled={filtered.length === 0}>
                Export CSV
              </Button>
            </HasPermission>
            <HasPermission perm="attendance.update">
              <Button variant="outline" size="sm" onClick={onRecompute} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Re-aggregate
              </Button>
            </HasPermission>
            <HasPermission perm="attendance.create">
              <Button size="sm" onClick={openPunch}>
                <Plus className="h-4 w-4" /> Manual punch
              </Button>
            </HasPermission>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Object.entries(counts).map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{k}</div>
              <div className="text-2xl font-semibold tabular-nums">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search employee" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Select className="w-44" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Select className="w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-16 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No employees match the filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-6 py-3">Employee</th>
                    <th className="px-3 py-3">Shift</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">In</th>
                    <th className="px-3 py-3">Out</th>
                    <th className="px-3 py-3">Worked</th>
                    <th className="px-3 py-3">Late</th>
                    <th className="px-3 py-3">OT</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e) => {
                    const d = byEmployee.get(e.id)
                    const status = d?.status ?? 'Absent'
                    return (
                      <tr key={e.id} className="hover:bg-muted/20">
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={avatarColorFor(e.employee_code)}>
                                {initialsFromName(e.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{e.full_name}</div>
                              <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {d?.shifts?.code ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={statusVariant(status)}>{status}</Badge>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{fmtTime(d?.first_in ?? null)}</td>
                        <td className="px-3 py-3 tabular-nums">{fmtTime(d?.last_out ?? null)}</td>
                        <td className="px-3 py-3 tabular-nums">{fmtMinutes(d?.worked_minutes ?? 0)}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {d?.late_minutes ? <span className="text-amber-600 dark:text-amber-400">{fmtMinutes(d.late_minutes)}</span> : '—'}
                        </td>
                        <td className="px-3 py-3 tabular-nums">{fmtMinutes(d?.overtime_minutes ?? 0)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={punchOpen} onOpenChange={setPunchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add manual punch</DialogTitle>
            <DialogDescription>
              Manual punches are audit-logged. Daily aggregate refreshes automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPunch} className="space-y-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={punchForm.employee_id} onChange={(e) => setPunchForm({ ...punchForm, employee_id: e.target.value })} required>
                <option value="">Select employee</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} — {e.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Punch time</Label>
                <Input
                  type="datetime-local"
                  required
                  value={punchForm.punch_at}
                  onChange={(e) => setPunchForm({ ...punchForm, punch_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={punchForm.punch_type} onChange={(e) => setPunchForm({ ...punchForm, punch_type: e.target.value })}>
                  <option value="in">Check-in</option>
                  <option value="out">Check-out</option>
                  <option value="auto">Auto (decide on aggregate)</option>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={punchForm.notes} onChange={(e) => setPunchForm({ ...punchForm, notes: e.target.value })} placeholder="Optional reason / context" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPunchOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                Save punch
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Loader2, Clock, Check, X, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Employee = { id: string; employee_code: string; full_name: string }

type ShortLeave = {
  id: string
  employee_id: string
  leave_date: string
  start_time: string
  end_time: string
  duration_hours: number
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'
  decision_note: string | null
  decided_at: string | null
  created_at: string
  employees?: { employee_code: string; full_name: string } | null
}

const today = () => new Date().toISOString().slice(0, 10)
const DEFAULT_MAX_HOURS = 3
const DEFAULT_MAX_PER_MONTH = 2

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) return 0
  return Math.round((mins / 60) * 100) / 100
}

function formatTime(t: string): string {
  return t.slice(0, 5)
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

const statusVariant = (s: string): 'warm' | 'outline' | 'secondary' => {
  if (s === 'Pending') return 'warm'
  if (s === 'Approved') return 'outline'
  return 'secondary'
}

type ShortLeaveTab = 'Apply' | 'My requests' | 'All requests'

export function ShortLeavePage() {
  const { appUser, hasPermission } = useAuth()
  const canApprove = hasPermission('leave.approve')
  const canApply = hasPermission('leave.apply')
  const shortLeaveTabs = useMemo(
    () => [
      { id: 'Apply' as ShortLeaveTab, label: 'Apply', visible: canApply },
      { id: 'My requests' as ShortLeaveTab, label: 'My requests', visible: !!appUser?.employee_id },
      { id: 'All requests' as ShortLeaveTab, label: 'All requests', visible: canApprove },
    ],
    [canApply, canApprove, appUser?.employee_id]
  )
  const visibleTabs = shortLeaveTabs.filter((t) => t.visible)
  const [tab, setTab] = useState<ShortLeaveTab>('Apply')

  useEffect(() => {
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id ?? 'My requests')
    }
  }, [visibleTabs, tab])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [rows, setRows] = useState<ShortLeave[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [maxHours, setMaxHours] = useState(DEFAULT_MAX_HOURS)
  const [maxPerMonth, setMaxPerMonth] = useState(DEFAULT_MAX_PER_MONTH)
  const [form, setForm] = useState({
    employee_id: '',
    leave_date: today(),
    start_time: '10:00',
    end_time: '12:00',
    reason: '',
  })
  const [decision, setDecision] = useState<{ id: string; status: 'Approved' | 'Rejected'; note: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'Approved' | 'Rejected' | 'Cancelled' | 'All'>('Pending')

  async function load() {
    if (!appUser) return
    setLoading(true)
    const [e, a, settings] = await Promise.all([
      supabase.from('employees').select('id, employee_code, full_name').eq('is_active', true).order('full_name'),
      supabase
        .from('short_leave_applications')
        .select(
          'id, employee_id, leave_date, start_time, end_time, duration_hours, reason, status, decision_note, decided_at, created_at, employees(employee_code, full_name)'
        )
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('app_settings').select('settings').eq('company_id', appUser.company_id).maybeSingle(),
    ])
    setEmployees((e.data ?? []) as Employee[])
    const mapped = (a.data ?? []).map((r: Record<string, unknown>) => {
      const emp = r.employees
      return {
        ...r,
        employees: Array.isArray(emp) ? emp[0] : emp,
      } as ShortLeave
    })
    setRows(mapped)
    const s = settings.data?.settings as Record<string, unknown> | undefined
    if (s) {
      if (typeof s.short_leave_max_hours === 'number') setMaxHours(s.short_leave_max_hours)
      if (typeof s.short_leave_max_per_month === 'number') setMaxPerMonth(s.short_leave_max_per_month)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [appUser?.id])

  useEffect(() => {
    if (appUser?.employee_id && !form.employee_id) {
      setForm((f) => ({ ...f, employee_id: appUser.employee_id! }))
    }
  }, [appUser?.employee_id])

  const durationHours = useMemo(() => calcHours(form.start_time, form.end_time), [form.start_time, form.end_time])

  const myRequests = useMemo(
    () => rows.filter((r) => r.employee_id === appUser?.employee_id),
    [rows, appUser?.employee_id]
  )

  const allFiltered = useMemo(() => {
    if (statusFilter === 'All') return rows
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  const monthlyCount = (employeeId: string, dateStr: string, excludeId?: string) => {
    const key = monthKey(dateStr)
    return rows.filter(
      (r) =>
        r.employee_id === employeeId &&
        monthKey(r.leave_date) === key &&
        r.status !== 'Rejected' &&
        r.status !== 'Cancelled' &&
        r.id !== excludeId
    ).length
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    if (!form.employee_id) {
      toast.error('Select an employee')
      return
    }
    if (!form.reason.trim()) {
      toast.error('Reason is required')
      return
    }
    if (durationHours <= 0) {
      toast.error('End time must be after start time')
      return
    }
    if (durationHours > maxHours) {
      toast.error(`Maximum ${maxHours} hour(s) per short leave request`)
      return
    }
    const used = monthlyCount(form.employee_id, form.leave_date)
    if (used >= maxPerMonth) {
      toast.error(`Monthly limit reached (${maxPerMonth} short leave(s) per month)`)
      return
    }

    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      employee_id: form.employee_id,
      leave_date: form.leave_date,
      start_time: form.start_time,
      end_time: form.end_time,
      duration_hours: durationHours,
      reason: form.reason.trim(),
      requested_by: appUser.id,
    }
    const { data, error } = await supabase.from('short_leave_applications').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Submit failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'short_leave_application', entityId: data?.id, after: payload })
    toast.success('Short leave request submitted')
    setForm((f) => ({ ...f, reason: '', leave_date: today() }))
    setTab(form.employee_id === appUser.employee_id ? 'My requests' : 'All requests')
    void load()
  }

  const decide = async () => {
    if (!decision || !appUser) return
    setBusy(true)
    const { error } = await supabase
      .from('short_leave_applications')
      .update({
        status: decision.status,
        decision_note: decision.note.trim() || null,
        approver_id: appUser.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', decision.id)
    setBusy(false)
    if (error) {
      toast.error('Decision failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'short_leave_application',
      entityId: decision.id,
      after: { status: decision.status, note: decision.note },
    })
    setDecision(null)
    toast.success(`Short leave ${decision.status.toLowerCase()}`)
    void load()
  }

  const cancelOwn = async (r: ShortLeave) => {
    if (!confirm('Cancel this request?')) return
    const { error } = await supabase
      .from('short_leave_applications')
      .update({ status: 'Cancelled', decided_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) {
      toast.error('Cancel failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'short_leave_application',
      entityId: r.id,
      after: { status: 'Cancelled' },
    })
    toast.success('Request cancelled')
    void load()
  }

  const list = tab === 'My requests' ? myRequests : tab === 'All requests' ? allFiltered : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Short leave"
        description={`Within-day time off — up to ${maxHours} hour(s) per request, ${maxPerMonth} request(s) per month.`}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      {visibleTabs.length > 1 && (
        <div className="flex gap-1 border-b overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'Apply' && canApply && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> New short leave
            </CardTitle>
            <CardDescription>Leave the office for a few hours without taking a full day off.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4 max-w-lg" onSubmit={submit}>
              <HasPermission perm="leave.approve">
                <div className="space-y-2">
                  <Label>Employee</Label>
                  <Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}>
                    <option value="">Select employee</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.employee_code} — {e.full_name}
                      </option>
                    ))}
                  </Select>
                </div>
              </HasPermission>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  required
                  value={form.leave_date}
                  onChange={(e) => setForm({ ...form, leave_date: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input
                    type="time"
                    required
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input
                    type="time"
                    required
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Duration: <strong>{durationHours || '—'}</strong> hour(s)
                {form.employee_id && (
                  <>
                    {' '}
                    · Used this month:{' '}
                    <strong>{monthlyCount(form.employee_id, form.leave_date)}</strong> / {maxPerMonth}
                  </>
                )}
              </p>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  required
                  rows={3}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Brief reason for leaving during work hours"
                />
              </div>
              <Button type="submit" disabled={busy || durationHours <= 0 || durationHours > maxHours}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Submit request
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {((tab === 'My requests' && !!appUser?.employee_id) || (tab === 'All requests' && canApprove)) && (
        <>
          {tab === 'All requests' && (
            <div className="flex flex-wrap gap-2">
              {(['Pending', 'Approved', 'Rejected', 'Cancelled', 'All'] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{tab}</CardTitle>
              <CardDescription>{list.length} request(s)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : list.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">No requests found.</div>
              ) : (
                <div className="divide-y">
                  {list.map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {r.employees?.full_name ?? 'Employee'}{' '}
                          <span className="text-muted-foreground font-normal">({r.employees?.employee_code})</span>
                        </div>
                        <div className="text-muted-foreground">
                          {r.leave_date} · {formatTime(r.start_time)} – {formatTime(r.end_time)} · {r.duration_hours}h
                        </div>
                        <div className="text-muted-foreground mt-0.5">{r.reason}</div>
                      </div>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      {r.status === 'Pending' && canApprove && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDecision({ id: r.id, status: 'Approved', note: '' })}>
                            <Check className="h-4 w-4" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setDecision({ id: r.id, status: 'Rejected', note: '' })}>
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      )}
                      {r.status === 'Pending' && r.employee_id === appUser?.employee_id && (
                        <Button size="sm" variant="ghost" onClick={() => void cancelOwn(r)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision?.status === 'Approved' ? 'Approve' : 'Reject'} short leave</DialogTitle>
            <DialogDescription>Optional note for the employee.</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={decision?.note ?? ''}
            onChange={(e) => decision && setDecision({ ...decision, note: e.target.value })}
            placeholder="Decision note (optional)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Back
            </Button>
            <Button disabled={busy} onClick={() => void decide()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

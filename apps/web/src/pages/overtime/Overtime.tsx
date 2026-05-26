import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
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

type OT = {
  id: string
  ot_no: string
  employee_id: string
  ot_date: string
  start_time: string | null
  end_time: string | null
  planned_hours: number
  actual_hours: number | null
  ot_type: 'NORMAL' | 'WEEKEND' | 'HOLIDAY' | 'NIGHT'
  rate_multiplier: number
  hourly_rate: number | null
  amount: number | null
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CANCELLED'
  approved_by: string | null
  approved_at: string | null
  decision_note: string | null
  created_at: string
  employees?: { full_name: string; employee_code: string }
}

type Tab = 'mine' | 'pending' | 'approved' | 'all'

const statusVariant = (s: OT['status']) =>
  s === 'PAID'
    ? 'success'
    : s === 'APPROVED'
      ? 'success'
      : s === 'PENDING'
        ? 'warm'
        : s === 'REJECTED' || s === 'CANCELLED'
          ? 'destructive'
          : 'outline'

const otTypeRate: Record<OT['ot_type'], number> = {
  NORMAL: 1.5,
  WEEKEND: 2.0,
  HOLIDAY: 2.5,
  NIGHT: 2.0,
}

const emptyForm = {
  ot_date: new Date().toISOString().slice(0, 10),
  start_time: '',
  end_time: '',
  planned_hours: 1,
  ot_type: 'NORMAL' as OT['ot_type'],
  rate_multiplier: 1.5,
  reason: '',
}

export function OvertimePage() {
  const { appUser, hasPermission } = useAuth()
  const canApply = hasPermission('overtime.apply') && !!appUser?.employee_id
  const canApprove = hasPermission('overtime.approve')
  const canView = hasPermission('overtime.view')
  const [tab, setTab] = useState<Tab>(canApprove ? 'pending' : 'mine')
  const [rows, setRows] = useState<OT[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [decisionFor, setDecisionFor] = useState<{ ot: OT; approve: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  async function load() {
    setLoading(true)
    let q = supabase
      .from('overtime_requests')
      .select(
        'id, ot_no, employee_id, ot_date, start_time, end_time, planned_hours, actual_hours, ot_type, rate_multiplier, hourly_rate, amount, reason, status, approved_by, approved_at, decision_note, created_at, employees(full_name, employee_code)'
      )
      .order('ot_date', { ascending: false })
      .limit(200)

    if (tab === 'mine' && appUser?.employee_id) q = q.eq('employee_id', appUser.employee_id)
    else if (tab === 'pending') q = q.eq('status', 'PENDING')
    else if (tab === 'approved') q = q.in('status', ['APPROVED', 'PAID'])

    const { data, error } = await q
    if (error) toast.error('Failed to load overtime', { description: error.message })
    else {
      const mapped = (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as object),
        employees: Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees,
      })) as OT[]
      setRows(mapped)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tab])

  const totals = useMemo(() => {
    const sumHours = (filter: (r: OT) => boolean) => rows.filter(filter).reduce((s, r) => s + Number(r.planned_hours), 0)
    const sumAmount = (filter: (r: OT) => boolean) => rows.filter(filter).reduce((s, r) => s + Number(r.amount ?? 0), 0)
    return {
      pendingHours: sumHours((r) => r.status === 'PENDING'),
      approvedHours: sumHours((r) => r.status === 'APPROVED' || r.status === 'PAID'),
      paidAmount: sumAmount((r) => r.status === 'PAID'),
    }
  }, [rows])

  const openCreate = () => {
    setForm({ ...emptyForm, ot_date: new Date().toISOString().slice(0, 10) })
    setOpen(true)
  }

  // Auto-derive planned_hours from start/end if both set
  useEffect(() => {
    if (form.start_time && form.end_time) {
      const [sH, sM] = form.start_time.split(':').map(Number)
      const [eH, eM] = form.end_time.split(':').map(Number)
      let mins = (eH * 60 + eM) - (sH * 60 + sM)
      if (mins < 0) mins += 24 * 60 // crosses midnight
      const hrs = Math.round((mins / 60) * 100) / 100
      if (hrs > 0) setForm((f) => ({ ...f, planned_hours: hrs }))
    }
  }, [form.start_time, form.end_time])

  // Auto-set rate multiplier when ot_type changes
  useEffect(() => {
    setForm((f) => ({ ...f, rate_multiplier: otTypeRate[f.ot_type] }))
  }, [form.ot_type])

  async function submit() {
    if (!appUser?.employee_id) {
      toast.error('Your user account is not linked to an employee record')
      return
    }
    if (!form.reason.trim()) {
      toast.error('Reason is required')
      return
    }
    if (form.planned_hours <= 0) {
      toast.error('Planned hours must be greater than zero')
      return
    }
    setBusy(true)

    const yr = new Date().getFullYear()
    const { data: existing } = await supabase
      .from('overtime_requests')
      .select('ot_no')
      .eq('company_id', appUser.company_id)
      .ilike('ot_no', `OT-${yr}-%`)
      .order('ot_no', { ascending: false })
      .limit(1)
    let n = 1
    if (existing && existing.length > 0) {
      const m = (existing[0] as { ot_no: string }).ot_no.match(/(\d+)$/)
      if (m) n = parseInt(m[1], 10) + 1
    }
    const ot_no = `OT-${yr}-${String(n).padStart(4, '0')}`

    const payload = {
      company_id: appUser.company_id,
      ot_no,
      employee_id: appUser.employee_id,
      ot_date: form.ot_date,
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      planned_hours: form.planned_hours,
      ot_type: form.ot_type,
      rate_multiplier: form.rate_multiplier,
      reason: form.reason.trim(),
      status: 'PENDING' as const,
    }
    const { data, error } = await supabase.from('overtime_requests').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Submit failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'overtime', entityId: data?.id, after: payload })
    toast.success('Overtime request submitted')
    setOpen(false)
    void load()
  }

  async function decide() {
    if (!decisionFor) return
    setBusy(true)
    const { ot, approve } = decisionFor
    const next = approve ? 'APPROVED' : 'REJECTED'
    const { error } = await supabase
      .from('overtime_requests')
      .update({
        status: next,
        approved_by: appUser?.id ?? null,
        approved_at: new Date().toISOString(),
        decision_note: decisionNote.trim() || null,
        actual_hours: approve ? ot.planned_hours : null,
      })
      .eq('id', ot.id)
    setBusy(false)
    if (error) {
      toast.error('Decision failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'overtime',
      entityId: ot.id,
      after: { status: next, decision_note: decisionNote },
    })
    toast.success(approve ? 'Overtime approved' : 'Overtime rejected')
    setDecisionFor(null)
    setDecisionNote('')
    void load()
  }

  async function cancel(ot: OT) {
    if (!window.confirm('Cancel this overtime request?')) return
    const { error } = await supabase.from('overtime_requests').update({ status: 'CANCELLED' }).eq('id', ot.id)
    if (error) {
      toast.error('Cancel failed', { description: error.message })
      return
    }
    toast.success('Cancelled')
    void load()
  }

  const allTabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'mine', label: 'My overtime', visible: !!appUser?.employee_id },
    { id: 'pending', label: 'Pending approvals', visible: canApprove },
    { id: 'approved', label: 'Approved / Paid', visible: canApprove || canView },
    { id: 'all', label: 'All', visible: canApprove || canView },
  ]
  const tabs = allTabs.filter((t) => t.visible)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overtime"
        description="Submit overtime requests, manage approvals, and track hours."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canApply && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Apply for overtime
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Pending hours</div>
            <div className="text-2xl font-semibold tabular-nums">{totals.pendingHours.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Approved hours</div>
            <div className="text-2xl font-semibold tabular-nums">{totals.approvedHours.toFixed(1)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Paid amount</div>
            <div className="text-2xl font-semibold tabular-nums">PKR {totals.paidAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-4 py-2 text-sm border-b-2 transition-colors -mb-px ' +
                (tab === t.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No overtime requests here.
              {tab === 'mine' && canApply && (
                <div className="mt-4">
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Apply for your first overtime
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">OT no.</th>
                    {tab !== 'mine' && <th className="text-left px-4 py-2">Employee</th>}
                    <th className="text-left px-4 py-2">Date</th>
                    <th className="text-left px-4 py-2">Time</th>
                    <th className="text-right px-4 py-2">Hours</th>
                    <th className="text-left px-4 py-2">Type</th>
                    <th className="text-right px-4 py-2">Rate</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-right px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{r.ot_no}</td>
                      {tab !== 'mine' && (
                        <td className="px-4 py-3">
                          <div className="font-medium">{r.employees?.full_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {r.employees?.employee_code}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">{r.ot_date}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.start_time && r.end_time ? `${r.start_time} → ${r.end_time}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {Number(r.planned_hours).toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">{r.ot_type}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">×{Number(r.rate_multiplier).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(r.status)} className="text-[10px]">{r.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === 'PENDING' && canApprove && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDecisionFor({ ot: r, approve: true })
                                  setDecisionNote('')
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDecisionFor({ ot: r, approve: false })
                                  setDecisionNote('')
                                }}
                              >
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </Button>
                            </>
                          )}
                          {r.status === 'PENDING' && r.employee_id === appUser?.employee_id && !canApprove && (
                            <Button size="sm" variant="ghost" onClick={() => void cancel(r)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Apply for overtime</DialogTitle>
            <DialogDescription>
              Submit a request for OT hours. Rate multiplier auto-selects based on day type.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.ot_date}
                  onChange={(e) => setForm({ ...form, ot_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>OT type</Label>
                <Select
                  value={form.ot_type}
                  onChange={(e) => setForm({ ...form, ot_type: e.target.value as OT['ot_type'] })}
                >
                  <option value="NORMAL">Normal weekday (×1.5)</option>
                  <option value="WEEKEND">Weekend (×2.0)</option>
                  <option value="HOLIDAY">Public holiday (×2.5)</option>
                  <option value="NIGHT">Night shift (×2.0)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start time</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>End time</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Planned hours</Label>
                <Input
                  type="number"
                  step="0.25"
                  min={0.25}
                  value={form.planned_hours}
                  onChange={(e) => setForm({ ...form, planned_hours: +e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Auto-calculated from start & end time</p>
              </div>
              <div className="space-y-2">
                <Label>Rate multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={1}
                  value={form.rate_multiplier}
                  onChange={(e) => setForm({ ...form, rate_multiplier: +e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason / details *</Label>
              <Textarea
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Production deadline support, urgent client deliverable, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decision dialog */}
      <Dialog open={!!decisionFor} onOpenChange={(o) => !o && setDecisionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionFor?.approve ? 'Approve overtime' : 'Reject overtime'}
            </DialogTitle>
            <DialogDescription>
              {decisionFor?.ot.employees?.full_name} · {decisionFor?.ot.ot_date} ·{' '}
              {decisionFor?.ot.planned_hours.toFixed(1)}h
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>
              Note {!decisionFor?.approve && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={decisionFor?.approve ? 'Optional comment' : 'Reason for rejection…'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => void decide()}
              disabled={busy || (!decisionFor?.approve && !decisionNote.trim())}
              variant={decisionFor?.approve ? 'default' : 'destructive'}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {decisionFor?.approve ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

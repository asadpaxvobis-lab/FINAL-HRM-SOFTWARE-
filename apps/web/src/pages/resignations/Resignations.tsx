import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Loader2,
  LogOut,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { REASON_CATEGORIES } from '@/lib/resignations'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Resignation = {
  id: string
  resignation_no: string
  employee_id: string
  resignation_date: string
  requested_last_day: string
  approved_last_day: string | null
  reason_category: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN'
  clearance_status: string
  settlement_status: string
  net_settlement: number
  created_at: string
  employees?: { full_name: string; employee_code: string }
}

type Tab = 'mine' | 'pending' | 'clearance' | 'all'

const statusVariant = (s: Resignation['status']) => {
  if (s === 'APPROVED') return 'warm' as const
  if (s === 'PENDING') return 'outline' as const
  if (s === 'REJECTED' || s === 'CANCELLED' || s === 'WITHDRAWN') return 'destructive' as const
  return 'secondary' as const
}

const emptyForm = {
  requested_last_day: '',
  reason_category: 'Personal' as (typeof REASON_CATEGORIES)[number],
  reason: '',
}

export function ResignationsPage() {
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canApply = hasPermission('resignation.apply') && !!appUser?.employee_id
  const canApprove = hasPermission('resignation.approve')
  const [tab, setTab] = useState<Tab>(canApprove ? 'pending' : 'mine')
  const [rows, setRows] = useState<Resignation[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [decisionFor, setDecisionFor] = useState<{ row: Resignation; approve: boolean } | null>(null)
  const [decisionNote, setDecisionNote] = useState('')

  async function load() {
    setLoading(true)
    let q = supabase
      .from('resignations')
      .select(
        'id, resignation_no, employee_id, resignation_date, requested_last_day, approved_last_day, reason_category, reason, status, clearance_status, settlement_status, net_settlement, created_at, employees(full_name, employee_code)'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (tab === 'mine' && appUser?.employee_id) q = q.eq('employee_id', appUser.employee_id)
    else if (tab === 'pending') q = q.eq('status', 'PENDING')
    else if (tab === 'clearance') q = q.eq('status', 'APPROVED').neq('clearance_status', 'COMPLETED')

    const { data, error } = await q
    if (error) toast.error('Failed to load resignations', { description: error.message })
    else {
      const mapped = (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as object),
        employees: Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees,
      })) as Resignation[]
      setRows(mapped)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tab])

  const stats = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === 'PENDING').length,
      clearance: rows.filter((r) => r.status === 'APPROVED' && r.clearance_status !== 'COMPLETED').length,
      settled: rows.filter((r) => r.settlement_status === 'PROCESSED').length,
    }),
    [rows]
  )

  const submitApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser?.employee_id || !appUser.company_id) return
    if (!form.requested_last_day.trim()) {
      toast.error('Last working day is required')
      return
    }
    if (!form.reason.trim()) {
      toast.error('Reason is required')
      return
    }
    setBusy(true)
    const resignation_no = await nextCode({
      table: 'resignations',
      column: 'resignation_no',
      prefix: 'RES-',
      width: 4,
      companyId: appUser.company_id,
    })
    const payload = {
      company_id: appUser.company_id,
      resignation_no,
      employee_id: appUser.employee_id,
      resignation_date: new Date().toISOString().slice(0, 10),
      requested_last_day: form.requested_last_day,
      reason_category: form.reason_category,
      reason: form.reason.trim(),
    }
    const { data, error } = await supabase.from('resignations').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Could not submit resignation', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'resignation', entityId: data?.id, after: payload })
    toast.success('Resignation submitted')
    setOpen(false)
    setForm(emptyForm)
    void load()
  }

  const submitDecision = async () => {
    if (!decisionFor || !appUser) return
    setBusy(true)
    const { row, approve } = decisionFor
    const patch: Record<string, unknown> = {
      status: approve ? 'APPROVED' : 'REJECTED',
      approved_by: appUser.id,
      approved_at: new Date().toISOString(),
      decision_note: decisionNote.trim() || null,
    }
    if (approve) {
      patch.approved_last_day = row.requested_last_day
      patch.clearance_status = 'NOT_STARTED'
    }
    const { error } = await supabase.from('resignations').update(patch).eq('id', row.id)
    if (error) {
      setBusy(false)
      toast.error('Decision failed', { description: error.message })
      return
    }
    if (approve) {
      const { seedClearanceSteps } = await import('@/lib/resignations')
      try {
        await seedClearanceSteps(row.id)
        await supabase.from('resignations').update({ clearance_status: 'IN_PROGRESS' }).eq('id', row.id)
      } catch (err) {
        console.warn(err)
      }
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'resignation',
      entityId: row.id,
      after: patch,
    })
    setBusy(false)
    setDecisionFor(null)
    setDecisionNote('')
    toast.success(approve ? 'Resignation approved' : 'Resignation rejected')
    void load()
  }

  const cancelMine = async (row: Resignation) => {
    if (!window.confirm('Withdraw this resignation request?')) return
    setBusy(true)
    const { error } = await supabase.from('resignations').update({ status: 'WITHDRAWN' }).eq('id', row.id)
    setBusy(false)
    if (error) {
      toast.error('Could not withdraw', { description: error.message })
      return
    }
    toast.success('Resignation withdrawn')
    void load()
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'mine', label: 'My requests', show: !!appUser?.employee_id },
    { id: 'pending', label: 'Pending approval', show: canApprove },
    { id: 'clearance', label: 'In clearance', show: canApprove || hasPermission('resignation.process') },
    { id: 'all', label: 'All', show: hasPermission('resignation.view') },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resignations & exit"
        description="Submit resignation, run clearance checklist, and process final settlement."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canApply && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Submit resignation
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-amber-500 opacity-80" />
            <div>
              <div className="text-xs text-muted-foreground uppercase">Pending</div>
              <div className="text-2xl font-semibold tabular-nums">{stats.pending}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <LogOut className="h-8 w-8 text-primary opacity-80" />
            <div>
              <div className="text-xs text-muted-foreground uppercase">In clearance</div>
              <div className="text-2xl font-semibold tabular-nums">{stats.clearance}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-80" />
            <div>
              <div className="text-xs text-muted-foreground uppercase">Settled</div>
              <div className="text-2xl font-semibold tabular-nums">{stats.settled}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-2">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <Button
                  key={t.id}
                  size="sm"
                  variant={tab === t.id ? 'default' : 'outline'}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </Button>
              ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No resignation records in this view.</div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20 cursor-pointer"
                  onClick={() => navigate(`/resignations/${r.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{r.resignation_no}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {r.employees?.full_name ?? '—'} ({r.employees?.employee_code ?? '—'})
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Last day: {r.approved_last_day ?? r.requested_last_day} · {r.reason_category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    {r.status === 'APPROVED' && (
                      <Badge variant="outline">{r.clearance_status.replace('_', ' ')}</Badge>
                    )}
                    {canApprove && r.status === 'PENDING' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDecisionFor({ row: r, approve: true })
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDecisionFor({ row: r, approve: false })
                          }}
                        >
                          <XCircle className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                    {tab === 'mine' && r.status === 'PENDING' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          void cancelMine(r)
                        }}
                      >
                        Withdraw
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit resignation</DialogTitle>
            <DialogDescription>Your manager and HR will review this request.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitApply} className="space-y-4">
            <div className="space-y-2">
              <Label>Requested last working day *</Label>
              <Input
                type="date"
                required
                value={form.requested_last_day}
                onChange={(e) => setForm({ ...form, requested_last_day: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason category *</Label>
              <Select
                required
                value={form.reason_category}
                onChange={(e) =>
                  setForm({ ...form, reason_category: e.target.value as (typeof REASON_CATEGORIES)[number] })
                }
              >
                {REASON_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                required
                rows={4}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Brief explanation for your resignation"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Submit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decisionFor} onOpenChange={(o) => !o && setDecisionFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decisionFor?.approve ? 'Approve resignation' : 'Reject resignation'}</DialogTitle>
            <DialogDescription>{decisionFor?.row.resignation_no}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => void submitDecision()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

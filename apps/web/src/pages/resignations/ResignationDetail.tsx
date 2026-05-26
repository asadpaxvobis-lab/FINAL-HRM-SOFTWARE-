import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, CheckCircle2, Save, Banknote } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { calcNetSettlement, pkr, syncClearanceStatus } from '@/lib/resignations'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type ClearanceStep = {
  id: string
  step_code: string
  step_name: string
  sort_order: number
  is_cleared: boolean
  cleared_at: string | null
  notes: string | null
}

type Resignation = {
  id: string
  resignation_no: string
  employee_id: string
  resignation_date: string
  requested_last_day: string
  approved_last_day: string | null
  reason_category: string
  reason: string
  status: string
  clearance_status: string
  settlement_status: string
  gratuity_amount: number
  leave_encashment_amount: number
  pending_salary_amount: number
  loan_deduction: number
  other_deductions: number
  net_settlement: number
  settlement_notes: string | null
  decision_note: string | null
  employees?: {
    full_name: string
    employee_code: string
    branches?: { name: string } | null
    departments?: { name: string } | null
  }
}

export function ResignationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canClear = hasPermission('resignation.approve') || hasPermission('resignation.process')
  const canSettle = hasPermission('resignation.process')
  const [row, setRow] = useState<Resignation | null>(null)
  const [steps, setSteps] = useState<ClearanceStep[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [settlement, setSettlement] = useState({
    gratuity_amount: 0,
    leave_encashment_amount: 0,
    pending_salary_amount: 0,
    loan_deduction: 0,
    other_deductions: 0,
    settlement_notes: '',
  })

  async function load() {
    if (!id) return
    setLoading(true)
    const [{ data: res, error }, { data: clr }] = await Promise.all([
      supabase
        .from('resignations')
        .select(
          `*, employees(full_name, employee_code, branches(name), departments(name))`
        )
        .eq('id', id)
        .single(),
      supabase
        .from('resignation_clearance_steps')
        .select('id, step_code, step_name, sort_order, is_cleared, cleared_at, notes')
        .eq('resignation_id', id)
        .order('sort_order'),
    ])
    if (error) {
      toast.error('Not found', { description: error.message })
      navigate('/resignations')
      return
    }
    const emp = res.employees
    const mapped = {
      ...res,
      employees: Array.isArray(emp) ? emp[0] : emp,
    } as Resignation
    setRow(mapped)
    setSteps((clr ?? []) as ClearanceStep[])
    setSettlement({
      gratuity_amount: +res.gratuity_amount,
      leave_encashment_amount: +res.leave_encashment_amount,
      pending_salary_amount: +res.pending_salary_amount,
      loan_deduction: +res.loan_deduction,
      other_deductions: +res.other_deductions,
      settlement_notes: res.settlement_notes ?? '',
    })
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const netPreview = calcNetSettlement(settlement)

  const toggleStep = async (step: ClearanceStep, checked: boolean) => {
    if (!canClear || !appUser) return
    setBusy(true)
    const { error } = await supabase
      .from('resignation_clearance_steps')
      .update({
        is_cleared: checked,
        cleared_by: checked ? appUser.id : null,
        cleared_at: checked ? new Date().toISOString() : null,
      })
      .eq('id', step.id)
    if (error) {
      setBusy(false)
      toast.error('Clearance update failed', { description: error.message })
      return
    }
    if (id) await syncClearanceStatus(id)
    setBusy(false)
    void load()
  }

  const saveSettlement = async () => {
    if (!row || !canSettle) return
    setBusy(true)
    const net_settlement = calcNetSettlement(settlement)
    const patch = {
      ...settlement,
      net_settlement,
      settlement_status: 'CALCULATED' as const,
    }
    const { error } = await supabase.from('resignations').update(patch).eq('id', row.id)
    setBusy(false)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'resignation_settlement', entityId: row.id, after: patch })
    toast.success('Settlement saved')
    void load()
  }

  const processSettlement = async () => {
    if (!row || !canSettle || !appUser) return
    if (row.clearance_status !== 'COMPLETED') {
      toast.error('Complete all clearance steps first')
      return
    }
    if (!window.confirm('Process final settlement and mark employee as resigned?')) return
    setBusy(true)
    const net_settlement = calcNetSettlement(settlement)
    const patch = {
      ...settlement,
      net_settlement,
      settlement_status: 'PROCESSED' as const,
      settlement_processed_at: new Date().toISOString(),
      settlement_processed_by: appUser.id,
    }
    const { error } = await supabase.from('resignations').update(patch).eq('id', row.id)
    if (error) {
      setBusy(false)
      toast.error('Process failed', { description: error.message })
      return
    }
    await supabase
      .from('employees')
      .update({ is_active: false, employment_status: 'Resigned' })
      .eq('id', row.employee_id)
    await writeAuditLog({ action: 'UPDATE', entityType: 'resignation_settlement', entityId: row.id, after: patch })
    setBusy(false)
    toast.success('Final settlement processed')
    void load()
  }

  if (loading || !row) {
    return (
      <div className="p-16 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const emp = row.employees

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.resignation_no}
        description={`${emp?.full_name ?? '—'} · ${emp?.employee_code ?? '—'}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/resignations')}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Status</span>
              <Badge>{row.status}</Badge>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Submitted</span>
              <span>{row.resignation_date}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Last working day</span>
              <span>{row.approved_last_day ?? row.requested_last_day}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Category</span>
              <span>{row.reason_category}</span>
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Reason</div>
              <p className="text-sm">{row.reason}</p>
            </div>
            {row.decision_note && (
              <div>
                <div className="text-muted-foreground mb-1">Decision note</div>
                <p className="text-sm">{row.decision_note}</p>
              </div>
            )}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              {emp?.departments?.name ?? '—'} · {emp?.branches?.name ?? '—'}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Clearance checklist</CardTitle>
            <CardDescription>
              Status: {row.clearance_status.replace(/_/g, ' ')}
              {row.status !== 'APPROVED' && ' — available after approval'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Clearance steps are created when the request is approved.</p>
            ) : (
              steps.map((s) => (
                <label
                  key={s.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-muted/10 cursor-pointer"
                >
                  <Checkbox
                    checked={s.is_cleared}
                    disabled={!canClear || row.status !== 'APPROVED' || busy}
                    onCheckedChange={(v) => void toggleStep(s, !!v)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{s.step_name}</div>
                    {s.cleared_at && (
                      <div className="text-xs text-muted-foreground">
                        Cleared {new Date(s.cleared_at).toLocaleString('en-PK')}
                      </div>
                    )}
                  </div>
                  {s.is_cleared && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                </label>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {row.status === 'APPROVED' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Final settlement
            </CardTitle>
            <CardDescription>
              Settlement status: {row.settlement_status.replace(/_/g, ' ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(
                [
                  ['gratuity_amount', 'Gratuity'],
                  ['leave_encashment_amount', 'Leave encashment'],
                  ['pending_salary_amount', 'Pending salary'],
                  ['loan_deduction', 'Loan deduction'],
                  ['other_deductions', 'Other deductions'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    disabled={!canSettle || row.settlement_status === 'PROCESSED'}
                    value={settlement[key]}
                    onChange={(e) => setSettlement({ ...settlement, [key]: +e.target.value || 0 })}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>Settlement notes</Label>
              <Textarea
                rows={2}
                disabled={!canSettle || row.settlement_status === 'PROCESSED'}
                value={settlement.settlement_notes}
                onChange={(e) => setSettlement({ ...settlement, settlement_notes: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/20">
              <span className="font-medium">Net settlement</span>
              <span className="text-xl font-semibold tabular-nums">{pkr(netPreview)}</span>
            </div>
            {canSettle && row.settlement_status !== 'PROCESSED' && (
              <div className="flex gap-2">
                <Button variant="outline" disabled={busy} onClick={() => void saveSettlement()}>
                  <Save className="h-4 w-4" /> Save calculation
                </Button>
                <Button disabled={busy || row.clearance_status !== 'COMPLETED'} onClick={() => void processSettlement()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Process & close
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

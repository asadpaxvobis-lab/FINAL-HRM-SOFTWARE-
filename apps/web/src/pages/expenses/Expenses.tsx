import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Loader2,
  Receipt,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  CircleDashed,
  CreditCard,
} from 'lucide-react'
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

type Claim = {
  id: string
  claim_no: string
  title: string
  employee_id: string
  claim_date: string
  total_amount: number
  currency: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED' | 'CANCELLED'
  submitted_at: string | null
  decided_at: string | null
  employees?: { employee_code: string; full_name: string }
}

type Tab = 'mine' | 'pending' | 'all'

const statusVariant = (s: Claim['status']) => {
  switch (s) {
    case 'REIMBURSED':
    case 'APPROVED':
      return 'success'
    case 'SUBMITTED':
      return 'warm'
    case 'REJECTED':
    case 'CANCELLED':
      return 'destructive'
    default:
      return 'outline'
  }
}

const statusIcon = (s: Claim['status']) => {
  if (s === 'REIMBURSED') return <CreditCard className="h-3 w-3" />
  if (s === 'APPROVED') return <CheckCircle2 className="h-3 w-3" />
  if (s === 'SUBMITTED') return <Clock className="h-3 w-3" />
  if (s === 'REJECTED' || s === 'CANCELLED') return <XCircle className="h-3 w-3" />
  return <CircleDashed className="h-3 w-3" />
}

export function ExpensesPage() {
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canApply = hasPermission('expense.apply')
  const canApprove = hasPermission('expense.approve')
  const canView = hasPermission('expense.view')
  const [tab, setTab] = useState<Tab>(canApprove ? 'pending' : 'mine')
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ title: '', claim_date: new Date().toISOString().slice(0, 10) })

  async function load() {
    setLoading(true)
    let query = supabase
      .from('expense_claims')
      .select('id, claim_no, title, employee_id, claim_date, total_amount, currency, status, submitted_at, decided_at, employees(employee_code, full_name)')
      .order('claim_date', { ascending: false })
      .limit(200)

    if (tab === 'mine' && appUser?.employee_id) {
      query = query.eq('employee_id', appUser.employee_id)
    } else if (tab === 'pending') {
      query = query.eq('status', 'SUBMITTED')
    }
    if (statusFilter !== 'ALL') query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) toast.error('Failed to load claims', { description: error.message })
    else {
      const mapped = (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as object),
        employees: Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees,
      })) as Claim[]
      setClaims(mapped)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tab, statusFilter])

  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'mine', label: 'My claims', visible: !!appUser?.employee_id },
    { id: 'pending', label: 'Pending approvals', visible: canApprove },
    { id: 'all', label: 'All claims', visible: canApprove || canView },
  ]
  const visibleTabs = tabs.filter((t) => t.visible)

  const totals = useMemo(() => {
    const sum = (st: Claim['status']) =>
      claims.filter((c) => c.status === st).reduce((s, c) => s + Number(c.total_amount), 0)
    return {
      pending: sum('SUBMITTED'),
      approved: sum('APPROVED'),
      reimbursed: sum('REIMBURSED'),
    }
  }, [claims])

  const createClaim = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser?.employee_id) {
      toast.error('Your user account is not linked to an employee record')
      return
    }
    setBusy(true)
    // Generate claim number scoped to the month YYYYMM-NNN
    const ym = new Date().toISOString().slice(0, 7).replace('-', '')
    const { data: existing } = await supabase
      .from('expense_claims')
      .select('claim_no')
      .eq('company_id', appUser.company_id)
      .ilike('claim_no', `EXP-${ym}-%`)
      .order('claim_no', { ascending: false })
      .limit(1)
    let n = 1
    if (existing && existing.length > 0) {
      const m = (existing[0] as { claim_no: string }).claim_no.match(/(\d+)$/)
      if (m) n = parseInt(m[1], 10) + 1
    }
    const claim_no = `EXP-${ym}-${String(n).padStart(4, '0')}`

    const payload = {
      company_id: appUser.company_id,
      claim_no,
      employee_id: appUser.employee_id,
      title: form.title.trim(),
      claim_date: form.claim_date,
      currency: 'PKR',
      total_amount: 0,
      status: 'DRAFT' as const,
    }
    const { data, error } = await supabase.from('expense_claims').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Create failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'expense_claim', entityId: data?.id, after: payload })
    toast.success('Claim created')
    setOpen(false)
    navigate(`/expenses/${data?.id}`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense claims"
        description="Submit business expenses for reimbursement. Approvers review and decide."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="expense.config">
              <Button variant="outline" size="sm" onClick={() => navigate('/expenses/categories')}>
                Categories
              </Button>
            </HasPermission>
            {canApply && appUser?.employee_id && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> New claim
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending approval</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totals.pending.toLocaleString()} PKR</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Approved (awaiting reimbursement)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totals.approved.toLocaleString()} PKR</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reimbursed</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totals.reimbursed.toLocaleString()} PKR</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b">
          {visibleTabs.map((t) => (
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
          <div className="ml-auto">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
              <option value="ALL">All statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="REIMBURSED">Reimbursed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : claims.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No claims here yet.
              {tab === 'mine' && canApply && appUser?.employee_id && (
                <div className="mt-4">
                  <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Submit your first claim
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {claims.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 px-6 py-4 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/expenses/${c.id}`)}
                >
                  <div className="min-w-[220px] flex-1">
                    <div className="font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.claim_no}</div>
                  </div>
                  {tab !== 'mine' && c.employees && (
                    <div className="text-sm text-muted-foreground min-w-[160px]">
                      <div className="font-medium text-foreground">{c.employees.full_name}</div>
                      <div className="text-xs font-mono">{c.employees.employee_code}</div>
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground min-w-[110px]">{c.claim_date}</div>
                  <div className="text-sm font-medium tabular-nums min-w-[120px] text-right">
                    {Number(c.total_amount).toLocaleString()} {c.currency}
                  </div>
                  <Badge variant={statusVariant(c.status)} className="gap-1">
                    {statusIcon(c.status)} {c.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New expense claim</DialogTitle>
            <DialogDescription>You'll add line items and receipts on the next screen.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createClaim} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Lahore client visit, week of 12 May"
              />
            </div>
            <div className="space-y-2">
              <Label>Claim date</Label>
              <Input
                type="date"
                value={form.claim_date}
                onChange={(e) => setForm({ ...form, claim_date: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

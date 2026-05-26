import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Loader2, RefreshCw, Lock, CheckCircle2, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { fmtPKR } from '@/lib/payroll'
import { downloadCsv, toCsv } from '@/lib/csv'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

type Period = {
  id: string
  code: string
  name: string
  frequency: string
  period_start: string
  period_end: string
  pay_date: string | null
  status: string
}

type Run = {
  id: string
  total_employees: number
  total_gross: number
  total_deductions: number
  total_employer_cost: number
  total_net: number
  status: string
  run_at: string
}

type Payslip = {
  id: string
  employee_id: string
  employee_code: string
  employee_name: string
  designation: string | null
  department: string | null
  branch: string | null
  basic: number
  gross_earnings: number
  total_deductions: number
  employer_contrib: number
  tax_amount: number
  net_pay: number
  status: string
  paid_leave_days: number
  unpaid_leave_days: number
  absent_days: number
  present_days: number
}

export function PayrollPeriodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canRun = hasPermission('payroll.run')
  const canRelease = hasPermission('payroll.release')
  const [period, setPeriod] = useState<Period | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [slips, setSlips] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  async function load() {
    if (!id) return
    setLoading(true)
    const [p, r] = await Promise.all([
      supabase.from('payroll_periods').select('*').eq('id', id).single(),
      supabase
        .from('payroll_runs')
        .select('*')
        .eq('period_id', id)
        .order('run_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (p.error || !p.data) {
      toast.error('Period not found', { description: p.error?.message })
      setLoading(false)
      return
    }
    setPeriod(p.data as Period)
    setRun((r.data as Run) ?? null)

    if (r.data?.id) {
      const ps = await supabase
        .from('payslips')
        .select(
          'id, employee_id, employee_code, employee_name, designation, department, branch, basic, gross_earnings, total_deductions, employer_contrib, tax_amount, net_pay, status, paid_leave_days, unpaid_leave_days, absent_days, present_days'
        )
        .eq('run_id', r.data.id)
        .order('employee_code')
      setSlips((ps.data ?? []) as Payslip[])
    } else {
      setSlips([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return slips
    return slips.filter(
      (s) =>
        s.employee_code.toLowerCase().includes(q) ||
        s.employee_name.toLowerCase().includes(q) ||
        (s.department ?? '').toLowerCase().includes(q) ||
        (s.designation ?? '').toLowerCase().includes(q)
    )
  }, [slips, query])

  const exportCsv = () => {
    if (slips.length === 0) {
      toast.error('No payslips to export')
      return
    }
    const csv = toCsv(
      slips.map((s) => ({
        employee_code: s.employee_code,
        employee_name: s.employee_name,
        department: s.department ?? '',
        designation: s.designation ?? '',
        branch: s.branch ?? '',
        present_days: s.present_days,
        paid_leave: s.paid_leave_days,
        unpaid_leave: s.unpaid_leave_days,
        absent_days: s.absent_days,
        basic: s.basic,
        gross_earnings: s.gross_earnings,
        total_deductions: s.total_deductions,
        tax_amount: s.tax_amount,
        employer_contrib: s.employer_contrib,
        net_pay: s.net_pay,
      }))
    )
    downloadCsv(`payroll-${period?.code}.csv`, csv)
  }

  const finalize = async (newStatus: 'FINALIZED' | 'RELEASED' | 'PAID') => {
    if (!period) return
    if (!window.confirm(`Mark period as ${newStatus}?`)) return
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'FINALIZED') update.finalized_at = new Date().toISOString()
    const { error } = await supabase.from('payroll_periods').update(update).eq('id', period.id)
    if (error) {
      toast.error('Update failed', { description: error.message })
      return
    }
    const slipStatus = newStatus === 'PAID' ? 'PAID' : 'FINAL'
    await supabase.from('payslips').update({ status: slipStatus }).eq('period_id', period.id)
    await writeAuditLog({ action: 'UPDATE', entityType: 'payroll_period', entityId: period.id, after: { status: newStatus } })
    toast.success(`Period marked ${newStatus}`)
    void load()
  }

  if (loading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!period) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title={period.name}
        description={`${period.period_start} → ${period.period_end} · ${period.frequency}${period.pay_date ? ` · Pay date ${period.pay_date}` : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/payroll')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={slips.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {canRun && period.status === 'PROCESSING' && (
              <Button size="sm" onClick={() => void finalize('FINALIZED')}>
                <Lock className="h-4 w-4" /> Finalize
              </Button>
            )}
            {canRelease && period.status === 'FINALIZED' && (
              <Button size="sm" onClick={() => void finalize('RELEASED')}>
                <CheckCircle2 className="h-4 w-4" /> Release
              </Button>
            )}
            {canRelease && period.status === 'RELEASED' && (
              <Button size="sm" onClick={() => void finalize('PAID')}>
                <CheckCircle2 className="h-4 w-4" /> Mark paid
              </Button>
            )}
          </>
        }
      />

      {run ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Employees</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{run.total_employees}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total gross</CardDescription>
              <CardTitle className="text-xl tabular-nums">{fmtPKR(Number(run.total_gross))}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total deductions</CardDescription>
              <CardTitle className="text-xl tabular-nums">{fmtPKR(Number(run.total_deductions))}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Employer contribution</CardDescription>
              <CardTitle className="text-xl tabular-nums">{fmtPKR(Number(run.total_employer_cost))}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total net</CardDescription>
              <CardTitle className="text-xl tabular-nums text-emerald-600">{fmtPKR(Number(run.total_net))}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No payroll run has been executed yet for this period. Return to the Payroll page and click <strong>Run</strong>.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Payslips</CardTitle>
            <CardDescription>{filtered.length} shown</CardDescription>
          </div>
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code, name, department…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No payslips.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Dept / Designation</th>
                    <th className="px-4 py-3 text-right">Present</th>
                    <th className="px-4 py-3 text-right">PL</th>
                    <th className="px-4 py-3 text-right">UPL</th>
                    <th className="px-4 py-3 text-right">Basic</th>
                    <th className="px-4 py-3 text-right">Gross</th>
                    <th className="px-4 py-3 text-right">Deduct</th>
                    <th className="px-4 py-3 text-right">Tax</th>
                    <th className="px-4 py-3 text-right">Net</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => navigate(`/payroll/payslip/${s.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs">{s.employee_code}</td>
                      <td className="px-4 py-3 font-medium">{s.employee_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {s.department ?? '—'}
                        <div className="text-xs">{s.designation ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.present_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.paid_leave_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.unpaid_leave_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPKR(Number(s.basic))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPKR(Number(s.gross_earnings))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPKR(Number(s.total_deductions))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPKR(Number(s.tax_amount))}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtPKR(Number(s.net_pay))}</td>
                      <td className="px-4 py-3">
                        <Badge variant={s.status === 'PAID' ? 'success' : s.status === 'FINAL' ? 'warm' : 'outline'}>
                          {s.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

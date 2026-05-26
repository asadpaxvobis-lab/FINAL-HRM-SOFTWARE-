import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { downloadCsv, toCsv } from '@/lib/csv'
import { FilterBar, ReportBackLink, fmtMoney, printableStyles } from './shared'

type Row = {
  id: string
  loan_no: string
  loan_type_code: string | null
  loan_type_name: string | null
  principal_amount: number | null
  monthly_installment: number | null
  total_payable: number | null
  paid_amount: number | null
  outstanding_amount: number | null
  start_date: string | null
  end_date: string | null
  status: string
  employees: {
    employee_code: string
    full_name: string
    departments: { name: string } | null
    branches: { name: string } | null
  } | null
}

const ACTIVE_STATUSES = ['ACTIVE', 'DISBURSED', 'OUTSTANDING', 'APPROVED']

export function LoanOutstandingPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [deptFilter, setDeptFilter] = useState('')

  async function load() {
    setLoading(true)
    let q = supabase
      .from('loans')
      .select(
        'id, loan_no, loan_type_code, loan_type_name, principal_amount, monthly_installment, total_payable, paid_amount, outstanding_amount, start_date, end_date, status, employees(employee_code, full_name, departments(name), branches(name))'
      )
      .order('outstanding_amount', { ascending: false })
    if (statusFilter === 'active') q = q.in('status', ACTIVE_STATUSES)
    const { data, error } = await q
    if (error) toast.error('Failed to load', { description: error.message })
    setRows(
      ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
        const e = Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees
        const em = e as Record<string, unknown> | null | undefined
        const flatten = (k: string) => {
          if (!em) return null
          const v = em[k]
          return Array.isArray(v) ? ((v as unknown[])[0] as object | null) : (v as object | null)
        }
        const employees = em
          ? {
              employee_code: String(em.employee_code ?? ''),
              full_name: String(em.full_name ?? ''),
              departments: flatten('departments') as { name: string } | null,
              branches: flatten('branches') as { name: string } | null,
            }
          : null
        return { ...(r as object), employees } as Row
      })
    )
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [statusFilter])

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.employees?.departments?.name).filter(Boolean) as string[])).sort(),
    [rows]
  )

  const filtered = useMemo(
    () => rows.filter((r) => !deptFilter || r.employees?.departments?.name === deptFilter),
    [rows, deptFilter]
  )

  const totals = useMemo(() => {
    const sum = (k: keyof Row) => filtered.reduce((a, r) => a + Number((r[k] as number) ?? 0), 0)
    return {
      principal: sum('principal_amount'),
      payable: sum('total_payable'),
      paid: sum('paid_amount'),
      outstanding: sum('outstanding_amount'),
    }
  }, [filtered])

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({
        loan_no: r.loan_no,
        employee_code: r.employees?.employee_code ?? '',
        employee_name: r.employees?.full_name ?? '',
        department: r.employees?.departments?.name ?? '',
        branch: r.employees?.branches?.name ?? '',
        loan_type: r.loan_type_name ?? '',
        principal: r.principal_amount ?? 0,
        installment: r.monthly_installment ?? 0,
        total_payable: r.total_payable ?? 0,
        paid: r.paid_amount ?? 0,
        outstanding: r.outstanding_amount ?? 0,
        start_date: r.start_date ?? '',
        end_date: r.end_date ?? '',
        status: r.status,
      }))
    )
    downloadCsv(`loan-outstanding-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Loan outstanding"
        description="Active employee loans with paid-to-date and outstanding balance."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      <FilterBar>
        <div className="min-w-[140px]">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}>
            <option value="active">Active only</option>
            <option value="all">All loans</option>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Label className="text-xs">Department</Label>
          <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Principal</div>
            <div className="text-xl font-semibold tabular-nums">PKR {fmtMoney(totals.principal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Total payable</div>
            <div className="text-xl font-semibold tabular-nums">PKR {fmtMoney(totals.payable)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Paid to date</div>
            <div className="text-xl font-semibold tabular-nums text-emerald-600">PKR {fmtMoney(totals.paid)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Outstanding</div>
            <div className="text-xl font-semibold tabular-nums text-rose-600">PKR {fmtMoney(totals.outstanding)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm report-table">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Loan #</th>
                  <th className="text-left px-3 py-2">Employee</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Principal</th>
                  <th className="text-right px-3 py-2">Installment</th>
                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-3 py-2">Outstanding</th>
                  <th className="text-left px-3 py-2">Tenure</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link to={`/loans/${r.id}`} className="hover:underline">
                        {r.loan_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.employees?.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.employees?.employee_code ?? ''}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.employees?.departments?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{r.loan_type_name ?? r.loan_type_code ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.principal_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.monthly_installment)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtMoney(r.paid_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-700">
                      {fmtMoney(r.outstanding_amount)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.start_date ?? '—'} → {r.end_date ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                      No loans match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-muted font-semibold">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right">
                      Totals ({filtered.length})
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.principal)}</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.paid)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.outstanding)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </CardContent>
      </Card>

      <style>{printableStyles}</style>
    </div>
  )
}

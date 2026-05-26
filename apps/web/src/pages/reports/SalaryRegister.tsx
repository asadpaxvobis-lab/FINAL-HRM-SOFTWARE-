import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { downloadCsv, toCsv } from '@/lib/csv'
import { FilterBar, ReportBackLink, fmtMoney, printableStyles } from './shared'

type Period = { id: string; code: string; name: string; period_start: string; period_end: string; status: string }
type Payslip = {
  id: string
  employee_code: string
  employee_name: string
  designation: string | null
  department: string | null
  branch: string | null
  basic: number | null
  gross_earnings: number | null
  total_deductions: number | null
  tax_amount: number | null
  eobi_employee: number | null
  pf_employee: number | null
  net_pay: number | null
  status: string
}

export function SalaryRegisterPage() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [rows, setRows] = useState<Payslip[]>([])
  const [loading, setLoading] = useState(false)
  const [branchFilter, setBranchFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('payroll_periods')
        .select('id, code, name, period_start, period_end, status')
        .order('period_start', { ascending: false })
        .limit(36)
      const list = (data ?? []) as Period[]
      setPeriods(list)
      if (list.length > 0 && !periodId) setPeriodId(list[0].id)
    })()
  }, [])

  async function load() {
    if (!periodId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('payslips')
      .select(
        'id, employee_code, employee_name, designation, department, branch, basic, gross_earnings, total_deductions, tax_amount, eobi_employee, pf_employee, net_pay, status'
      )
      .eq('period_id', periodId)
      .order('employee_code')
    if (error) toast.error('Failed to load', { description: error.message })
    setRows(((data ?? []) as Payslip[]))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [periodId])

  const branches = useMemo(() => Array.from(new Set(rows.map((r) => r.branch).filter(Boolean) as string[])).sort(), [rows])
  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department).filter(Boolean) as string[])).sort(), [rows])

  const filtered = useMemo(
    () => rows.filter((r) => (!branchFilter || r.branch === branchFilter) && (!deptFilter || r.department === deptFilter)),
    [rows, branchFilter, deptFilter]
  )

  const totals = useMemo(() => {
    const sum = (k: keyof Payslip) => filtered.reduce((a, r) => a + Number((r[k] as number) ?? 0), 0)
    return {
      basic: sum('basic'),
      gross: sum('gross_earnings'),
      deductions: sum('total_deductions'),
      tax: sum('tax_amount'),
      eobi: sum('eobi_employee'),
      pf: sum('pf_employee'),
      net: sum('net_pay'),
    }
  }, [filtered])

  const period = periods.find((p) => p.id === periodId)

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        branch: r.branch ?? '',
        department: r.department ?? '',
        designation: r.designation ?? '',
        basic: r.basic ?? 0,
        gross_earnings: r.gross_earnings ?? 0,
        eobi_employee: r.eobi_employee ?? 0,
        pf_employee: r.pf_employee ?? 0,
        tax_amount: r.tax_amount ?? 0,
        total_deductions: r.total_deductions ?? 0,
        net_pay: r.net_pay ?? 0,
        status: r.status,
      }))
    )
    downloadCsv(`salary-register-${period?.code ?? 'period'}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Salary register"
        description={period ? `${period.name} · ${period.period_start} → ${period.period_end}` : 'Pick a payroll period'}
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
        <div className="min-w-[260px]">
          <Label className="text-xs">Payroll period</Label>
          <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.length === 0 && <option value="">No periods found</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status})
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs">Branch</Label>
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[160px]">
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
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} payslip(s)</div>
      </FilterBar>

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
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-right px-3 py-2">Basic</th>
                  <th className="text-right px-3 py-2">Gross</th>
                  <th className="text-right px-3 py-2">EOBI</th>
                  <th className="text-right px-3 py-2">PF</th>
                  <th className="text-right px-3 py-2">Tax</th>
                  <th className="text-right px-3 py-2">Deductions</th>
                  <th className="text-right px-3 py-2">Net</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.employee_code}</td>
                    <td className="px-3 py-2">{r.employee_name}</td>
                    <td className="px-3 py-2 text-xs">{r.department ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.basic)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.gross_earnings)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.eobi_employee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.pf_employee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.tax_amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.total_deductions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.net_pay)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                      No payslips for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot className="bg-muted font-semibold text-sm">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right">
                      Totals ({filtered.length})
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.basic)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.eobi)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.pf)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.tax)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.deductions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.net)}</td>
                    <td />
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

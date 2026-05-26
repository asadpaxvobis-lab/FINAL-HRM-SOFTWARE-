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
type Variant = 'EOBI' | 'PF' | 'TAX'

type Row = {
  id: string
  employee_code: string
  employee_name: string
  cnic: string | null
  department: string | null
  basic: number | null
  gross_earnings: number | null
  eobi_employee: number | null
  eobi_employer: number | null
  pf_employee: number | null
  pf_employer: number | null
  tax_amount: number | null
}

export function StatutoryReportPage() {
  const [variant, setVariant] = useState<Variant>('EOBI')
  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('payroll_periods')
        .select('id, code, name, period_start, period_end, status')
        .order('period_start', { ascending: false })
        .limit(24)
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
        'id, employee_code, employee_name, department, basic, gross_earnings, eobi_employee, eobi_employer, pf_employee, pf_employer, tax_amount, employees(cnic)'
      )
      .eq('period_id', periodId)
      .order('employee_code')
    if (error) toast.error('Failed to load', { description: error.message })
    const mapped = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const e = Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees
      return { ...(r as object), cnic: (e as { cnic?: string } | null | undefined)?.cnic ?? null } as Row
    })
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [periodId])

  const period = periods.find((p) => p.id === periodId)

  const totals = useMemo(() => {
    const sum = (k: keyof Row) => rows.reduce((a, r) => a + Number((r[k] as number) ?? 0), 0)
    return {
      eobi_emp: sum('eobi_employee'),
      eobi_er: sum('eobi_employer'),
      pf_emp: sum('pf_employee'),
      pf_er: sum('pf_employer'),
      tax: sum('tax_amount'),
      gross: sum('gross_earnings'),
    }
  }, [rows])

  function exportCsv() {
    const map = rows.map((r) => {
      const base = {
        employee_code: r.employee_code,
        employee_name: r.employee_name,
        cnic: r.cnic ?? '',
        department: r.department ?? '',
        gross_earnings: r.gross_earnings ?? 0,
      }
      if (variant === 'EOBI') return { ...base, eobi_employee: r.eobi_employee ?? 0, eobi_employer: r.eobi_employer ?? 0 }
      if (variant === 'PF') return { ...base, pf_employee: r.pf_employee ?? 0, pf_employer: r.pf_employer ?? 0 }
      return { ...base, tax_amount: r.tax_amount ?? 0 }
    })
    const csv = toCsv(map)
    downloadCsv(`${variant.toLowerCase()}-statement-${period?.code ?? 'period'}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Statutory statement"
        description={period ? `${period.name} · ${variant}` : 'Pick a payroll period'}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
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
        <div className="min-w-[200px]">
          <Label className="text-xs">Statement type</Label>
          <Select value={variant} onChange={(e) => setVariant(e.target.value as Variant)}>
            <option value="EOBI">EOBI</option>
            <option value="PF">Provident fund</option>
            <option value="TAX">Income tax</option>
          </Select>
        </div>
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
                  <th className="text-left px-3 py-2">CNIC</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-right px-3 py-2">Gross</th>
                  {variant === 'EOBI' && (
                    <>
                      <th className="text-right px-3 py-2">Employee EOBI</th>
                      <th className="text-right px-3 py-2">Employer EOBI</th>
                      <th className="text-right px-3 py-2">Total EOBI</th>
                    </>
                  )}
                  {variant === 'PF' && (
                    <>
                      <th className="text-right px-3 py-2">Employee PF</th>
                      <th className="text-right px-3 py-2">Employer PF</th>
                      <th className="text-right px-3 py-2">Total PF</th>
                    </>
                  )}
                  {variant === 'TAX' && <th className="text-right px-3 py-2">Income tax</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => {
                  const eobiTotal = Number(r.eobi_employee ?? 0) + Number(r.eobi_employer ?? 0)
                  const pfTotal = Number(r.pf_employee ?? 0) + Number(r.pf_employer ?? 0)
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-xs">{r.employee_code}</td>
                      <td className="px-3 py-2">{r.employee_name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cnic ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">{r.department ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.gross_earnings)}</td>
                      {variant === 'EOBI' && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.eobi_employee)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.eobi_employer)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(eobiTotal)}</td>
                        </>
                      )}
                      {variant === 'PF' && (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.pf_employee)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.pf_employer)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(pfTotal)}</td>
                        </>
                      )}
                      {variant === 'TAX' && (
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.tax_amount)}</td>
                      )}
                    </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={variant === 'TAX' ? 6 : 8} className="px-4 py-12 text-center text-muted-foreground">
                      No payslips found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted font-semibold">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.gross)}</td>
                    {variant === 'EOBI' && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.eobi_emp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.eobi_er)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.eobi_emp + totals.eobi_er)}</td>
                      </>
                    )}
                    {variant === 'PF' && (
                      <>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.pf_emp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.pf_er)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.pf_emp + totals.pf_er)}</td>
                      </>
                    )}
                    {variant === 'TAX' && <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.tax)}</td>}
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

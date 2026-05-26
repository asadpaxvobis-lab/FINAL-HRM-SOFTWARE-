import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, RefreshCw, AlertTriangle } from 'lucide-react'
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

type Period = {
  id: string
  code: string
  name: string
  period_start: string
  period_end: string
  pay_date: string | null
  status: string
}

type Row = {
  id: string
  employee_id: string
  employee_code: string
  employee_name: string
  department: string | null
  net_pay: number | null
  status: string
  bank_name: string | null
  account_number: string | null
  iban: string | null
  account_title: string | null
}

export function BankDisbursementPage() {
  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('payroll_periods')
        .select('id, code, name, period_start, period_end, pay_date, status')
        .order('period_start', { ascending: false })
        .limit(24)
      const list = (data ?? []) as Period[]
      setPeriods(list)
      const finalized = list.find((p) => p.status === 'FINALIZED' || p.status === 'RELEASED' || p.status === 'PAID')
      setPeriodId(finalized?.id ?? list[0]?.id ?? '')
    })()
  }, [])

  async function load() {
    if (!periodId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('payslips')
      .select('id, employee_id, employee_code, employee_name, department, net_pay, status')
      .eq('period_id', periodId)
      .order('employee_code')
    if (error) {
      toast.error('Failed to load', { description: error.message })
      setLoading(false)
      return
    }
    const slips = (data ?? []) as Omit<Row, 'bank_name' | 'account_number' | 'iban' | 'account_title'>[]
    const empIds = [...new Set(slips.map((s) => s.employee_id))]
    let bankMap = new Map<string, { bank_name: string; account_number: string; iban: string | null; account_title: string }>()
    if (empIds.length > 0) {
      const { data: banks } = await supabase
        .from('employee_bank_accounts')
        .select('employee_id, bank_name, account_number, iban, account_title')
        .in('employee_id', empIds)
        .eq('is_primary', true)
        .eq('is_active', true)
      for (const b of banks ?? []) {
        bankMap.set(b.employee_id, {
          bank_name: b.bank_name,
          account_number: b.account_number,
          iban: b.iban,
          account_title: b.account_title,
        })
      }
    }
    setRows(
      slips.map((s) => {
        const bank = bankMap.get(s.employee_id)
        return {
          ...s,
          bank_name: bank?.bank_name ?? null,
          account_number: bank?.account_number ?? null,
          iban: bank?.iban ?? null,
          account_title: bank?.account_title ?? null,
        }
      })
    )
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [periodId])

  const period = periods.find((p) => p.id === periodId)
  const total = useMemo(() => rows.reduce((a, r) => a + Number(r.net_pay ?? 0), 0), [rows])
  const missingBank = useMemo(() => rows.filter((r) => !r.iban && !r.account_number).length, [rows])

  function exportCsv() {
    const csv = toCsv(
      rows.map((r, i) => ({
        sr_no: i + 1,
        employee_code: r.employee_code,
        beneficiary_name: r.account_title || r.employee_name,
        bank_name: r.bank_name ?? '',
        account_number: r.account_number ?? '',
        iban: r.iban ?? '',
        department: r.department ?? '',
        amount: Number(r.net_pay ?? 0).toFixed(2),
        currency: 'PKR',
        pay_date: period?.pay_date ?? '',
        period: period?.code ?? '',
      }))
    )
    downloadCsv(`bank-disbursement-${period?.code ?? 'period'}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Bank disbursement file"
        description={
          period
            ? `${period.name} · pay date ${period.pay_date ?? '—'} · status ${period.status}`
            : 'Pick a payroll period'
        }
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

      {period && period.status === 'DRAFT' && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm print:hidden">
          <AlertTriangle className="h-4 w-4" />
          This period is still in DRAFT — amounts may change before finalization.
        </div>
      )}

      {missingBank > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm print:hidden">
          <AlertTriangle className="h-4 w-4" />
          {missingBank} employee(s) have no bank account on file — add details under Employee → Bank tab.
        </div>
      )}

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
        <div className="ml-auto text-xs text-muted-foreground">
          {rows.length} beneficiary(ies) · Total payable{' '}
          <span className="font-semibold text-foreground">PKR {fmtMoney(total)}</span>
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
                  <th className="text-left px-3 py-2 w-16">Sr</th>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Beneficiary</th>
                  <th className="text-left px-3 py-2">Bank</th>
                  <th className="text-left px-3 py-2">Account / IBAN</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-right px-3 py-2">Amount (PKR)</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{r.account_title || r.employee_name}</td>
                    <td className="px-3 py-2 text-xs">{r.bank_name ?? '—'}</td>
                    <td className="px-3 py-2 text-xs font-mono">
                      {r.iban ? (
                        <span title={r.account_number ?? ''}>{r.iban}</span>
                      ) : (
                        r.account_number ?? '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.department ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.net_pay)}</td>
                    <td className="px-3 py-2 text-xs">
                      <Badge variant="outline" className="text-[10px]">
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                      No payslips found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted font-semibold">
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-right">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(total)}</td>
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

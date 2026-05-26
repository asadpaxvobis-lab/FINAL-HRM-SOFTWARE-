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
import { FilterBar, ReportBackLink, fmtNum, printableStyles } from './shared'

type LeaveType = { id: string; code: string; name: string; is_paid: boolean }
type Employee = { id: string; employee_code: string; full_name: string; departments: { name: string } | null }
type Balance = {
  employee_id: string
  leave_type_id: string
  opening: number | null
  granted: number | null
  consumed: number | null
  carry_forward: number | null
}

export function LeaveRegisterPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [types, setTypes] = useState<LeaveType[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [deptFilter, setDeptFilter] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: lt }, { data: emps }, { data: bals }] = await Promise.all([
      supabase.from('leave_types').select('id, code, name, is_paid').eq('is_active', true).order('name'),
      supabase
        .from('employees')
        .select('id, employee_code, full_name, departments(name)')
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('leave_balances')
        .select('employee_id, leave_type_id, opening, granted, consumed, carry_forward')
        .eq('year', year),
    ])
    setTypes(((lt ?? []) as LeaveType[]))
    setEmployees(
      ((emps ?? []) as unknown as Record<string, unknown>[]).map((r) => {
        const d = r.departments
        return { ...(r as object), departments: Array.isArray(d) ? ((d as unknown[])[0] as object | null) : (d as object | null) } as Employee
      })
    )
    setBalances((bals ?? []) as Balance[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [year])

  const balMap = useMemo(() => {
    const m = new Map<string, Balance>()
    balances.forEach((b) => m.set(`${b.employee_id}|${b.leave_type_id}`, b))
    return m
  }, [balances])

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.departments?.name).filter(Boolean) as string[])).sort(),
    [employees]
  )

  const filteredEmps = useMemo(
    () => employees.filter((e) => !deptFilter || e.departments?.name === deptFilter),
    [employees, deptFilter]
  )

  const cellFor = (empId: string, ltId: string) => {
    const b = balMap.get(`${empId}|${ltId}`)
    if (!b) return { available: 0, consumed: 0, opening: 0 }
    const opening = Number(b.opening ?? 0) + Number(b.carry_forward ?? 0)
    const granted = Number(b.granted ?? 0)
    const consumed = Number(b.consumed ?? 0)
    return { available: opening + granted - consumed, consumed, opening: opening + granted }
  }

  function exportCsv() {
    const data: Record<string, unknown>[] = []
    filteredEmps.forEach((e) => {
      const row: Record<string, unknown> = {
        employee_code: e.employee_code,
        employee_name: e.full_name,
        department: e.departments?.name ?? '',
      }
      types.forEach((t) => {
        const c = cellFor(e.id, t.id)
        row[`${t.code} entitled`] = c.opening
        row[`${t.code} consumed`] = c.consumed
        row[`${t.code} balance`] = c.available
      })
      data.push(row)
    })
    const csv = toCsv(data)
    downloadCsv(`leave-register-${year}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Leave register"
        description={`Year ${year} · entitlement, consumption and available balance per leave type.`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={filteredEmps.length === 0}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </>
        }
      />

      <FilterBar>
        <div className="min-w-[140px]">
          <Label className="text-xs">Year</Label>
          <Select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {Array.from({ length: 6 }, (_, i) => today.getFullYear() - 3 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
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
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredEmps.length} employee(s) · {types.length} leave type(s)
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
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th rowSpan={2} className="text-left px-3 py-2 align-bottom">
                    Code
                  </th>
                  <th rowSpan={2} className="text-left px-3 py-2 align-bottom">
                    Employee
                  </th>
                  <th rowSpan={2} className="text-left px-3 py-2 align-bottom">
                    Department
                  </th>
                  {types.map((t) => (
                    <th key={t.id} colSpan={3} className="text-center px-2 py-2 border-l">
                      {t.name}
                    </th>
                  ))}
                </tr>
                <tr>
                  {types.map((t) => (
                    <th key={t.id} className="text-center text-[10px] px-1 py-1 border-l">
                      <span className="block">Entitled · Used · Bal</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredEmps.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{e.employee_code}</td>
                    <td className="px-3 py-2">{e.full_name}</td>
                    <td className="px-3 py-2 text-xs">{e.departments?.name ?? '—'}</td>
                    {types.map((t) => {
                      const c = cellFor(e.id, t.id)
                      return (
                        <td key={t.id} className="px-2 py-2 text-center text-xs border-l tabular-nums">
                          <span className="text-muted-foreground">{fmtNum(c.opening, 1)}</span>
                          {' / '}
                          <span className="text-muted-foreground">{fmtNum(c.consumed, 1)}</span>
                          {' / '}
                          <span className="font-semibold">{fmtNum(c.available, 1)}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {filteredEmps.length === 0 && (
                  <tr>
                    <td colSpan={3 + types.length} className="px-4 py-12 text-center text-muted-foreground">
                      No employees match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <style>{printableStyles}</style>
    </div>
  )
}

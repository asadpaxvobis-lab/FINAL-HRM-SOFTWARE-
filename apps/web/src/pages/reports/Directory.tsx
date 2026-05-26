import { useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Printer, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { downloadCsv, toCsv } from '@/lib/csv'
import { FilterBar, ReportBackLink, printableStyles } from './shared'

type Row = {
  id: string
  employee_code: string
  full_name: string
  email: string | null
  phone: string | null
  cnic: string | null
  date_of_joining: string | null
  employment_status: string | null
  is_active: boolean
  branches: { name: string } | null
  departments: { name: string } | null
  designations: { title: string } | null
}

export function DirectoryReportPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')

  async function load() {
    setLoading(true)
    let q = supabase
      .from('employees')
      .select(
        'id, employee_code, full_name, email, phone, cnic, date_of_joining, employment_status, is_active, branches(name), departments(name), designations(title)'
      )
      .order('full_name')
    if (statusFilter === 'active') q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) toast.error('Failed to load', { description: error.message })
    else {
      const mapped = (data ?? []).map((r) => {
        const row = r as Record<string, unknown>
        const pick = (k: string) => {
          const v = row[k]
          return Array.isArray(v) ? (v[0] as object | null) : (v as object | null)
        }
        return {
          ...(row as object),
          branches: pick('branches'),
          departments: pick('departments'),
          designations: pick('designations'),
        } as Row
      })
      setRows(mapped)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [statusFilter])

  const branches = useMemo(() => {
    const s = new Set(rows.map((r) => r.branches?.name).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [rows])
  const departments = useMemo(() => {
    const s = new Set(rows.map((r) => r.departments?.name).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter && r.branches?.name !== branchFilter) return false
      if (deptFilter && r.departments?.name !== deptFilter) return false
      if (search.trim()) {
        const s = search.toLowerCase()
        if (
          !r.full_name.toLowerCase().includes(s) &&
          !r.employee_code.toLowerCase().includes(s) &&
          !(r.email ?? '').toLowerCase().includes(s) &&
          !(r.cnic ?? '').toLowerCase().includes(s)
        )
          return false
      }
      return true
    })
  }, [rows, branchFilter, deptFilter, search])

  const summary = useMemo(() => {
    const byBranch = new Map<string, number>()
    const byDept = new Map<string, number>()
    filtered.forEach((r) => {
      const b = r.branches?.name ?? 'Unassigned'
      const d = r.departments?.name ?? 'Unassigned'
      byBranch.set(b, (byBranch.get(b) ?? 0) + 1)
      byDept.set(d, (byDept.get(d) ?? 0) + 1)
    })
    return {
      total: filtered.length,
      byBranch: Array.from(byBranch.entries()).sort((a, b) => b[1] - a[1]),
      byDept: Array.from(byDept.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [filtered])

  function exportCsv() {
    const csv = toCsv(
      filtered.map((r) => ({
        employee_code: r.employee_code,
        full_name: r.full_name,
        branch: r.branches?.name ?? '',
        department: r.departments?.name ?? '',
        designation: r.designations?.title ?? '',
        employment_status: r.employment_status ?? '',
        cnic: r.cnic ?? '',
        email: r.email ?? '',
        phone: r.phone ?? '',
        date_of_joining: r.date_of_joining ?? '',
        is_active: r.is_active ? 'Yes' : 'No',
      }))
    )
    downloadCsv(`employee-directory-${new Date().toISOString().slice(0, 10)}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <ReportBackLink />
      <PageHeader
        title="Employee directory"
        description="All employees with branch, department, designation and contact details."
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
        <div className="flex-1 min-w-[180px]">
          <Label className="text-xs">Search</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Name, code, CNIC, email…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
        <div className="min-w-[140px]">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'active' | 'all')}>
            <option value="active">Active only</option>
            <option value="all">All</option>
          </Select>
        </div>
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Total employees</div>
            <div className="text-2xl font-semibold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground mb-2">By branch</div>
            <div className="space-y-1 text-sm max-h-24 overflow-y-auto">
              {summary.byBranch.map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="truncate">{k}</span>
                  <span className="tabular-nums font-medium">{v}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground mb-2">By department</div>
            <div className="space-y-1 text-sm max-h-24 overflow-y-auto">
              {summary.byDept.map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="truncate">{k}</span>
                  <span className="tabular-nums font-medium">{v}</span>
                </div>
              ))}
            </div>
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
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Branch</th>
                  <th className="text-left px-4 py-3">Department</th>
                  <th className="text-left px-4 py-3">Designation</th>
                  <th className="text-left px-4 py-3">DOJ</th>
                  <th className="text-left px-4 py-3">CNIC</th>
                  <th className="text-left px-4 py-3">Phone</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{r.employee_code}</td>
                    <td className="px-4 py-2 font-medium">{r.full_name}</td>
                    <td className="px-4 py-2">{r.branches?.name ?? '—'}</td>
                    <td className="px-4 py-2">{r.departments?.name ?? '—'}</td>
                    <td className="px-4 py-2">{r.designations?.title ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r.date_of_joining ? new Date(r.date_of_joining).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.cnic ?? '—'}</td>
                    <td className="px-4 py-2">{r.phone ?? '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant={r.is_active ? 'success' : 'secondary'} className="text-[10px]">
                        {r.employment_status ?? (r.is_active ? 'Active' : 'Inactive')}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
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

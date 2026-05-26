import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search, Users, ClipboardCheck, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { WEEKDAY_NAMES } from '@/lib/constants'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { avatarColorFor, initialsFromName } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type EmployeeRow = {
  id: string
  employee_code: string
  full_name: string
  branch_id: string | null
  department_id: string | null
  branches?: { name: string } | null
  departments?: { name: string } | null
}

type CurrentAssignment = {
  employee_id: string
  shift_id: string
  effective_from: string
  effective_to: string | null
  weekly_off: string[]
  shifts?: { code: string; name: string } | null
}

type Shift = { id: string; code: string; name: string }
type Branch = { id: string; name: string }
type Department = { id: string; name: string }

const today = () => new Date().toISOString().slice(0, 10)

export function RosterPage() {
  const { hasPermission } = useAuth()
  const canAssign = hasPermission('shift.assign')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [assignments, setAssignments] = useState<Map<string, CurrentAssignment>>(new Map())
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    shift_id: '',
    effective_from: today(),
    effective_to: '',
    weekly_off: ['Sunday'] as string[],
  })

  async function load() {
    setLoading(true)
    const [emp, sh, br, dp] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_code, full_name, branch_id, department_id, branches(name), departments(name)')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('shifts').select('id, code, name').eq('is_active', true).order('name'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    ])
    if (emp.error) {
      toast.error('Failed to load employees', { description: emp.error.message })
      setLoading(false)
      return
    }
    const empList = (emp.data ?? []).map((r: Record<string, unknown>) => {
      const b = r.branches
      const d = r.departments
      return {
        ...r,
        branches: Array.isArray(b) ? b[0] : b,
        departments: Array.isArray(d) ? d[0] : d,
      } as EmployeeRow
    })
    setEmployees(empList)
    setShifts((sh.data ?? []) as Shift[])
    setBranches((br.data ?? []) as Branch[])
    setDepartments((dp.data ?? []) as Department[])

    if (empList.length > 0) {
      const empIds = empList.map((e) => e.id)
      const todayStr = today()
      const { data: asn } = await supabase
        .from('employee_shift_assignments')
        .select('employee_id, shift_id, effective_from, effective_to, weekly_off, shifts(code, name)')
        .in('employee_id', empIds)
        .lte('effective_from', todayStr)
        .order('effective_from', { ascending: false })
      const map = new Map<string, CurrentAssignment>()
      for (const row of asn ?? []) {
        const r = row as Record<string, unknown>
        const eid = r.employee_id as string
        if (map.has(eid)) continue
        const effTo = r.effective_to as string | null
        if (effTo && effTo < todayStr) continue
        const sh = r.shifts
        map.set(eid, {
          employee_id: eid,
          shift_id: r.shift_id as string,
          effective_from: r.effective_from as string,
          effective_to: effTo,
          weekly_off: (r.weekly_off as string[]) ?? [],
          shifts: Array.isArray(sh) ? (sh[0] as { code: string; name: string }) : (sh as { code: string; name: string } | null),
        })
      }
      setAssignments(map)
    } else {
      setAssignments(new Map())
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter((e) => {
      if (branchFilter && e.branch_id !== branchFilter) return false
      if (deptFilter && e.department_id !== deptFilter) return false
      if (q && !e.full_name.toLowerCase().includes(q) && !e.employee_code.toLowerCase().includes(q)) return false
      return true
    })
  }, [employees, query, branchFilter, deptFilter])

  const allChecked = filtered.length > 0 && filtered.every((e) => selected.has(e.id))
  const someChecked = filtered.some((e) => selected.has(e.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allChecked) filtered.forEach((e) => next.delete(e.id))
      else filtered.forEach((e) => next.add(e.id))
      return next
    })
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleWeeklyOff = (day: string) => {
    setForm((f) => ({
      ...f,
      weekly_off: f.weekly_off.includes(day) ? f.weekly_off.filter((d) => d !== day) : [...f.weekly_off, day],
    }))
  }

  const openBulk = () => {
    if (selected.size === 0) {
      toast.error('Select at least one employee')
      return
    }
    setForm({ shift_id: '', effective_from: today(), effective_to: '', weekly_off: ['Sunday'] })
    setOpen(true)
  }

  const bulkAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.shift_id) {
      toast.error('Pick a shift')
      return
    }
    setBusy(true)
    const ids = Array.from(selected)
    const payload = ids.map((employee_id) => ({
      employee_id,
      shift_id: form.shift_id,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      weekly_off: form.weekly_off,
    }))
    const { error } = await supabase.from('employee_shift_assignments').insert(payload)
    setBusy(false)
    if (error) {
      toast.error('Bulk assign failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'CREATE',
      entityType: 'employee_shift_assignment',
      after: { count: ids.length, shift_id: form.shift_id, effective_from: form.effective_from },
    })
    toast.success(`Assigned ${ids.length} employee(s)`)
    setSelected(new Set())
    setOpen(false)
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roster"
        description="Current shift assignment for every active employee. Multi-select to assign a shift in bulk."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="shift.assign">
              <Button size="sm" onClick={openBulk} disabled={selected.size === 0}>
                <Plus className="h-4 w-4" />
                {selected.size > 0 ? `Bulk assign (${selected.size})` : 'Bulk assign'}
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by name or code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <Select className="w-44" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
            <Select className="w-44" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-16 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No employees match the filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-6 py-3 w-10">
                      {canAssign && (
                        <Checkbox
                          checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                          onCheckedChange={toggleAll}
                        />
                      )}
                    </th>
                    <th className="px-3 py-3">Employee</th>
                    <th className="px-3 py-3">Branch / Dept</th>
                    <th className="px-3 py-3">Current shift</th>
                    <th className="px-3 py-3">Effective</th>
                    <th className="px-3 py-3">Weekly off</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((e) => {
                    const a = assignments.get(e.id)
                    const isSel = selected.has(e.id)
                    return (
                      <tr key={e.id} className={isSel ? 'bg-primary/5' : 'hover:bg-muted/20'}>
                        <td className="px-6 py-3">
                          {canAssign && (
                            <Checkbox checked={isSel} onCheckedChange={() => toggle(e.id)} />
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className={avatarColorFor(e.employee_code)}>
                                {initialsFromName(e.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{e.full_name}</div>
                              <div className="text-xs text-muted-foreground">{e.employee_code}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {e.branches?.name ?? '—'}
                          <br />
                          {e.departments?.name ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          {a ? (
                            <div>
                              <div className="font-medium">{a.shifts?.name ?? '—'}</div>
                              <div className="text-xs text-muted-foreground">{a.shifts?.code}</div>
                            </div>
                          ) : (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs tabular-nums text-muted-foreground">
                          {a ? `${a.effective_from} → ${a.effective_to ?? 'open'}` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(a?.weekly_off ?? []).map((d) => (
                              <Badge key={d} variant="outline" className="text-[10px]">
                                {d.slice(0, 3)}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk shift assignment</DialogTitle>
            <DialogDescription>
              Assign the same shift to <strong>{selected.size}</strong> employee(s). This creates a new effective-dated record per employee; existing assignments stay in history.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={bulkAssign} className="space-y-4">
            <div className="space-y-2">
              <Label>Shift</Label>
              <Select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} required>
                <option value="">Select shift</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.code} — {s.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective from</Label>
                <Input type="date" required value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Effective to (optional)</Label>
                <Input type="date" value={form.effective_to} onChange={(e) => setForm({ ...form, effective_to: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Weekly off</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_NAMES.map((d) => {
                  const active = form.weekly_off.includes(d)
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleWeeklyOff(d)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                Assign {selected.size}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

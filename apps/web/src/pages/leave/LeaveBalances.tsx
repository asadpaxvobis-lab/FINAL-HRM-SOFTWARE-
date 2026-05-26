import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Wand2, Search, Save, Coins } from 'lucide-react'
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

type Employee = { id: string; employee_code: string; full_name: string; gender: string | null }
type LeaveType = {
  id: string
  code: string
  name: string
  default_yearly_days: number
  carry_forward_days: number
  color: string
  applies_to_gender: string | null
  is_active: boolean
}
type Balance = {
  id?: string
  employee_id: string
  leave_type_id: string
  year: number
  opening: number
  granted: number
  consumed: number
  carry_forward: number
}

const thisYear = () => new Date().getFullYear()

export function LeaveBalancesPage() {
  const { appUser, hasPermission } = useAuth()
  const canConfig = hasPermission('leave.config')
  const [year, setYear] = useState(thisYear())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [types, setTypes] = useState<LeaveType[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantBusy, setGrantBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [e, t, b] = await Promise.all([
      supabase
        .from('employees')
        .select('id, employee_code, full_name, gender')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('leave_types').select('*').eq('is_active', true).order('name'),
      supabase.from('leave_balances').select('*').eq('year', year),
    ])
    setEmployees((e.data ?? []) as Employee[])
    setTypes((t.data ?? []) as LeaveType[])
    setBalances((b.data ?? []) as Balance[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [year])

  const balanceMap = useMemo(() => {
    const m = new Map<string, Balance>()
    for (const b of balances) m.set(`${b.employee_id}|${b.leave_type_id}`, b)
    return m
  }, [balances])

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(
      (e) => e.full_name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)
    )
  }, [employees, query])

  const remaining = (b: Balance | undefined) => {
    if (!b) return 0
    return +b.opening + +b.granted + +b.carry_forward - +b.consumed
  }

  const grantAll = async () => {
    if (!appUser) return
    if (employees.length === 0 || types.length === 0) {
      toast.error('Nothing to grant')
      return
    }
    setGrantBusy(true)
    const rows: Omit<Balance, 'id'>[] = []
    for (const emp of employees) {
      for (const t of types) {
        if (t.applies_to_gender && emp.gender && t.applies_to_gender !== emp.gender) continue
        const key = `${emp.id}|${t.id}`
        const existing = balanceMap.get(key)
        if (existing && existing.granted > 0) continue
        rows.push({
          employee_id: emp.id,
          leave_type_id: t.id,
          year,
          opening: 0,
          granted: +t.default_yearly_days,
          consumed: existing?.consumed ?? 0,
          carry_forward: existing?.carry_forward ?? 0,
        })
      }
    }
    if (rows.length === 0) {
      setGrantBusy(false)
      setGrantOpen(false)
      toast.info('All employees already have balances for this year')
      return
    }
    const { error } = await supabase
      .from('leave_balances')
      .upsert(rows, { onConflict: 'employee_id,leave_type_id,year' })
    if (error) {
      setGrantBusy(false)
      toast.error('Grant failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'CREATE',
      entityType: 'leave_balance_grant',
      after: { year, rows: rows.length },
    })
    toast.success(`Granted ${rows.length} balance row(s) for ${year}`)
    setGrantBusy(false)
    setGrantOpen(false)
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave balances"
        description="Yearly leave allocation per employee. Use bulk-grant to seed defaults at the start of each year."
        actions={
          <>
            <Select value={String(year)} onChange={(e) => setYear(+e.target.value)} className="w-28">
              {[year - 1, year, year + 1, thisYear() - 1, thisYear(), thisYear() + 1]
                .filter((v, i, arr) => arr.indexOf(v) === i)
                .sort((a, b) => b - a)
                .map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="leave.config">
              <Button size="sm" onClick={() => setGrantOpen(true)}>
                <Wand2 className="h-4 w-4" /> Bulk grant {year}
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">Balances</CardTitle>
            <CardDescription>{filteredEmployees.length} employee(s)</CardDescription>
            <div className="ml-auto relative w-72 max-w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search employee" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-6 py-3 sticky left-0 bg-muted/30">Employee</th>
                    {types.map((t) => (
                      <th key={t.id} className="px-3 py-3 text-center min-w-[80px]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.color }} />
                          {t.code}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEmployees.map((e) => (
                    <BalanceRow
                      key={e.id}
                      emp={e}
                      year={year}
                      types={types}
                      balanceMap={balanceMap}
                      remaining={remaining}
                      canConfig={canConfig}
                      onSaved={() => void load()}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk grant {year}</DialogTitle>
            <DialogDescription>
              Grants each leave type's default yearly days to every active employee for {year}.
              Existing balances with non-zero <em>granted</em> are skipped. Consumed values are preserved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Will grant:</p>
            <ul className="list-disc pl-6 space-y-1">
              {types.map((t) => (
                <li key={t.id}>
                  <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ background: t.color }} />
                  {t.name}: <strong>{t.default_yearly_days} days</strong>
                  {t.applies_to_gender ? ` (${t.applies_to_gender} only)` : ''}
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button onClick={grantAll} disabled={grantBusy}>
              {grantBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
              Grant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BalanceRow({
  emp,
  year,
  types,
  balanceMap,
  remaining,
  canConfig,
  onSaved,
}: {
  emp: Employee
  year: number
  types: LeaveType[]
  balanceMap: Map<string, Balance>
  remaining: (b: Balance | undefined) => number
  canConfig: boolean
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, { opening: number; granted: number; consumed: number; carry_forward: number }>>({})

  const openEdit = () => {
    const d: typeof drafts = {}
    for (const t of types) {
      const b = balanceMap.get(`${emp.id}|${t.id}`)
      d[t.id] = {
        opening: b ? +b.opening : 0,
        granted: b ? +b.granted : 0,
        consumed: b ? +b.consumed : 0,
        carry_forward: b ? +b.carry_forward : 0,
      }
    }
    setDrafts(d)
    setEditing(true)
  }

  const save = async () => {
    setBusy(true)
    const rows = types.map((t) => ({
      employee_id: emp.id,
      leave_type_id: t.id,
      year,
      ...drafts[t.id],
    }))
    const { error } = await supabase
      .from('leave_balances')
      .upsert(rows, { onConflict: 'employee_id,leave_type_id,year' })
    setBusy(false)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'leave_balance',
      entityId: emp.id,
      after: { year, rows: rows.length },
    })
    toast.success('Balances updated')
    setEditing(false)
    onSaved()
  }

  return (
    <tr className="hover:bg-muted/10">
      <td className="px-6 py-3 sticky left-0 bg-background">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className={avatarColorFor(emp.employee_code)}>
              {initialsFromName(emp.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium truncate">{emp.full_name}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{emp.employee_code}</div>
          </div>
          {canConfig && (
            <Button variant="ghost" size="sm" className="ml-1" onClick={editing ? save : openEdit} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? <Save className="h-4 w-4" /> : 'Edit'}
            </Button>
          )}
        </div>
      </td>
      {types.map((t) => {
        const b = balanceMap.get(`${emp.id}|${t.id}`)
        const rem = remaining(b)
        if (!editing) {
          if (t.applies_to_gender && emp.gender && t.applies_to_gender !== emp.gender) {
            return <td key={t.id} className="px-3 py-3 text-center text-xs text-muted-foreground">—</td>
          }
          return (
            <td key={t.id} className="px-3 py-3 text-center">
              <Badge variant={rem > 0 ? 'warm' : 'outline'} className="tabular-nums">{rem}</Badge>
              <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                G{b?.granted ?? 0} · C{b?.consumed ?? 0}
              </div>
            </td>
          )
        }
        const d = drafts[t.id]
        return (
          <td key={t.id} className="px-2 py-2">
            <div className="space-y-1">
              <Input
                title="Granted"
                type="number"
                step="0.5"
                min={0}
                className="h-7 text-xs tabular-nums"
                value={d?.granted ?? 0}
                onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, granted: +e.target.value } })}
              />
              <Input
                title="Consumed"
                type="number"
                step="0.5"
                min={0}
                className="h-7 text-xs tabular-nums"
                value={d?.consumed ?? 0}
                onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, consumed: +e.target.value } })}
              />
            </div>
          </td>
        )
      })}
    </tr>
  )
}

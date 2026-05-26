import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2, Calendar, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { WEEKDAY_NAMES } from '@/lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

type Shift = { id: string; code: string; name: string; start_time: string; end_time: string; is_night: boolean }

type Assignment = {
  id: string
  shift_id: string
  effective_from: string
  effective_to: string | null
  weekly_off: string[]
  notes: string | null
  shifts?: { code: string; name: string } | null
}

const today = () => new Date().toISOString().slice(0, 10)

export function ShiftAssignmentTab({ employeeId }: { employeeId: string }) {
  const { hasPermission } = useAuth()
  const canAssign = hasPermission('shift.assign')
  const [shifts, setShifts] = useState<Shift[]>([])
  const [rows, setRows] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    shift_id: '',
    effective_from: today(),
    effective_to: '',
    weekly_off: ['Sunday'] as string[],
    notes: '',
  })

  async function load() {
    setLoading(true)
    const [s, a] = await Promise.all([
      supabase.from('shifts').select('id, code, name, start_time, end_time, is_night').eq('is_active', true).order('name'),
      supabase
        .from('employee_shift_assignments')
        .select('id, shift_id, effective_from, effective_to, weekly_off, notes, shifts(code, name)')
        .eq('employee_id', employeeId)
        .order('effective_from', { ascending: false }),
    ])
    if (s.data) setShifts(s.data as Shift[])
    if (a.error) toast.error('Failed to load assignments', { description: a.error.message })
    else {
      const mapped = (a.data ?? []).map((r: Record<string, unknown>) => {
        const sh = r.shifts
        const single = Array.isArray(sh) ? sh[0] : sh
        return { ...r, shifts: single } as Assignment
      })
      setRows(mapped)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [employeeId])

  const toggleWeeklyOff = (day: string) => {
    setForm((f) => {
      const has = f.weekly_off.includes(day)
      return { ...f, weekly_off: has ? f.weekly_off.filter((d) => d !== day) : [...f.weekly_off, day] }
    })
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAssign) return
    if (!form.shift_id) {
      toast.error('Pick a shift')
      return
    }
    setSaving(true)
    const payload = {
      employee_id: employeeId,
      shift_id: form.shift_id,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      weekly_off: form.weekly_off,
      notes: form.notes.trim() || null,
    }
    const { data, error } = await supabase
      .from('employee_shift_assignments')
      .insert(payload)
      .select('id')
      .single()
    setSaving(false)
    if (error) {
      toast.error('Could not save assignment', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'employee_shift_assignment', entityId: data?.id, after: payload })
    toast.success('Shift assigned')
    setForm({ shift_id: '', effective_from: today(), effective_to: '', weekly_off: ['Sunday'], notes: '' })
    void load()
  }

  const onDelete = async (id: string) => {
    if (!confirm('Remove this shift assignment?')) return
    const { error } = await supabase.from('employee_shift_assignments').delete().eq('id', id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'DELETE', entityType: 'employee_shift_assignment', entityId: id })
    toast.success('Assignment removed')
    void load()
  }

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {canAssign && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New assignment</CardTitle>
            <CardDescription>Effective-dated. Leave “effective to” blank for open-ended.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Shift</Label>
                  <Select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} required>
                    <option value="">Select shift</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
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
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Assign shift
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
          <CardDescription>{rows.length} assignment(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No shift assigned yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r, i) => (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-medium">{r.shifts?.name ?? r.shift_id}</div>
                    <div className="text-xs text-muted-foreground">{r.shifts?.code}</div>
                  </div>
                  <div className="text-sm tabular-nums">
                    {r.effective_from} → {r.effective_to ?? 'open'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {r.weekly_off.map((d) => (
                      <Badge key={d} variant="outline">{d.slice(0, 3)}</Badge>
                    ))}
                  </div>
                  {i === 0 && <Badge variant="warm">Current</Badge>}
                  {canAssign && (
                    <Button variant="ghost" size="sm" onClick={() => void onDelete(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

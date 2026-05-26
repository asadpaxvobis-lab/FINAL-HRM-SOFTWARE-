import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Shift = {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
  break_minutes: number
  grace_late_minutes: number
  grace_early_minutes: number
  is_night: boolean
  is_active: boolean
}

const emptyForm = {
  code: '',
  name: '',
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  grace_late_minutes: 15,
  grace_early_minutes: 15,
  is_night: false,
  is_active: true,
}

function fmtTime(t: string) {
  return t?.slice(0, 5) ?? t
}

export function ShiftsPage() {
  const { appUser, hasPermission } = useAuth()
  const canCreate = hasPermission('shift.create')
  const canUpdate = hasPermission('shift.update')
  const [rows, setRows] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Shift | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('shifts')
      .select('id, code, name, start_time, end_time, break_minutes, grace_late_minutes, grace_early_minutes, is_night, is_active')
      .order('name')
    if (error) toast.error('Failed to load shifts', { description: error.message })
    else setRows((data ?? []) as Shift[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      code: form.code.trim(),
      name: form.name.trim(),
      start_time: form.start_time,
      end_time: form.end_time,
      break_minutes: form.break_minutes,
      grace_late_minutes: form.grace_late_minutes,
      grace_early_minutes: form.grace_early_minutes,
      is_night: form.is_night,
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('shifts').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'shift', entityId: editing.id })
      toast.success('Shift updated')
    } else {
      const { data, error } = await supabase.from('shifts').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'shift', entityId: data?.id })
      toast.success('Shift created')
    }
    setOpen(false)
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shifts"
        description="Shift templates used for attendance, late/early rules, and roster assignment."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="shift.create">
              <Button
                size="sm"
                onClick={async () => {
                  setEditing(null)
                  const code = await nextCode({
                    table: 'shifts',
                    column: 'code',
                    prefix: 'SH-',
                    width: 3,
                    companyId: appUser?.company_id,
                  })
                  setForm({ ...emptyForm, code })
                  setOpen(true)
                }}
              >
                <Plus className="h-4 w-4" /> Add shift
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift templates</CardTitle>
          <CardDescription>{rows.length} defined</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No shifts yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-muted/30">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-muted-foreground">{s.code}</div>
                  </div>
                  <div className="text-sm tabular-nums">
                    {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Break {s.break_minutes}m · Late grace {s.grace_late_minutes}m
                  </div>
                  {s.is_night && <Badge variant="warm">Night</Badge>}
                  {!s.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(s)
                        setForm({
                          code: s.code,
                          name: s.name,
                          start_time: fmtTime(s.start_time),
                          end_time: fmtTime(s.end_time),
                          break_minutes: s.break_minutes,
                          grace_late_minutes: s.grace_late_minutes,
                          grace_early_minutes: s.grace_early_minutes,
                          is_night: s.is_night,
                          is_active: s.is_active,
                        })
                        setOpen(true)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit shift' : 'Add shift'}</DialogTitle>
            <DialogDescription>Used when calculating late, early, and worked hours.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} readOnly disabled className="font-mono" />
                <p className="text-xs text-muted-foreground">
                  {editing ? 'Codes are immutable.' : 'Auto-generated.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Break (minutes)</Label>
                <Input type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Late grace (minutes)</Label>
                <Input type="number" value={form.grace_late_minutes} onChange={(e) => setForm({ ...form, grace_late_minutes: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Early grace (minutes)</Label>
                <Input type="number" value={form.grace_early_minutes} onChange={(e) => setForm({ ...form, grace_early_minutes: +e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_night} onCheckedChange={(v) => setForm({ ...form, is_night: !!v })} />
              Night shift (crosses midnight)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
              Active
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

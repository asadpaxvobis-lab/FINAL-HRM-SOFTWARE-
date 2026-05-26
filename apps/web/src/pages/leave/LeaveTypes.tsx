import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, Palette } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type LeaveType = {
  id: string
  code: string
  name: string
  is_paid: boolean
  default_yearly_days: number
  carry_forward_days: number
  requires_attachment: boolean
  allow_half_day: boolean
  applies_to_gender: string | null
  color: string
  is_active: boolean
  notes: string | null
}

const emptyForm = {
  code: '',
  name: '',
  is_paid: true,
  default_yearly_days: 0,
  carry_forward_days: 0,
  requires_attachment: false,
  allow_half_day: true,
  applies_to_gender: '',
  color: '#f59e0b',
  is_active: true,
  notes: '',
}

export function LeaveTypesPage() {
  const { appUser, hasPermission } = useAuth()
  const canConfig = hasPermission('leave.config')
  const [rows, setRows] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveType | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .order('name')
    if (error) toast.error('Failed to load leave types', { description: error.message })
    else setRows((data ?? []) as LeaveType[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = async () => {
    setEditing(null)
    const code = await nextCode({
      table: 'leave_types',
      column: 'code',
      prefix: 'LT-',
      width: 2,
      companyId: appUser?.company_id,
    })
    setForm({ ...emptyForm, code })
    setOpen(true)
  }

  const openEdit = (t: LeaveType) => {
    setEditing(t)
    setForm({
      code: t.code,
      name: t.name,
      is_paid: t.is_paid,
      default_yearly_days: +t.default_yearly_days,
      carry_forward_days: +t.carry_forward_days,
      requires_attachment: t.requires_attachment,
      allow_half_day: t.allow_half_day,
      applies_to_gender: t.applies_to_gender ?? '',
      color: t.color,
      is_active: t.is_active,
      notes: t.notes ?? '',
    })
    setOpen(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      is_paid: form.is_paid,
      default_yearly_days: +form.default_yearly_days,
      carry_forward_days: +form.carry_forward_days,
      requires_attachment: form.requires_attachment,
      allow_half_day: form.allow_half_day,
      applies_to_gender: form.applies_to_gender || null,
      color: form.color,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    }
    if (editing) {
      const { error } = await supabase.from('leave_types').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'leave_type', entityId: editing.id, after: payload })
      toast.success('Leave type updated')
    } else {
      const { data, error } = await supabase.from('leave_types').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'leave_type', entityId: data?.id, after: payload })
      toast.success('Leave type added')
    }
    setOpen(false)
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave types"
        description="Define paid and unpaid leave categories with yearly grant, carry-forward and rules."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="leave.config">
              <Button size="sm" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" /> Add type
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All leave types</CardTitle>
          <CardDescription>{rows.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <Palette className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No leave types yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-4 hover:bg-muted/20">
                  <span
                    className="inline-block h-3 w-3 rounded-full border"
                    style={{ background: t.color }}
                    title={t.color}
                  />
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.code}</div>
                  </div>
                  <div className="text-sm tabular-nums">
                    {t.default_yearly_days} d/yr · CF {t.carry_forward_days}
                  </div>
                  <Badge variant={t.is_paid ? 'warm' : 'secondary'}>{t.is_paid ? 'Paid' : 'Unpaid'}</Badge>
                  {t.requires_attachment && <Badge variant="outline">Attach</Badge>}
                  {t.allow_half_day && <Badge variant="outline">Half-day</Badge>}
                  {t.applies_to_gender && <Badge variant="outline">{t.applies_to_gender}</Badge>}
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canConfig && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
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
            <DialogTitle>{editing ? 'Edit leave type' : 'Add leave type'}</DialogTitle>
            <DialogDescription>Default values seed the yearly leave balance when granting.</DialogDescription>
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
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Default days / year</Label>
                <Input type="number" step="0.5" min={0} value={form.default_yearly_days} onChange={(e) => setForm({ ...form, default_yearly_days: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Carry-forward (max days)</Label>
                <Input type="number" step="0.5" min={0} value={form.carry_forward_days} onChange={(e) => setForm({ ...form, carry_forward_days: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Applies to</Label>
                <Select value={form.applies_to_gender} onChange={(e) => setForm({ ...form, applies_to_gender: e.target.value })}>
                  <option value="">All</option>
                  <option value="Male">Male only</option>
                  <option value="Female">Female only</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: !!v })} />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.requires_attachment} onCheckedChange={(v) => setForm({ ...form, requires_attachment: !!v })} />
                Requires attachment
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.allow_half_day} onCheckedChange={(v) => setForm({ ...form, allow_half_day: !!v })} />
                Allow half-day
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, HardDrive, Trash2, Save, Activity, Power, PowerOff } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Device = {
  id: string
  branch_id: string | null
  name: string
  serial_no: string | null
  device_type: string
  ip_address: string | null
  push_token: string | null
  last_seen_at: string | null
  is_active: boolean
  notes: string | null
  branches?: { name: string } | null
}

type Branch = { id: string; name: string }

const DEVICE_TYPES = ['ZKTeco', 'Face Kiosk', 'Mobile', 'Manual'] as const

const emptyForm = {
  name: '',
  serial_no: '',
  device_type: 'ZKTeco',
  branch_id: '',
  ip_address: '',
  push_token: '',
  is_active: true,
  notes: '',
}

function genToken() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function lastSeenBadge(iso: string | null): { label: string; variant: 'warm' | 'outline' | 'secondary' } {
  if (!iso) return { label: 'Never', variant: 'secondary' }
  const ageMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ageMs / 60000)
  if (mins < 5) return { label: 'Online', variant: 'warm' }
  if (mins < 60) return { label: `${mins}m ago`, variant: 'outline' }
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return { label: `${hrs}h ago`, variant: 'outline' }
  const days = Math.floor(hrs / 24)
  return { label: `${days}d ago`, variant: 'secondary' }
}

export function DevicesPage() {
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('attendance.device')
  const [rows, setRows] = useState<Device[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Device | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [d, b] = await Promise.all([
      supabase
        .from('attendance_devices')
        .select('id, branch_id, name, serial_no, device_type, ip_address, push_token, last_seen_at, is_active, notes, branches(name)')
        .order('name'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    ])
    if (d.error) toast.error('Failed to load devices', { description: d.error.message })
    else {
      const mapped = (d.data ?? []).map((r: Record<string, unknown>) => {
        const br = r.branches
        return { ...r, branches: Array.isArray(br) ? br[0] : br } as Device
      })
      setRows(mapped)
    }
    setBranches((b.data ?? []) as Branch[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, push_token: genToken() })
    setOpen(true)
  }

  const openEdit = (d: Device) => {
    setEditing(d)
    setForm({
      name: d.name,
      serial_no: d.serial_no ?? '',
      device_type: d.device_type,
      branch_id: d.branch_id ?? '',
      ip_address: d.ip_address ?? '',
      push_token: d.push_token ?? '',
      is_active: d.is_active,
      notes: d.notes ?? '',
    })
    setOpen(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      name: form.name.trim(),
      serial_no: form.serial_no.trim() || null,
      device_type: form.device_type,
      branch_id: form.branch_id || null,
      ip_address: form.ip_address.trim() || null,
      push_token: form.push_token.trim() || null,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    }
    if (editing) {
      const { error } = await supabase.from('attendance_devices').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'attendance_device', entityId: editing.id, after: payload })
      toast.success('Device updated')
    } else {
      const { data, error } = await supabase.from('attendance_devices').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'attendance_device', entityId: data?.id, after: payload })
      toast.success('Device registered')
    }
    setOpen(false)
    void load()
  }

  const toggleActive = async (d: Device) => {
    const next = !d.is_active
    const { error } = await supabase.from('attendance_devices').update({ is_active: next }).eq('id', d.id)
    if (error) {
      toast.error('Failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: next ? 'ENABLE' : 'DISABLE', entityType: 'attendance_device', entityId: d.id })
    toast.success(next ? 'Device enabled' : 'Device disabled')
    void load()
  }

  const onDelete = async (d: Device) => {
    if (!confirm(`Delete device "${d.name}"? This keeps existing punches.`)) return
    const { error } = await supabase.from('attendance_devices').delete().eq('id', d.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'DELETE', entityType: 'attendance_device', entityId: d.id })
    toast.success('Device deleted')
    void load()
  }

  const copyToken = async (token: string | null) => {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      toast.success('Push token copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance devices"
        description="Register ZKTeco machines, face kiosks, mobile apps, and manual sources. The push-token is used by the .NET API endpoint to authenticate pushed punches."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="attendance.device">
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add device
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registered devices</CardTitle>
          <CardDescription>{rows.length} device(s)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-16 text-center text-sm text-muted-foreground">
              <HardDrive className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No devices yet.
              {canManage && (
                <div className="mt-4">
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Register first device
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-6 py-3">Device</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Branch</th>
                    <th className="px-3 py-3">IP / Serial</th>
                    <th className="px-3 py-3">Last seen</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 w-32"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((d) => {
                    const seen = lastSeenBadge(d.last_seen_at)
                    return (
                      <tr key={d.id} className="hover:bg-muted/20">
                        <td className="px-6 py-3">
                          <div className="font-medium">{d.name}</div>
                          {d.notes && <div className="text-xs text-muted-foreground truncate max-w-xs">{d.notes}</div>}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="outline">{d.device_type}</Badge>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{d.branches?.name ?? 'All'}</td>
                        <td className="px-3 py-3 text-xs font-mono text-muted-foreground">
                          {d.ip_address ?? '—'}
                          <br />
                          {d.serial_no ?? ''}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant={seen.variant}>
                            <Activity className="h-3 w-3" /> {seen.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          {d.is_active ? (
                            <Badge variant="warm">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Disabled</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {canManage && (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" title="Edit" onClick={() => openEdit(d)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title={d.is_active ? 'Disable' : 'Enable'}
                                onClick={() => void toggleActive(d)}
                              >
                                {d.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                              </Button>
                              <Button variant="ghost" size="sm" title="Delete" onClick={() => void onDelete(d)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit device' : 'Register device'}</DialogTitle>
            <DialogDescription>
              The push token is included by the ZKTeco agent / kiosk / mobile app when pushing punches.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HQ Reception ZK" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })}>
                  {DEVICE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Branch (optional)</Label>
                <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Serial number</Label>
                <Input value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>IP address</Label>
                <Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Push token</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.push_token}
                    onChange={(e) => setForm({ ...form, push_token: e.target.value })}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, push_token: genToken() })}>
                    Regenerate
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyToken(form.push_token)} disabled={!form.push_token}>
                    Copy
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
              Active
            </label>
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

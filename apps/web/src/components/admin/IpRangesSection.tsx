import { useEffect, useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HasPermission } from '@/components/HasPermission'
import { toast } from 'sonner'

type IpRange = {
  id: string
  cidr: string
  description: string | null
  is_active: boolean
}

export function IpRangesSection() {
  const { appUser, hasPermission } = useAuth()
  const canEdit = hasPermission('settings.update')
  const [rows, setRows] = useState<IpRange[]>([])
  const [loading, setLoading] = useState(true)
  const [cidr, setCidr] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!appUser) return
    setLoading(true)
    const { data, error } = await supabase
      .from('allowed_ip_ranges')
      .select('id, cidr, description, is_active')
      .eq('company_id', appUser.company_id)
      .order('created_at')
    if (!error) setRows((data ?? []) as IpRange[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [appUser?.id])

  const add = async () => {
    if (!appUser || !cidr.trim()) return
    setBusy(true)
    const { data, error } = await supabase
      .from('allowed_ip_ranges')
      .insert({
        company_id: appUser.company_id,
        cidr: cidr.trim(),
        description: description.trim() || null,
        is_active: true,
      })
      .select('id')
      .single()
    setBusy(false)
    if (error) {
      toast.error('Could not add range', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'allowed_ip_range', entityId: data?.id })
    toast.success('IP range added')
    setCidr('')
    setDescription('')
    void load()
  }

  const remove = async (row: IpRange) => {
    if (!confirm(`Remove ${row.cidr}?`)) return
    const { error } = await supabase.from('allowed_ip_ranges').delete().eq('id', row.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'DELETE', entityType: 'allowed_ip_range', entityId: row.id })
    toast.success('Removed')
    void load()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allowed IP ranges</CardTitle>
        <CardDescription>
          When IP restriction is enabled, admin users can only sign in from these CIDR blocks (e.g.{' '}
          <code className="text-foreground">192.168.1.0/24</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ranges configured — all IPs are allowed until you add one and turn on restriction above.</p>
        ) : (
          <ul className="divide-y border rounded-lg">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <span className="font-mono font-medium">{r.cidr}</span>
                  {r.description && <span className="text-muted-foreground ml-2">— {r.description}</span>}
                </div>
                {canEdit && (
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <HasPermission perm="settings.update">
          <div className="grid sm:grid-cols-[1fr,1fr,auto] gap-3 items-end pt-2 border-t">
            <div className="space-y-2">
              <Label>CIDR</Label>
              <Input
                placeholder="203.0.113.0/24"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="Head office LAN"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <Button onClick={add} disabled={busy || !cidr.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </HasPermission>
      </CardContent>
    </Card>
  )
}

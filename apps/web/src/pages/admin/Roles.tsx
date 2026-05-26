import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Shield, Loader2, Save, Search, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HasPermission } from '@/components/HasPermission'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Permission = { id: string; module: string; action: string; code: string; description: string | null }
type Role = { id: string; name: string; description: string | null; is_built_in: boolean; is_active: boolean }
type RolePerm = { role_id: string; permission_id: string }

export function RolesPage() {
  const { hasPermission, appUser } = useAuth()
  const canEdit = hasPermission('role.update')
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePerms, setRolePerms] = useState<RolePerm[]>([])
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // local dirty state of permission selections per role
  const [draftRolePerms, setDraftRolePerms] = useState<Set<string>>(new Set())

  async function load() {
    setLoading(true)
    const [rolesRes, permsRes, rpRes] = await Promise.all([
      supabase.from('roles').select('id, name, description, is_built_in, is_active').order('is_built_in', { ascending: false }).order('name'),
      supabase.from('permissions').select('id, module, action, code, description').order('module').order('action'),
      supabase.from('role_permissions').select('role_id, permission_id'),
    ])
    if (rolesRes.error) toast.error('Failed to load roles', { description: rolesRes.error.message })
    if (permsRes.error) toast.error('Failed to load permissions', { description: permsRes.error.message })

    setRoles((rolesRes.data ?? []) as Role[])
    setPermissions((permsRes.data ?? []) as Permission[])
    setRolePerms((rpRes.data ?? []) as RolePerm[])
    if (!activeRoleId && (rolesRes.data?.length ?? 0) > 0) {
      setActiveRoleId((rolesRes.data as Role[])[0].id)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Rebuild draft when active role changes
  useEffect(() => {
    if (!activeRoleId) {
      setDraftRolePerms(new Set())
      return
    }
    const set = new Set(rolePerms.filter((rp) => rp.role_id === activeRoleId).map((rp) => rp.permission_id))
    setDraftRolePerms(set)
  }, [activeRoleId, rolePerms])

  const activeRole = roles.find((r) => r.id === activeRoleId) ?? null

  const groupedPerms = useMemo(() => {
    const map = new Map<string, Permission[]>()
    for (const p of permissions) {
      if (search && !p.code.toLowerCase().includes(search.toLowerCase()) && !p.description?.toLowerCase().includes(search.toLowerCase())) continue
      if (!map.has(p.module)) map.set(p.module, [])
      map.get(p.module)!.push(p)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [permissions, search])

  const togglePerm = (id: string) => {
    if (!canEdit || !activeRole) return
    const next = new Set(draftRolePerms)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDraftRolePerms(next)
  }

  const toggleModule = (moduleName: string, checked: boolean) => {
    if (!canEdit || !activeRole) return
    const ids = permissions.filter((p) => p.module === moduleName).map((p) => p.id)
    const next = new Set(draftRolePerms)
    ids.forEach((id) => {
      if (checked) next.add(id)
      else next.delete(id)
    })
    setDraftRolePerms(next)
  }

  const save = async () => {
    if (!activeRole) return
    setSaving(true)
    const original = new Set(rolePerms.filter((rp) => rp.role_id === activeRole.id).map((rp) => rp.permission_id))
    const toAdd = Array.from(draftRolePerms).filter((id) => !original.has(id))
    const toRemove = Array.from(original).filter((id) => !draftRolePerms.has(id))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('role_permissions')
        .insert(toAdd.map((id) => ({ role_id: activeRole.id, permission_id: id })))
      if (error) {
        toast.error('Failed to add some permissions', { description: error.message })
      }
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', activeRole.id)
        .in('permission_id', toRemove)
      if (error) {
        toast.error('Failed to remove some permissions', { description: error.message })
      }
    }

    setSaving(false)
    toast.success('Permissions saved', {
      description: `${toAdd.length} added · ${toRemove.length} removed`,
    })
    await load()
  }

  const isDirty = useMemo(() => {
    if (!activeRole) return false
    const original = new Set(rolePerms.filter((rp) => rp.role_id === activeRole.id).map((rp) => rp.permission_id))
    if (original.size !== draftRolePerms.size) return true
    for (const id of original) if (!draftRolePerms.has(id)) return true
    return false
  }, [activeRole, draftRolePerms, rolePerms])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Roles &amp; Permissions</h2>
          <p className="text-sm text-muted-foreground">
            Built-in roles cover most needs. Create custom roles for fine-grained control.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <HasPermission perm="role.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          </HasPermission>
        </div>
      </div>

      <div className="grid lg:grid-cols-[280px,1fr] gap-6">
        {/* Role list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles</CardTitle>
            <CardDescription>{roles.length} total</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 grid place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y">
                {roles.map((r) => {
                  const isActive = activeRoleId === r.id
                  const count = rolePerms.filter((rp) => rp.role_id === r.id).length
                  return (
                    <button
                      key={r.id}
                      onClick={() => setActiveRoleId(r.id)}
                      className={cn(
                        'w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors',
                        isActive && 'bg-primary/5 border-l-2 border-l-primary'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Shield className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="font-medium text-sm">{r.name}</span>
                        {r.is_built_in && (
                          <Badge variant="secondary" className="ml-auto text-[10px]">Built-in</Badge>
                        )}
                      </div>
                      {r.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 ml-6 line-clamp-1">{r.description}</div>
                      )}
                      <div className="text-[11px] text-muted-foreground ml-6 mt-1">{count} permissions</div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Permission editor */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>{activeRole?.name ?? 'Select a role'}</CardTitle>
                <CardDescription>
                  {activeRole?.description ?? 'Choose a role from the left to edit its permissions.'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <Badge variant="warm" className="text-[11px]">Unsaved changes</Badge>
                )}
                {activeRole && !activeRole.is_built_in && canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm(`Delete role "${activeRole.name}"? Users assigned will lose this role.`)) return
                      const { error } = await supabase.from('roles').delete().eq('id', activeRole.id)
                      if (error) toast.error('Failed', { description: error.message })
                      else {
                        toast.success('Role deleted')
                        setActiveRoleId(null)
                        await load()
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete role
                  </Button>
                )}
                {canEdit && activeRole && (
                  <Button size="sm" disabled={!isDirty || saving} onClick={save}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter permissions…"
                className="pl-9 max-w-md"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {!activeRole ? (
              <div className="p-10 text-center text-muted-foreground">Pick a role to begin</div>
            ) : (
              <div className="space-y-6">
                {groupedPerms.map(([moduleName, perms]) => {
                  const totalInModule = perms.length
                  const selectedInModule = perms.filter((p) => draftRolePerms.has(p.id)).length
                  const allChecked = selectedInModule === totalInModule
                  const partialChecked = selectedInModule > 0 && selectedInModule < totalInModule
                  return (
                    <div key={moduleName}>
                      <div className="flex items-center gap-2 pb-2 mb-2 border-b">
                        <Checkbox
                          checked={allChecked || (partialChecked ? 'indeterminate' : false)}
                          onCheckedChange={(v) => toggleModule(moduleName, !!v)}
                          disabled={!canEdit}
                        />
                        <span className="text-sm font-semibold capitalize">{moduleName}</span>
                        <span className="text-xs text-muted-foreground">
                          {selectedInModule}/{totalInModule}
                        </span>
                      </div>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {perms.map((p) => {
                          const checked = draftRolePerms.has(p.id)
                          return (
                            <label
                              key={p.id}
                              className={cn(
                                'flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
                                checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/40',
                                !canEdit && 'cursor-not-allowed opacity-70'
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => togglePerm(p.id)}
                                disabled={!canEdit}
                                className="mt-0.5"
                              />
                              <div className="leading-tight">
                                <div className="text-sm font-medium">{p.action}</div>
                                {p.description && (
                                  <div className="text-[11px] text-muted-foreground line-clamp-2">{p.description}</div>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {groupedPerms.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">
                    No permissions match your search.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateRoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={appUser?.company_id ?? null}
        onCreated={() => void load()}
      />
    </div>
  )
}

function CreateRoleDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  companyId: string | null
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    setBusy(true)
    const { error } = await supabase.from('roles').insert({
      company_id: companyId,
      name,
      description: desc || null,
      is_built_in: false,
    })
    setBusy(false)
    if (error) {
      toast.error('Failed to create role', { description: error.message })
      return
    }
    toast.success('Role created')
    setName(''); setDesc('')
    onOpenChange(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create custom role</DialogTitle>
          <DialogDescription>You'll assign permissions after creating the role.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rname">Name</Label>
            <Input id="rname" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Recruiter" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rdesc">Description</Label>
            <Input id="rdesc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does this role do?" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create role
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { Plus, RefreshCw, KeyRound, ShieldOff, ShieldCheck, Loader2, Search, UserPlus, AlertCircle, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { HasPermission } from '@/components/HasPermission'
import { avatarColorFor, initialsFromName, formatRelative } from '@/lib/utils'
import { toast } from 'sonner'
import { createUserViaAdmin } from '@/lib/createUser'
import { deleteUserViaAdmin } from '@/lib/deleteUser'
import { writeAuditLog } from '@/lib/audit'

type UserRow = {
  id: string
  email: string
  full_name: string | null
  status: 'Active' | 'Disabled' | 'Pending'
  force_password_change: boolean
  last_login_at: string | null
  created_at: string
  roles: { id: string; name: string }[]
}

type RoleOption = { id: string; name: string; description: string | null }

export function UsersPage() {
  const { hasPermission, appUser } = useAuth()
  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)

  async function load() {
    setLoading(true)
    const [usersRes, rolesRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, email, full_name, status, force_password_change, last_login_at, created_at, user_roles!user_id(roles(id,name))')
        .order('created_at', { ascending: false }),
      supabase.from('roles').select('id, name, description').order('name'),
    ])

    if (usersRes.error) toast.error('Failed to load users', { description: usersRes.error.message })
    if (rolesRes.error) toast.error('Failed to load roles', { description: rolesRes.error.message })

    const mapped: UserRow[] = (usersRes.data ?? []).map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      status: u.status,
      force_password_change: u.force_password_change,
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      roles: (u.user_roles ?? [])
        .map((ur: any) => ur.roles)
        .filter(Boolean)
        .map((r: any) => ({ id: r.id, name: r.name })),
    }))
    setUsers(mapped)
    setRoles((rolesRes.data ?? []) as RoleOption[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = users.filter((u) => {
    const q = query.toLowerCase().trim()
    if (!q) return true
    return (
      u.email.toLowerCase().includes(q) ||
      (u.full_name ?? '').toLowerCase().includes(q) ||
      u.roles.some((r) => r.name.toLowerCase().includes(q))
    )
  })

  const toggleStatus = async (user: UserRow) => {
    const next = user.status === 'Active' ? 'Disabled' : 'Active'
    const { error } = await supabase.from('users').update({ status: next }).eq('id', user.id)
    if (error) {
      toast.error('Could not update status', { description: error.message })
      return
    }
    await writeAuditLog({
      action: next === 'Active' ? 'ENABLE' : 'DISABLE',
      entityType: 'user',
      entityId: user.id,
    })
    toast.success(`User ${next === 'Active' ? 'enabled' : 'disabled'}`)
    void load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Users</h2>
          <p className="text-sm text-muted-foreground">
            People who can log in to the system. Employees are managed separately under People.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <HasPermission perm="user.create">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create user
            </Button>
          </HasPermission>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">All users</CardTitle>
            <CardDescription>{filtered.length} of {users.length}</CardDescription>
          </div>
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, role…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onCreate={() => setCreateOpen(true)} canCreate={hasPermission('user.create')} />
          ) : (
            <div className="divide-y">
              {filtered.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={avatarColorFor(u.email)}>{initialsFromName(u.full_name || u.email)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{u.full_name || '—'}</span>
                      {u.status !== 'Active' && (
                        <Badge variant={u.status === 'Disabled' ? 'destructive' : 'secondary'}>{u.status}</Badge>
                      )}
                      {u.force_password_change && (
                        <Badge variant="warm" title="Must change password on next login">
                          <AlertCircle className="h-3 w-3 mr-1" /> Pwd reset required
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 min-w-[200px]">
                    {u.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No roles</span>
                    ) : (
                      u.roles.map((r) => (
                        <Badge key={r.id} variant="secondary">
                          {r.name}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground min-w-[120px]">
                    {u.last_login_at ? `Last login ${formatRelative(u.last_login_at)}` : 'Never logged in'}
                  </div>
                  <div className="flex items-center gap-1">
                    <HasPermission perm="user.update">
                      <Button
                        variant="ghost"
                        size="sm"
                        title={u.status === 'Active' ? 'Disable user' : 'Enable user'}
                        onClick={() => toggleStatus(u)}
                      >
                        {u.status === 'Active' ? (
                          <ShieldOff className="h-4 w-4" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                      </Button>
                    </HasPermission>
                    <HasPermission perm="user.reset_password">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Force password reset"
                        onClick={async () => {
                          const { error } = await supabase
                            .from('users')
                            .update({ force_password_change: true })
                            .eq('id', u.id)
                          if (error) toast.error('Failed', { description: error.message })
                          else {
                            toast.success('User will be prompted to change password on next login')
                            void load()
                          }
                        }}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </HasPermission>
                    <HasPermission perm="user.delete">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Delete user"
                        className="text-destructive hover:text-destructive"
                        disabled={appUser?.id === u.id}
                        onClick={() => setDeleteTarget(u)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </HasPermission>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        roles={roles}
        onCreated={() => void load()}
      />

      <DeleteUserDialog
        user={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null)
          void load()
        }}
      />
    </div>
  )
}

function EmptyState({ onCreate, canCreate }: { onCreate: () => void; canCreate: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 grid place-items-center mb-4">
        <UserPlus className="h-6 w-6" />
      </div>
      <h3 className="text-base font-medium mb-1">No users match</h3>
      <p className="text-sm text-muted-foreground mb-4">Try a different search, or create the first one.</p>
      {canCreate && (
        <Button size="sm" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Create user
        </Button>
      )}
    </div>
  )
}

function DeleteUserDialog({
  user,
  onOpenChange,
  onDeleted,
}: {
  user: UserRow | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)

  const label = user ? (user.full_name?.trim() || user.email) : ''
  const open = user !== null

  const onConfirm = async () => {
    if (!user) return
    setBusy(true)
    try {
      const { error } = await deleteUserViaAdmin(user.id)
      if (error) {
        toast.error('Could not delete user', { description: error })
        return
      }
      await writeAuditLog({ action: 'DELETE', entityType: 'user', entityId: user.id })
      toast.success('User deleted')
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>
            This will permanently remove <span className="font-medium text-foreground">{label}</span> (
            {user?.email}). They will no longer be able to sign in. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void onConfirm()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateUserDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  roles: RoleOption[]
  onCreated: () => void
}) {
  const { appUser } = useAuth()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [tempPassword, setTempPassword] = useState('changeme123')
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setEmail(''); setFullName(''); setPhone(''); setTempPassword('changeme123'); setSelectedRoles(new Set())
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    if (selectedRoles.size === 0) {
      toast.error('Select at least one role')
      return
    }
    setBusy(true)
    try {
      const roleIds = Array.from(selectedRoles)
      const result = await createUserViaAdmin({
        email,
        password: tempPassword,
        full_name: fullName,
        phone,
        role_ids: roleIds,
      })

      if (result.error || !result.user_id) {
        toast.error('Could not create user', { description: result.error ?? 'Unknown error' })
        return
      }

      await writeAuditLog({ action: 'CREATE', entityType: 'user', entityId: result.user_id })
      toast.success('User created', { description: `${email.trim()} can sign in with the temporary password.` })
      reset()
      onOpenChange(false)
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They'll sign in with a temporary password and be asked to change it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="temp_pwd">Temporary password</Label>
              <Input
                id="temp_pwd"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                minLength={6}
                required
              />
              <p className="text-xs text-muted-foreground">Min 6 chars. User will be required to change it on first login.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            <div className="grid sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border p-3 bg-muted/20">
              {roles.map((r) => {
                const checked = selectedRoles.has(r.id)
                return (
                  <label
                    key={r.id}
                    className="flex items-start gap-2 p-2 rounded cursor-pointer hover:bg-background transition-colors"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedRoles)
                        if (v) next.add(r.id)
                        else next.delete(r.id)
                        setSelectedRoles(next)
                      }}
                      className="mt-0.5"
                    />
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{r.name}</div>
                      {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

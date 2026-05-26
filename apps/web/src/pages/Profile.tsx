import { useEffect, useState } from 'react'
import { Loader2, Save, KeyRound, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { avatarColorFor, initialsFromName } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export function ProfilePage() {
  const { appUser, roles, permissions, refreshProfile } = useAuth()
  const [fullName, setFullName] = useState(appUser?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [pwd, setPwd] = useState({ next: '', confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)

  useEffect(() => {
    setFullName(appUser?.full_name ?? '')
  }, [appUser?.id])

  if (!appUser) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const saveName = async () => {
    if (!fullName.trim()) {
      toast.error('Name cannot be empty')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('users').update({ full_name: fullName.trim() }).eq('id', appUser.id)
    setSaving(false)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'user_profile', entityId: appUser.id, after: { full_name: fullName.trim() } })
    await refreshProfile()
    toast.success('Profile updated')
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.next.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (pwd.next !== pwd.confirm) {
      toast.error('Passwords do not match')
      return
    }
    setPwdSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwd.next })
    if (error) {
      setPwdSaving(false)
      toast.error('Could not change password', { description: error.message })
      return
    }
    await supabase.from('users').update({ force_password_change: false }).eq('id', appUser.id)
    await writeAuditLog({ action: 'UPDATE', entityType: 'user_password', entityId: appUser.id })
    setPwd({ next: '', confirm: '' })
    setPwdSaving(false)
    toast.success('Password updated')
  }

  const permsByModule = new Map<string, string[]>()
  for (const code of permissions) {
    const [mod, act] = code.split('.')
    const list = permsByModule.get(mod) ?? []
    list.push(act ?? code)
    permsByModule.set(mod, list)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="My profile" description="Your account and preferences" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Basic information about your sign-in</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className={avatarColorFor(appUser.id)}>
                {initialsFromName(fullName || appUser.email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-medium">{fullName || appUser.email}</div>
              <div className="text-sm text-muted-foreground">{appUser.email}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {roles.map((r) => (
                  <Badge key={r} variant="warm">{r}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={appUser.email} disabled />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={saveName} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Change password
          </CardTitle>
          <CardDescription>You'll stay signed in after the update</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>New password</Label>
              <Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label>Confirm</Label>
              <Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required minLength={6} />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" disabled={pwdSaving}>
                {pwdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" /> Permissions
          </CardTitle>
          <CardDescription>{permissions.size} permission(s) granted via your roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from(permsByModule.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([mod, acts]) => (
                <div key={mod} className="rounded-md border p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{mod}</div>
                  <div className="flex flex-wrap gap-1">
                    {acts.sort().map((a) => (
                      <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

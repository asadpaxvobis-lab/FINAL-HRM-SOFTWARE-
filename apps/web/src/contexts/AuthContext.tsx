import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type AppUser = {
  id: string
  email: string
  full_name: string | null
  status: string
  force_password_change: boolean
  company_id: string
  employee_id: string | null
}

type AuthContextValue = {
  session: Session | null
  authUser: User | null
  appUser: AppUser | null
  roles: string[]
  permissions: Set<string>
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  hasPermission: (code: string) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [permissions, setPermissions] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    // Load mirror row from public.users
    const { data: u, error: ue } = await supabase
      .from('users')
      .select('id, email, full_name, status, force_password_change, company_id, employee_id')
      .eq('id', userId)
      .single()
    if (ue || !u) {
      console.error('Failed to load public.users row', ue)
      setAppUser(null)
      setRoles([])
      setPermissions(new Set())
      return
    }
    setAppUser(u as AppUser)

    // Roles
    const { data: ur } = await supabase
      .from('user_roles')
      .select('roles ( id, name )')
      .eq('user_id', userId)
    const roleNames: string[] = []
    const roleIds: string[] = []
    for (const r of ur ?? []) {
      const rel: any = (r as any).roles
      if (rel) {
        roleNames.push(rel.name)
        roleIds.push(rel.id)
      }
    }
    setRoles(roleNames)

    // Permission codes (role-derived + grant overrides minus deny overrides)
    const permSet = new Set<string>()
    if (roleIds.length > 0) {
      const { data: rp } = await supabase
        .from('role_permissions')
        .select('permissions ( code )')
        .in('role_id', roleIds)
      for (const row of rp ?? []) {
        const p: any = (row as any).permissions
        if (p?.code) permSet.add(p.code)
      }
    }

    const { data: overrides } = await supabase
      .from('user_permission_overrides')
      .select('effect, permissions ( code )')
      .eq('user_id', userId)
    for (const o of overrides ?? []) {
      const p: any = (o as any).permissions
      if (!p?.code) continue
      if ((o as any).effect === 'GRANT') permSet.add(p.code)
      else if ((o as any).effect === 'DENY') permSet.delete(p.code)
    }
    setPermissions(permSet)
  }

  useEffect(() => {
    let mounted = true

    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      setAuthUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id).finally(() => mounted && setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      setAuthUser(newSession?.user ?? null)
      if (newSession?.user) {
        void loadProfile(newSession.user.id)
      } else {
        setAppUser(null)
        setRoles([])
        setPermissions(new Set())
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const refreshProfile = async () => {
    if (authUser?.id) await loadProfile(authUser.id)
  }

  const hasPermission = (code: string) => permissions.has(code)

  return (
    <AuthContext.Provider
      value={{
        session,
        authUser,
        appUser,
        roles,
        permissions,
        loading,
        signIn,
        signOut,
        refreshProfile,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

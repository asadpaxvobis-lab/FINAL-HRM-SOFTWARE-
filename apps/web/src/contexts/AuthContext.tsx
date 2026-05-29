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
    setRoles([])
    setPermissions(new Set())

    const { data: u, error: ue } = await supabase
      .from('users')
      .select('id, email, full_name, status, force_password_change, company_id, employee_id')
      .eq('id', userId)
      .single()
    if (ue || !u) {
      console.error('Failed to load public.users row', ue)
      setAppUser(null)
      return
    }
    setAppUser(u as AppUser)

    const [rolesRes, permsRes] = await Promise.all([
      supabase.rpc('get_my_role_names'),
      supabase.rpc('get_my_permission_codes'),
    ])

    if (rolesRes.error) {
      console.error('Failed to load roles', rolesRes.error)
      setRoles([])
    } else {
      setRoles((rolesRes.data ?? []) as string[])
    }

    if (permsRes.error) {
      console.error('Failed to load permissions', permsRes.error)
      setPermissions(new Set())
    } else {
      setPermissions(new Set((permsRes.data ?? []) as string[]))
    }
  }

  useEffect(() => {
    let mounted = true

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
        setLoading(true)
        void loadProfile(newSession.user.id).finally(() => mounted && setLoading(false))
      } else {
        setAppUser(null)
        setRoles([])
        setPermissions(new Set())
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      return { error: error.message }
    }
    if (data.user) {
      await loadProfile(data.user.id)
    }
    setLoading(false)
    return { error: null }
  }

  const signOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    setAppUser(null)
    setRoles([])
    setPermissions(new Set())
    setLoading(false)
  }

  const refreshProfile = async () => {
    if (authUser?.id) {
      setLoading(true)
      await loadProfile(authUser.id)
      setLoading(false)
    }
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

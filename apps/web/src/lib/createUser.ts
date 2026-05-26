import { supabase } from '@/lib/supabase'

export async function createUserViaAdmin(params: {
  email: string
  password: string
  full_name?: string
  phone?: string
  role_ids: string[]
}): Promise<{ user_id?: string; error?: string }> {
  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) return { error: 'Not signed in' }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(params),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { error: json.error ?? `HTTP ${res.status}` }
  }
  return { user_id: json.user_id }
}

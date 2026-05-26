import { supabase } from '@/lib/supabase'

export async function createUserViaAdmin(params: {
  email: string
  password: string
  full_name?: string
  phone?: string
  role_ids: string[]
}): Promise<{ user_id?: string; error?: string }> {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_email: params.email.trim(),
    p_password: params.password,
    p_full_name: params.full_name?.trim() || null,
    p_phone: params.phone?.trim() || null,
    p_role_ids: params.role_ids.length > 0 ? params.role_ids : [],
  })

  if (error) return { error: error.message }
  if (!data) return { error: 'User was not created' }
  return { user_id: data as string }
}

import { supabase } from '@/lib/supabase'

export async function deleteUserViaAdmin(userId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId })
  if (error) return { error: error.message }
  return {}
}

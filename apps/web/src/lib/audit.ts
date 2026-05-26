import { supabase } from '@/lib/supabase'

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ENABLE' | 'DISABLE'

export async function writeAuditLog(params: {
  action: AuditAction
  entityType: string
  entityId?: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  companyId?: string | null
  userId?: string | null
  userEmail?: string | null
}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const user = sessionData.session?.user

  let companyId = params.companyId
  if (!companyId && user?.id) {
    const { data } = await supabase.from('users').select('company_id').eq('id', user.id).single()
    companyId = data?.company_id ?? null
  }

  const { error } = await supabase.from('audit_logs').insert({
    company_id: companyId,
    user_id: params.userId ?? user?.id ?? null,
    user_email: params.userEmail ?? user?.email ?? null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    before_value: params.before ?? null,
    after_value: params.after ?? null,
  })

  if (error) console.warn('Audit log write failed:', error.message)
}

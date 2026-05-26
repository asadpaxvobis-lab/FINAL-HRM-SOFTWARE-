import { useEffect, useState } from 'react'
import { Loader2, ClipboardList, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative } from '@/lib/utils'

type AuditRow = {
  id: number
  user_email: string | null
  action: string
  entity_type: string
  entity_id: string | null
  created_at: string
  ip_address: string | null
}

export function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, user_email, action, entity_type, entity_id, created_at, ip_address')
      .order('created_at', { ascending: false })
      .limit(200)
    if (!error) setRows((data ?? []) as AuditRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Audit log</h2>
          <p className="text-sm text-muted-foreground">Every change in the system is recorded here</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
          <CardDescription>Last 200 entries</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No audit entries yet. As you start changing data, every action will show up here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="px-6 py-3 flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant={r.action === 'DELETE' ? 'destructive' : r.action === 'CREATE' ? 'success' : 'secondary'}>
                    {r.action}
                  </Badge>
                  <span className="font-medium">{r.entity_type}</span>
                  {r.entity_id && <span className="text-muted-foreground font-mono text-xs">{r.entity_id.slice(0, 8)}…</span>}
                  <span className="text-muted-foreground">by {r.user_email || 'system'}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatRelative(r.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

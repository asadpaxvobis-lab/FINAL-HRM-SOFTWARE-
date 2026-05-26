import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Pin,
  AlertTriangle,
  Calendar,
  Paperclip,
  Download,
  CheckCircle2,
  Trash2,
  Archive,
  Send,
  RefreshCw,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { Announcement } from './Announcements'

const categoryColors: Record<Announcement['category'], string> = {
  GENERAL: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  POLICY: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  EVENT: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300',
  HOLIDAY: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  URGENT: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
  HR: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300',
  IT: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300',
  FINANCE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
}

type ReadStat = { total: number; ack: number }

export function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('announcement.update')
  const canDelete = hasPermission('announcement.delete')

  const [item, setItem] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [author, setAuthor] = useState<{ full_name: string | null; email: string } | null>(null)
  const [stats, setStats] = useState<ReadStat | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase.from('announcements').select('*').eq('id', id).single()
    if (error) {
      toast.error('Failed to load announcement', { description: error.message })
      setLoading(false)
      return
    }
    const a = data as Announcement
    setItem(a)

    // Author info
    if (a.created_by) {
      const { data: u } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', a.created_by)
        .single()
      setAuthor((u as { full_name: string | null; email: string } | null) ?? null)
    }

    // Reach stats (only meaningful for admins)
    if (canManage) {
      const [{ count: total }, { count: ack }] = await Promise.all([
        supabase
          .from('announcement_reads')
          .select('id', { count: 'exact', head: true })
          .eq('announcement_id', a.id),
        supabase
          .from('announcement_reads')
          .select('id', { count: 'exact', head: true })
          .eq('announcement_id', a.id)
          .not('acknowledged_at', 'is', null),
      ])
      setStats({ total: total ?? 0, ack: ack ?? 0 })
    }

    // Mark as read & fetch ack state for this user
    if (appUser?.id && a.status === 'PUBLISHED') {
      await supabase
        .from('announcement_reads')
        .upsert({ announcement_id: a.id, user_id: appUser.id }, { onConflict: 'announcement_id,user_id' })

      const { data: r } = await supabase
        .from('announcement_reads')
        .select('acknowledged_at')
        .eq('announcement_id', a.id)
        .eq('user_id', appUser.id)
        .maybeSingle()
      setAcknowledged(!!(r as { acknowledged_at: string | null } | null)?.acknowledged_at)
    }

    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id, appUser?.id])

  async function acknowledge() {
    if (!appUser?.id || !item) return
    setBusy(true)
    const { error } = await supabase
      .from('announcement_reads')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('announcement_id', item.id)
      .eq('user_id', appUser.id)
    setBusy(false)
    if (error) {
      toast.error('Acknowledgement failed', { description: error.message })
      return
    }
    setAcknowledged(true)
    toast.success('Acknowledged')
  }

  async function publish() {
    if (!item) return
    setBusy(true)
    const { error } = await supabase
      .from('announcements')
      .update({ status: 'PUBLISHED', published_at: new Date().toISOString() })
      .eq('id', item.id)
    setBusy(false)
    if (error) {
      toast.error('Publish failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'announcement', entityId: item.id, after: { status: 'PUBLISHED' } })
    toast.success('Published')
    void load()
  }

  async function archive() {
    if (!item) return
    if (!window.confirm('Archive this announcement? It will no longer appear in the active list.')) return
    setBusy(true)
    const { error } = await supabase.from('announcements').update({ status: 'ARCHIVED' }).eq('id', item.id)
    setBusy(false)
    if (error) {
      toast.error('Archive failed', { description: error.message })
      return
    }
    toast.success('Archived')
    void load()
  }

  async function togglePin() {
    if (!item) return
    const { error } = await supabase.from('announcements').update({ pinned: !item.pinned }).eq('id', item.id)
    if (error) {
      toast.error('Pin failed', { description: error.message })
      return
    }
    toast.success(item.pinned ? 'Unpinned' : 'Pinned')
    void load()
  }

  async function deleteItem() {
    if (!item) return
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('announcements').delete().eq('id', item.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Deleted')
    navigate('/announcements')
  }

  async function downloadAttachment() {
    if (!item?.attachment_url) return
    const { data, error } = await supabase.storage
      .from('announcement-files')
      .createSignedUrl(item.attachment_url, 300)
    if (error || !data?.signedUrl) {
      toast.error('Download failed', { description: error?.message })
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Announcement not found.
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/announcements')}>
            Back to list
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.title}
        description={`Published by ${author?.full_name ?? author?.email ?? '—'}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/announcements')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className={'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ' + categoryColors[item.category]}>
              {item.category}
            </span>
            <Badge variant={item.priority === 'URGENT' ? 'destructive' : item.priority === 'HIGH' ? 'warm' : 'outline'}>
              {item.priority}
            </Badge>
            {item.pinned && (
              <Badge variant="warm" className="gap-1">
                <Pin className="h-3 w-3" /> Pinned
              </Badge>
            )}
            {item.status === 'DRAFT' && <Badge variant="outline">DRAFT</Badge>}
            {item.status === 'ARCHIVED' && <Badge variant="secondary">ARCHIVED</Badge>}
            {item.acknowledgement_required && (
              <Badge variant={acknowledged ? 'success' : 'destructive'} className="gap-1">
                {acknowledged ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {acknowledged ? 'Acknowledged' : 'Acknowledgement required'}
              </Badge>
            )}
          </div>
          <CardTitle className="text-2xl mt-2">{item.title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-4 mt-2">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {item.published_at
                ? new Date(item.published_at).toLocaleString()
                : item.publish_at
                  ? `Scheduled ${new Date(item.publish_at).toLocaleString()}`
                  : new Date(item.created_at).toLocaleString()}
            </span>
            {item.expires_at && (
              <span className="text-amber-700 dark:text-amber-400">
                Expires {new Date(item.expires_at).toLocaleString()}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-[15px] leading-relaxed">
            {item.body}
          </div>

          {item.attachment_url && (
            <div>
              <Button variant="outline" size="sm" onClick={() => void downloadAttachment()}>
                <Paperclip className="h-4 w-4" />
                {item.attachment_name ?? 'Attachment'}
                <Download className="h-3 w-3 opacity-60" />
              </Button>
            </div>
          )}

          {item.acknowledgement_required && !acknowledged && item.status === 'PUBLISHED' && (
            <div className="border-t pt-4">
              <Button onClick={() => void acknowledge()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                I acknowledge this announcement
              </Button>
            </div>
          )}

          {canManage && stats && item.status === 'PUBLISHED' && (
            <div className="border-t pt-4 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" /> {stats.total} reads
              </span>
              {item.acknowledgement_required && (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {stats.ack} acknowledgements
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(canManage || canDelete) && (
        <div className="flex flex-wrap gap-2">
          {canManage && item.status === 'DRAFT' && (
            <Button size="sm" onClick={() => void publish()} disabled={busy}>
              <Send className="h-4 w-4" /> Publish now
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => void togglePin()} disabled={busy}>
              <Pin className="h-4 w-4" /> {item.pinned ? 'Unpin' : 'Pin'}
            </Button>
          )}
          {canManage && item.status === 'PUBLISHED' && (
            <Button size="sm" variant="outline" onClick={() => void archive()} disabled={busy}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          {(canDelete || item.created_by === appUser?.id) && (
            <Button size="sm" variant="outline" onClick={() => void deleteItem()} disabled={busy}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

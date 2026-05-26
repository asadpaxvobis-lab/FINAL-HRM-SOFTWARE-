import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Loader2,
  Megaphone,
  Pin,
  ChevronRight,
  Search,
  AlertTriangle,
  Sparkles,
  Calendar,
  Save,
  Send,
  Paperclip,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export type Announcement = {
  id: string
  company_id: string
  title: string
  body: string
  category: 'GENERAL' | 'POLICY' | 'EVENT' | 'HOLIDAY' | 'URGENT' | 'HR' | 'IT' | 'FINANCE'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  pinned: boolean
  acknowledgement_required: boolean
  publish_at: string | null
  expires_at: string | null
  published_at: string | null
  attachment_url: string | null
  attachment_name: string | null
  created_by: string | null
  created_at: string
}

type Tab = 'all' | 'unread' | 'mine' | 'drafts'

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

export function AnnouncementsPage() {
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canCreate = hasPermission('announcement.create')
  const canManage = hasPermission('announcement.update')
  const [tab, setTab] = useState<Tab>('all')
  const [items, setItems] = useState<Announcement[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'GENERAL' as Announcement['category'],
    priority: 'NORMAL' as Announcement['priority'],
    pinned: false,
    acknowledgement_required: false,
    publish_at: '',
    expires_at: '',
  })
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [existingAttachment, setExistingAttachment] = useState<{ url: string; name: string } | null>(null)

  async function load() {
    setLoading(true)
    let q = supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(200)

    if (tab === 'mine') q = q.eq('created_by', appUser?.id ?? '')
    if (tab === 'drafts') q = q.eq('status', 'DRAFT')

    const [{ data, error }, { data: reads }] = await Promise.all([
      q,
      supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', appUser?.id ?? ''),
    ])
    if (error) toast.error('Failed to load announcements', { description: error.message })
    else setItems((data ?? []) as Announcement[])
    setReadIds(new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id)))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tab])

  const filtered = useMemo(() => {
    let list = items
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter((i) => i.title.toLowerCase().includes(s) || i.body.toLowerCase().includes(s))
    }
    if (filterCat) list = list.filter((i) => i.category === filterCat)
    if (tab === 'unread') list = list.filter((i) => i.status === 'PUBLISHED' && !readIds.has(i.id))
    if (tab === 'all') list = list.filter((i) => i.status === 'PUBLISHED')
    return list
  }, [items, search, filterCat, tab, readIds])

  const counts = useMemo(() => {
    const published = items.filter((i) => i.status === 'PUBLISHED')
    return {
      published: published.length,
      unread: published.filter((i) => !readIds.has(i.id)).length,
      drafts: items.filter((i) => i.status === 'DRAFT' && i.created_by === appUser?.id).length,
    }
  }, [items, readIds, appUser?.id])

  function openCompose() {
    setEditing(null)
    setForm({
      title: '',
      body: '',
      category: 'GENERAL',
      priority: 'NORMAL',
      pinned: false,
      acknowledgement_required: false,
      publish_at: '',
      expires_at: '',
    })
    setAttachFile(null)
    setExistingAttachment(null)
    setOpen(true)
  }

  function openEdit(a: Announcement) {
    setEditing(a)
    setForm({
      title: a.title,
      body: a.body,
      category: a.category,
      priority: a.priority,
      pinned: a.pinned,
      acknowledgement_required: a.acknowledgement_required,
      publish_at: a.publish_at ? a.publish_at.slice(0, 16) : '',
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    })
    setAttachFile(null)
    setExistingAttachment(a.attachment_url ? { url: a.attachment_url, name: a.attachment_name ?? '' } : null)
    setOpen(true)
  }

  async function save(publish: boolean) {
    if (!appUser) return
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required')
      return
    }
    setBusy(true)

    let attachment_url = existingAttachment?.url ?? null
    let attachment_name = existingAttachment?.name ?? null
    if (attachFile) {
      const ext = attachFile.name.split('.').pop() ?? 'bin'
      const path = `${appUser.company_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('announcement-files')
        .upload(path, attachFile, { upsert: false, contentType: attachFile.type })
      if (upErr) {
        setBusy(false)
        toast.error('Attachment upload failed', { description: upErr.message })
        return
      }
      attachment_url = path
      attachment_name = attachFile.name
    }

    const payload = {
      company_id: appUser.company_id,
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      priority: form.priority,
      status: publish ? ('PUBLISHED' as const) : ('DRAFT' as const),
      pinned: form.pinned,
      acknowledgement_required: form.acknowledgement_required,
      publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      published_at: publish ? new Date().toISOString() : editing?.published_at ?? null,
      attachment_url,
      attachment_name,
      created_by: editing?.created_by ?? appUser.id,
    }

    if (editing) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Save failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'announcement', entityId: editing.id, after: payload })
      toast.success(publish ? 'Announcement updated & published' : 'Draft saved')
    } else {
      const { data, error } = await supabase.from('announcements').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Save failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'announcement', entityId: data?.id, after: payload })
      toast.success(publish ? 'Announcement published' : 'Draft saved')
    }
    setOpen(false)
    void load()
  }

  const tabs: { id: Tab; label: string; badge?: number; visible: boolean }[] = [
    { id: 'all', label: 'All', badge: counts.published, visible: true },
    { id: 'unread', label: 'Unread', badge: counts.unread, visible: true },
    { id: 'mine', label: 'Mine', visible: canCreate },
    { id: 'drafts', label: 'Drafts', badge: counts.drafts, visible: canCreate },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        description="Company-wide notice board for policies, events, and urgent updates."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canCreate && (
              <Button size="sm" onClick={openCompose}>
                <Plus className="h-4 w-4" /> New announcement
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Total published</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.published}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Unread for you</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.unread}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">My drafts</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.drafts}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b">
        {tabs.filter((t) => t.visible).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              'px-4 py-2 text-sm border-b-2 transition-colors -mb-px flex items-center gap-2 ' +
              (tab === t.id
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-mono">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search title or body…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="min-w-[180px]">
          <Select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            <option value="GENERAL">General</option>
            <option value="POLICY">Policy</option>
            <option value="EVENT">Event</option>
            <option value="HOLIDAY">Holiday</option>
            <option value="URGENT">Urgent</option>
            <option value="HR">HR</option>
            <option value="IT">IT</option>
            <option value="FINANCE">Finance</option>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Megaphone className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No announcements here.
              {canCreate && tab !== 'unread' && (
                <div className="mt-4">
                  <Button size="sm" onClick={openCompose}>
                    <Plus className="h-4 w-4" /> Publish your first announcement
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((a) => {
                const isUnread = a.status === 'PUBLISHED' && !readIds.has(a.id)
                return (
                  <div
                    key={a.id}
                    onClick={() => navigate(`/announcements/${a.id}`)}
                    className={
                      'flex items-start gap-4 px-6 py-4 hover:bg-muted/30 cursor-pointer ' +
                      (a.pinned ? 'bg-amber-50/40 dark:bg-amber-950/10' : '')
                    }
                  >
                    <div className="flex flex-col items-center pt-1 gap-1 min-w-[24px]">
                      {a.pinned && <Pin className="h-4 w-4 text-amber-600" />}
                      {a.priority === 'URGENT' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                      {a.priority === 'HIGH' && <Sparkles className="h-4 w-4 text-orange-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium ' + categoryColors[a.category]}>
                          {a.category}
                        </span>
                        {isUnread && (
                          <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-label="Unread" />
                        )}
                        {a.status === 'DRAFT' && (
                          <Badge variant="outline" className="text-[10px]">
                            DRAFT
                          </Badge>
                        )}
                        {a.acknowledgement_required && (
                          <Badge variant="warm" className="text-[10px]">
                            Acknowledge
                          </Badge>
                        )}
                      </div>
                      <div className={'mt-1 truncate ' + (isUnread ? 'font-semibold' : 'font-medium')}>
                        {a.title}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.body}</div>
                      <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {a.published_at
                            ? new Date(a.published_at).toLocaleString()
                            : a.publish_at
                              ? `Scheduled ${new Date(a.publish_at).toLocaleString()}`
                              : new Date(a.created_at).toLocaleString()}
                        </span>
                        {a.attachment_url && (
                          <span className="flex items-center gap-1">
                            <Paperclip className="h-3 w-3" /> {a.attachment_name ?? 'Attachment'}
                          </span>
                        )}
                        {(canManage || a.created_by === appUser?.id) && a.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openEdit(a)
                            }}
                            className="text-primary hover:underline"
                          >
                            Edit draft
                          </button>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground self-center" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
            <DialogDescription>
              Draft now and publish later, or publish immediately. Pinned items appear at the top of every dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Quarterly all-hands on Friday"
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write the full message here. Plain text only."
              />
              <p className="text-xs text-muted-foreground">{form.body.length} characters</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Announcement['category'] })}>
                  <option value="GENERAL">General</option>
                  <option value="POLICY">Policy</option>
                  <option value="EVENT">Event</option>
                  <option value="HOLIDAY">Holiday</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HR">HR</option>
                  <option value="IT">IT</option>
                  <option value="FINANCE">Finance</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Announcement['priority'] })}>
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Schedule publish (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.publish_at}
                  onChange={(e) => setForm({ ...form, publish_at: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires (optional)</Label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.pinned} onCheckedChange={(v) => setForm({ ...form, pinned: !!v })} />
                Pin to top
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.acknowledgement_required}
                  onCheckedChange={(v) => setForm({ ...form, acknowledgement_required: !!v })}
                />
                Acknowledgement required
              </label>
            </div>

            <div className="space-y-2">
              <Label>Attachment (optional)</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
              />
              {existingAttachment && !attachFile && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" /> Current: {existingAttachment.name}
                  <button
                    type="button"
                    onClick={() => setExistingAttachment(null)}
                    className="ml-1 text-destructive hover:underline"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => void save(false)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
            </Button>
            <Button onClick={() => void save(true)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

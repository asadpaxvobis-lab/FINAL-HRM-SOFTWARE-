import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, FileText, Trash2, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { AVAILABLE_TOKENS, LETTER_TYPES, LETTER_TYPE_LABELS, type LetterType } from '@/lib/letters'

type Template = {
  id: string
  code: string
  name: string
  letter_type: LetterType
  subject: string
  body: string
  description: string | null
  is_active: boolean
}

const emptyForm = {
  code: '',
  name: '',
  letter_type: 'GENERAL' as LetterType,
  subject: '',
  body: '',
  description: '',
  is_active: true,
}

export function LetterTemplatesPage() {
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('letter.template')
  const [rows, setRows] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [filterType, setFilterType] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('letter_templates').select('*').order('name')
    if (error) toast.error('Failed to load templates', { description: error.message })
    else setRows((data ?? []) as Template[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(
    () => (filterType ? rows.filter((r) => r.letter_type === filterType) : rows),
    [rows, filterType]
  )

  const openCreate = async () => {
    setEditing(null)
    const code = await nextCode({
      table: 'letter_templates',
      column: 'code',
      prefix: 'TPL-',
      width: 4,
      companyId: appUser?.company_id,
    })
    setForm({ ...emptyForm, code })
    setOpen(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({
      code: t.code,
      name: t.name,
      letter_type: t.letter_type,
      subject: t.subject,
      body: t.body,
      description: t.description ?? '',
      is_active: t.is_active,
    })
    setOpen(true)
  }

  const duplicate = async (t: Template) => {
    if (!appUser?.company_id) return
    const code = await nextCode({
      table: 'letter_templates',
      column: 'code',
      prefix: 'TPL-',
      width: 4,
      companyId: appUser.company_id,
    })
    setEditing(null)
    setForm({
      code,
      name: `${t.name} (copy)`,
      letter_type: t.letter_type,
      subject: t.subject,
      body: t.body,
      description: t.description ?? '',
      is_active: true,
    })
    setOpen(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      code: form.code.trim(),
      name: form.name.trim(),
      letter_type: form.letter_type,
      subject: form.subject.trim(),
      body: form.body,
      description: form.description.trim() || null,
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('letter_templates').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'letter_template', entityId: editing.id })
      toast.success('Template updated')
    } else {
      const { data, error } = await supabase.from('letter_templates').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'letter_template', entityId: data?.id })
      toast.success('Template added')
    }
    setOpen(false)
    void load()
  }

  const onDelete = async (t: Template) => {
    if (!window.confirm(`Delete template "${t.name}"?`)) return
    const { error } = await supabase.from('letter_templates').delete().eq('id', t.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Template deleted')
    void load()
  }

  const insertToken = (token: string) => {
    const el = document.getElementById('tpl-body') as HTMLTextAreaElement | null
    if (!el) return
    const ins = `{{${token}}}`
    const start = el.selectionStart ?? form.body.length
    const end = el.selectionEnd ?? form.body.length
    const next = form.body.slice(0, start) + ins + form.body.slice(end)
    setForm((f) => ({ ...f, body: next }))
    queueMicrotask(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + ins.length
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Letter templates"
        description="Re-usable templates for offer, experience, salary certificate, NOC, warnings, etc."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="letter.template">
              <Button size="sm" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            </HasPermission>
          </>
        }
      />

      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[200px]">
          <Label className="text-xs">Filter by type</Label>
          <Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {LETTER_TYPES.map((t) => (
              <option key={t} value={t}>
                {LETTER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filtered.length} template(s)</CardTitle>
          <CardDescription>Templates with variables like {'{{employee_name}}'} get auto-filled at issue time.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No templates yet.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.code}</div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {LETTER_TYPE_LABELS[t.letter_type]}
                  </Badge>
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" title="Duplicate" onClick={() => void duplicate(t)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit template' : 'New template'}</DialogTitle>
            <DialogDescription>
              Use {'{{token}}'} placeholders. Click a token from the panel to insert it at the cursor.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} readOnly disabled className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Letter type</Label>
                <Select
                  value={form.letter_type}
                  onChange={(e) => setForm({ ...form, letter_type: e.target.value as LetterType })}
                >
                  {LETTER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {LETTER_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief note about when to use this template"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Subject</Label>
                <Input
                  required
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="e.g. Offer of Employment - {{employee_name}}"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Body</Label>
                <Textarea
                  id="tpl-body"
                  required
                  rows={12}
                  className="font-mono text-sm"
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs">Available tokens (click to insert)</Label>
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_TOKENS.map((tk) => (
                    <button
                      key={tk.token}
                      type="button"
                      onClick={() => insertToken(tk.token)}
                      title={tk.label}
                      className="text-[11px] font-mono px-2 py-1 rounded border bg-muted hover:bg-accent transition-colors"
                    >
                      {`{{${tk.token}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
                />
                Active
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  RefreshCw,
  Loader2,
  FileText,
  Search,
  ChevronRight,
  Send,
  Save,
  Sparkles,
  X,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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
import {
  LETTER_TYPES,
  LETTER_TYPE_LABELS,
  buildTokenMapForEmployee,
  renderTemplate,
  findUnresolvedTokens,
  type LetterType,
  type TokenMap,
} from '@/lib/letters'

type Letter = {
  id: string
  letter_no: string
  employee_id: string
  template_id: string | null
  letter_type: LetterType
  subject: string
  body: string
  status: 'DRAFT' | 'ISSUED' | 'SENT' | 'ARCHIVED'
  issued_at: string | null
  signatory_name: string | null
  signatory_title: string | null
  created_at: string
  employees?: { employee_code: string; full_name: string }
}

type Template = {
  id: string
  code: string
  name: string
  letter_type: LetterType
  subject: string
  body: string
  is_active: boolean
}

type Employee = { id: string; full_name: string; employee_code: string }

type Tab = 'mine' | 'drafts' | 'issued' | 'all'

const statusVariant = (s: Letter['status']) =>
  s === 'SENT' || s === 'ISSUED' ? 'success' : s === 'DRAFT' ? 'warm' : 'secondary'

export function LettersPage() {
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canCreate = hasPermission('letter.create')
  const canManage = hasPermission('letter.template')
  const [tab, setTab] = useState<Tab>(canCreate ? 'all' : 'mine')
  const [letters, setLetters] = useState<Letter[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [step, setStep] = useState<1 | 2>(1)
  const [composeForm, setComposeForm] = useState({
    template_id: '',
    employee_id: '',
    letter_type: 'GENERAL' as LetterType,
    subject: '',
    body: '',
    signatory_name: '',
    signatory_title: '',
    notes: '',
  })

  async function load() {
    setLoading(true)
    let q = supabase
      .from('letters')
      .select(
        'id, letter_no, employee_id, template_id, letter_type, subject, body, status, issued_at, signatory_name, signatory_title, created_at, employees(employee_code, full_name)'
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (tab === 'mine' && appUser?.employee_id) q = q.eq('employee_id', appUser.employee_id).in('status', ['ISSUED', 'SENT'])
    else if (tab === 'drafts') q = q.eq('status', 'DRAFT')
    else if (tab === 'issued') q = q.in('status', ['ISSUED', 'SENT'])

    const [{ data, error }, { data: tpl }, { data: emps }] = await Promise.all([
      q,
      supabase.from('letter_templates').select('*').eq('is_active', true).order('name'),
      supabase
        .from('employees')
        .select('id, full_name, employee_code')
        .eq('is_active', true)
        .order('full_name'),
    ])
    if (error) toast.error('Failed to load letters', { description: error.message })
    else {
      const mapped = (data ?? []).map((r: Record<string, unknown>) => ({
        ...(r as object),
        employees: Array.isArray(r.employees) ? (r.employees as unknown[])[0] : r.employees,
      })) as Letter[]
      setLetters(mapped)
    }
    setTemplates((tpl ?? []) as Template[])
    setEmployees((emps ?? []) as Employee[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [tab])

  const filtered = useMemo(() => {
    let list = letters
    if (search.trim()) {
      const s = search.toLowerCase()
      list = list.filter(
        (l) =>
          l.subject.toLowerCase().includes(s) ||
          l.letter_no.toLowerCase().includes(s) ||
          l.employees?.full_name.toLowerCase().includes(s) ||
          l.employees?.employee_code.toLowerCase().includes(s)
      )
    }
    if (filterType) list = list.filter((l) => l.letter_type === filterType)
    return list
  }, [letters, search, filterType])

  const counts = useMemo(() => {
    return {
      drafts: letters.filter((l) => l.status === 'DRAFT').length,
      issued: letters.filter((l) => l.status === 'ISSUED' || l.status === 'SENT').length,
      total: letters.length,
    }
  }, [letters])

  function openCompose() {
    setStep(1)
    setComposeForm({
      template_id: '',
      employee_id: '',
      letter_type: 'GENERAL',
      subject: '',
      body: '',
      signatory_name: '',
      signatory_title: '',
      notes: '',
    })
    setOpen(true)
  }

  async function applyTemplateAndEmployee(templateId: string, employeeId: string) {
    if (!templateId || !employeeId) return
    setBusy(true)
    const tpl = templates.find((t) => t.id === templateId)
    if (!tpl) {
      setBusy(false)
      return
    }
    const tokens: TokenMap = await buildTokenMapForEmployee(employeeId)
    const subject = renderTemplate(tpl.subject, tokens)
    const body = renderTemplate(tpl.body, tokens)
    setComposeForm((f) => ({
      ...f,
      template_id: templateId,
      employee_id: employeeId,
      letter_type: tpl.letter_type,
      subject,
      body,
    }))
    setBusy(false)
    setStep(2)
  }

  async function nextStep() {
    if (step === 1) {
      if (!composeForm.template_id || !composeForm.employee_id) {
        toast.error('Pick a template and an employee')
        return
      }
      await applyTemplateAndEmployee(composeForm.template_id, composeForm.employee_id)
    }
  }

  async function save(issue: boolean) {
    if (!appUser) return
    if (!composeForm.subject.trim() || !composeForm.body.trim()) {
      toast.error('Subject and body are required')
      return
    }
    const unresolved = findUnresolvedTokens(composeForm.body)
    if (unresolved.length > 0 && issue) {
      const proceed = window.confirm(
        `These tokens are still unfilled: ${unresolved.join(', ')}. Issue anyway?`
      )
      if (!proceed) return
    }
    setBusy(true)

    const yr = new Date().getFullYear()
    const { data: existing } = await supabase
      .from('letters')
      .select('letter_no')
      .eq('company_id', appUser.company_id)
      .ilike('letter_no', `LT-${yr}-%`)
      .order('letter_no', { ascending: false })
      .limit(1)
    let n = 1
    if (existing && existing.length > 0) {
      const m = (existing[0] as { letter_no: string }).letter_no.match(/(\d+)$/)
      if (m) n = parseInt(m[1], 10) + 1
    }
    const letter_no = `LT-${yr}-${String(n).padStart(4, '0')}`

    const payload = {
      company_id: appUser.company_id,
      letter_no,
      employee_id: composeForm.employee_id,
      template_id: composeForm.template_id || null,
      letter_type: composeForm.letter_type,
      subject: composeForm.subject.trim(),
      body: composeForm.body,
      status: issue ? ('ISSUED' as const) : ('DRAFT' as const),
      issued_at: issue ? new Date().toISOString() : null,
      issued_by: issue ? appUser.id : null,
      signatory_name: composeForm.signatory_name.trim() || null,
      signatory_title: composeForm.signatory_title.trim() || null,
      notes: composeForm.notes.trim() || null,
      created_by: appUser.id,
    }
    const { data, error } = await supabase.from('letters').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'letter', entityId: data?.id, after: payload })
    toast.success(issue ? 'Letter issued' : 'Draft saved')
    setOpen(false)
    if (issue) navigate(`/letters/${data?.id}`)
    else void load()
  }

  const unresolved = useMemo(() => findUnresolvedTokens(composeForm.body), [composeForm.body])

  const allTabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'all', label: 'All', visible: canCreate },
    { id: 'issued', label: 'Issued', visible: canCreate },
    { id: 'drafts', label: 'Drafts', visible: canCreate },
    { id: 'mine', label: 'My letters', visible: !!appUser?.employee_id },
  ]
  const tabs = allTabs.filter((t) => t.visible)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Letters"
        description="Offer, experience, salary certificate, NOC, warnings and more with template rendering."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => navigate('/letters/templates')}>
                Templates
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={openCompose}>
                <Plus className="h-4 w-4" /> New letter
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Issued / sent</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.issued}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Drafts</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.drafts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-semibold tabular-nums">{counts.total}</div>
          </CardContent>
        </Card>
      </div>

      {tabs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'px-4 py-2 text-sm border-b-2 transition-colors -mb-px ' +
                (tab === t.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search letter no, subject, employee…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="min-w-[180px]">
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
          <CardTitle className="text-base">{filtered.length} letter(s)</CardTitle>
          <CardDescription>Click a row to open the printable view.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No letters here yet.
              {canCreate && (
                <div className="mt-4">
                  <Button size="sm" onClick={openCompose}>
                    <Plus className="h-4 w-4" /> Compose your first letter
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/letters/${l.id}`)}
                >
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium truncate">{l.subject}</div>
                    <div className="text-xs text-muted-foreground font-mono">{l.letter_no}</div>
                  </div>
                  <div className="text-sm min-w-[160px]">
                    <div className="font-medium">{l.employees?.full_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{l.employees?.employee_code}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {LETTER_TYPE_LABELS[l.letter_type]}
                  </Badge>
                  <Badge variant={statusVariant(l.status)} className="text-[10px]">
                    {l.status}
                  </Badge>
                  <div className="text-xs text-muted-foreground min-w-[120px] text-right">
                    {l.issued_at ? new Date(l.issued_at).toLocaleDateString() : new Date(l.created_at).toLocaleDateString()}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compose dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New letter</DialogTitle>
            <DialogDescription>
              Step {step} of 2 — {step === 1 ? 'Pick a template and an employee' : 'Review and edit the rendered letter'}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template *</Label>
                <Select
                  value={composeForm.template_id}
                  onChange={(e) => setComposeForm({ ...composeForm, template_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {LETTER_TYPE_LABELS[t.letter_type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employee *</Label>
                <Select
                  value={composeForm.employee_id}
                  onChange={(e) => setComposeForm({ ...composeForm, employee_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.full_name} ({e.employee_code})
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Variables like {'{{employee_name}}'}, {'{{salary_gross}}'}, {'{{date_of_joining}}'} will be auto-filled in
                the next step. You can still edit the rendered text freely.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={composeForm.subject}
                  onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Body *</Label>
                <Textarea
                  rows={14}
                  className="font-mono text-sm"
                  value={composeForm.body}
                  onChange={(e) => setComposeForm({ ...composeForm, body: e.target.value })}
                />
                {unresolved.length > 0 && (
                  <div className="text-xs flex items-center gap-2 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>
                      {unresolved.length} unresolved token(s): {unresolved.map((t) => `{{${t}}}`).join(', ')}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setComposeForm((f) => ({
                          ...f,
                          body: f.body.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, ''),
                        }))
                      }
                      className="ml-auto underline"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Signatory name</Label>
                  <Input
                    value={composeForm.signatory_name}
                    onChange={(e) => setComposeForm({ ...composeForm, signatory_name: e.target.value })}
                    placeholder="e.g. Asad Ali"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Signatory title</Label>
                  <Input
                    value={composeForm.signatory_title}
                    onChange={(e) => setComposeForm({ ...composeForm, signatory_title: e.target.value })}
                    placeholder="e.g. Head of HR"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Internal notes</Label>
                <Input
                  value={composeForm.notes}
                  onChange={(e) => setComposeForm({ ...composeForm, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            {step === 2 && (
              <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
                ← Back
              </Button>
            )}
            {step === 1 ? (
              <Button onClick={() => void nextStep()} disabled={busy || !composeForm.template_id || !composeForm.employee_id}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Render & next
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void save(false)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                </Button>
                <Button onClick={() => void save(true)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Issue
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

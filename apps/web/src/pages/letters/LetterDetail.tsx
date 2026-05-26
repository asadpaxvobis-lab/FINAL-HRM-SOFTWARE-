import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Printer,
  Send,
  Save,
  Archive,
  Edit3,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { LETTER_TYPE_LABELS, findUnresolvedTokens, type LetterType } from '@/lib/letters'

type Company = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  logo_url: string | null
}

type Letter = {
  id: string
  letter_no: string
  employee_id: string
  letter_type: LetterType
  subject: string
  body: string
  status: 'DRAFT' | 'ISSUED' | 'SENT' | 'ARCHIVED'
  issued_at: string | null
  sent_at: string | null
  signatory_name: string | null
  signatory_title: string | null
  notes: string | null
  created_at: string
  employees?: { full_name: string; employee_code: string; email: string | null }
  companies?: Company
}

const statusVariant = (s: Letter['status']) =>
  s === 'SENT' || s === 'ISSUED' ? 'success' : s === 'DRAFT' ? 'warm' : 'secondary'

export function LetterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission, appUser } = useAuth()
  const canManage = hasPermission('letter.create')
  const [letter, setLetter] = useState<Letter | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({
    subject: '',
    body: '',
    signatory_name: '',
    signatory_title: '',
  })

  async function load() {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('letters')
      .select(
        'id, letter_no, employee_id, letter_type, subject, body, status, issued_at, sent_at, signatory_name, signatory_title, notes, created_at, company_id, employees(full_name, employee_code, email), companies(name, address, phone, email, logo_url)'
      )
      .eq('id', id)
      .single()
    if (error) {
      toast.error('Failed to load letter', { description: error.message })
      setLoading(false)
      return
    }
    const row = data as Record<string, unknown>
    const mapped: Letter = {
      ...(row as object as Letter),
      employees: Array.isArray(row.employees) ? (row.employees as unknown[])[0] as Letter['employees'] : (row.employees as Letter['employees']),
      companies: Array.isArray(row.companies) ? (row.companies as unknown[])[0] as Company : (row.companies as Company),
    }
    setLetter(mapped)
    setEditForm({
      subject: mapped.subject,
      body: mapped.body,
      signatory_name: mapped.signatory_name ?? '',
      signatory_title: mapped.signatory_title ?? '',
    })
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  async function transition(newStatus: Letter['status']) {
    if (!letter || !appUser) return
    const update: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'ISSUED' && !letter.issued_at) {
      update.issued_at = new Date().toISOString()
      update.issued_by = appUser.id
    }
    if (newStatus === 'SENT') {
      update.sent_at = new Date().toISOString()
    }
    const { error } = await supabase.from('letters').update(update).eq('id', letter.id)
    if (error) {
      toast.error('Update failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'letter', entityId: letter.id, after: update })
    toast.success(`Letter ${newStatus.toLowerCase()}`)
    void load()
  }

  async function saveEdit() {
    if (!letter) return
    const payload = {
      subject: editForm.subject.trim(),
      body: editForm.body,
      signatory_name: editForm.signatory_name.trim() || null,
      signatory_title: editForm.signatory_title.trim() || null,
    }
    const { error } = await supabase.from('letters').update(payload).eq('id', letter.id)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'letter', entityId: letter.id, after: payload })
    toast.success('Letter saved')
    setEditMode(false)
    void load()
  }

  if (loading)
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  if (!letter) return <div className="p-12 text-center text-muted-foreground">Letter not found.</div>

  const company = letter.companies
  const unresolved = findUnresolvedTokens(letter.body)
  const isDraft = letter.status === 'DRAFT'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate('/letters')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm text-muted-foreground font-mono">{letter.letter_no}</div>
          <div className="text-lg font-semibold">{letter.subject}</div>
        </div>
        <Badge variant={statusVariant(letter.status)}>{letter.status}</Badge>
        <Badge variant="outline">{LETTER_TYPE_LABELS[letter.letter_type]}</Badge>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          {canManage && isDraft && !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Edit3 className="h-4 w-4" /> Edit
            </Button>
          )}
          {canManage && isDraft && (
            <Button size="sm" onClick={() => void transition('ISSUED')}>
              <Send className="h-4 w-4" /> Issue
            </Button>
          )}
          {canManage && letter.status === 'ISSUED' && (
            <Button size="sm" onClick={() => void transition('SENT')}>
              <Send className="h-4 w-4" /> Mark sent
            </Button>
          )}
          {canManage && (letter.status === 'ISSUED' || letter.status === 'SENT') && (
            <Button variant="outline" size="sm" onClick={() => void transition('ARCHIVED')}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      {unresolved.length > 0 && (
        <div className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md print:hidden">
          <AlertTriangle className="h-4 w-4" />
          <span>
            This letter still has {unresolved.length} unresolved token(s): {unresolved.map((t) => `{{${t}}}`).join(', ')}
          </span>
        </div>
      )}

      {editMode ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                rows={18}
                className="font-mono text-sm"
                value={editForm.body}
                onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Signatory name</Label>
                <Input
                  value={editForm.signatory_name}
                  onChange={(e) => setEditForm({ ...editForm, signatory_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Signatory title</Label>
                <Input
                  value={editForm.signatory_title}
                  onChange={(e) => setEditForm({ ...editForm, signatory_title: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()}>
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white text-black mx-auto max-w-[210mm] min-h-[297mm] shadow-lg print:shadow-none p-12 print:p-16 print-letter">
          <header className="flex items-start gap-4 border-b pb-6 mb-8">
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-16 w-16 object-contain" />
            ) : (
              <div className="h-16 w-16 grid place-items-center rounded bg-slate-100 text-slate-400 text-xs">LOGO</div>
            )}
            <div className="flex-1">
              <div className="text-2xl font-bold tracking-tight">{company?.name ?? 'Company'}</div>
              {company?.address && <div className="text-xs text-slate-600 mt-1">{company.address}</div>}
              <div className="text-xs text-slate-600 mt-0.5 flex gap-3 flex-wrap">
                {company?.phone && <span>Tel: {company.phone}</span>}
                {company?.email && <span>Email: {company.email}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div className="font-mono">{letter.letter_no}</div>
              <div>
                Date:{' '}
                {letter.issued_at
                  ? new Date(letter.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                  : new Date(letter.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </header>

          <h1 className="text-xl font-semibold mb-6 text-center underline underline-offset-4">{letter.subject}</h1>

          <article className="whitespace-pre-wrap text-[14px] leading-7">{letter.body}</article>

          <footer className="mt-12 pt-6">
            {letter.signatory_name && (
              <div>
                <div className="h-16" />
                <div className="font-semibold">{letter.signatory_name}</div>
                {letter.signatory_title && <div className="text-sm text-slate-600">{letter.signatory_title}</div>}
                {company?.name && <div className="text-sm text-slate-600">{company.name}</div>}
              </div>
            )}
          </footer>
        </div>
      )}

      <Card className="print:hidden">
        <CardContent className="pt-6 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Recipient</div>
            <div className="font-medium">{letter.employees?.full_name}</div>
            <div className="text-xs text-muted-foreground font-mono">{letter.employees?.employee_code}</div>
            {letter.employees?.email && <div className="text-xs">{letter.employees.email}</div>}
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Timeline</div>
            <div>Created: {new Date(letter.created_at).toLocaleString()}</div>
            {letter.issued_at && <div>Issued: {new Date(letter.issued_at).toLocaleString()}</div>}
            {letter.sent_at && <div>Sent: {new Date(letter.sent_at).toLocaleString()}</div>}
          </div>
          {letter.notes && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground">Internal notes</div>
              <div>{letter.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <style>{`
        @media print {
          body { background: white !important; }
          .print-letter { box-shadow: none !important; }
          aside, nav, header.app-topbar { display: none !important; }
        }
      `}</style>
    </div>
  )
}

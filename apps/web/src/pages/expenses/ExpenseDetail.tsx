import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Send,
  CheckCircle2,
  XCircle,
  Save,
  Download,
  Paperclip,
  CreditCard,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Claim = {
  id: string
  claim_no: string
  title: string
  employee_id: string
  claim_date: string
  total_amount: number
  currency: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED' | 'CANCELLED'
  submitted_at: string | null
  decided_at: string | null
  decided_by: string | null
  decision_note: string | null
  notes: string | null
  employees?: { employee_code: string; full_name: string }
}

type Line = {
  id: string
  category_id: string | null
  category_code: string | null
  category_name: string | null
  expense_date: string
  amount: number
  description: string | null
  vendor: string | null
  attachment_url: string | null
  has_receipt: boolean
  sort_order: number
}

type Category = {
  id: string
  code: string
  name: string
  max_per_claim: number | null
  requires_attachment: boolean
}

const emptyLine = {
  category_id: '',
  expense_date: new Date().toISOString().slice(0, 10),
  amount: 0,
  description: '',
  vendor: '',
}

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [lineOpen, setLineOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<Line | null>(null)
  const [lineForm, setLineForm] = useState(emptyLine)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

  const [decisionOpen, setDecisionOpen] = useState(false)
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT'>('APPROVE')
  const [decisionNote, setDecisionNote] = useState('')

  const canApprove = hasPermission('expense.approve')
  const isOwner = appUser?.employee_id === claim?.employee_id
  const editable = !!claim && claim.status === 'DRAFT' && isOwner

  async function load() {
    if (!id) return
    setLoading(true)
    const [c, ln, cat] = await Promise.all([
      supabase
        .from('expense_claims')
        .select('*, employees(employee_code, full_name)')
        .eq('id', id)
        .single(),
      supabase.from('expense_claim_lines').select('*').eq('claim_id', id).order('sort_order'),
      supabase.from('expense_categories').select('id, code, name, max_per_claim, requires_attachment').eq('is_active', true).order('name'),
    ])
    if (c.error || !c.data) {
      toast.error('Claim not found', { description: c.error?.message })
      setLoading(false)
      return
    }
    const data = c.data as Record<string, unknown>
    setClaim({
      ...(data as object),
      employees: Array.isArray(data.employees) ? (data.employees as unknown[])[0] : data.employees,
    } as Claim)
    setLines((ln.data ?? []) as Line[])
    setCategories((cat.data ?? []) as Category[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const total = useMemo(() => lines.reduce((s, l) => s + Number(l.amount), 0), [lines])

  // Keep parent total in sync when lines change
  useEffect(() => {
    if (!claim) return
    if (Number(claim.total_amount) === total) return
    void supabase.from('expense_claims').update({ total_amount: total }).eq('id', claim.id)
  }, [total, claim])

  // ---------- Line CRUD ----------
  const openLineAdd = () => {
    setEditingLine(null)
    setLineForm({ ...emptyLine, expense_date: new Date().toISOString().slice(0, 10) })
    setLineOpen(true)
  }
  const openLineEdit = (l: Line) => {
    setEditingLine(l)
    setLineForm({
      category_id: l.category_id ?? '',
      expense_date: l.expense_date,
      amount: Number(l.amount),
      description: l.description ?? '',
      vendor: l.vendor ?? '',
    })
    setLineOpen(true)
  }
  const saveLine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!claim) return
    setBusy(true)
    const cat = categories.find((c) => c.id === lineForm.category_id)
    if (cat?.max_per_claim != null && Number(lineForm.amount) > Number(cat.max_per_claim)) {
      const yes = window.confirm(
        `This category has a per-claim cap of ${cat.max_per_claim}. Amount exceeds it. Save anyway?`
      )
      if (!yes) {
        setBusy(false)
        return
      }
    }
    const payload = {
      claim_id: claim.id,
      category_id: lineForm.category_id || null,
      category_code: cat?.code ?? null,
      category_name: cat?.name ?? null,
      expense_date: lineForm.expense_date,
      amount: Number(lineForm.amount),
      description: lineForm.description.trim() || null,
      vendor: lineForm.vendor.trim() || null,
      sort_order: lines.length * 10 + 10,
    }
    if (editingLine) {
      const { error } = await supabase.from('expense_claim_lines').update(payload).eq('id', editingLine.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      toast.success('Line updated')
    } else {
      const { error } = await supabase.from('expense_claim_lines').insert(payload)
      setBusy(false)
      if (error) {
        toast.error('Add failed', { description: error.message })
        return
      }
      toast.success('Line added')
    }
    setLineOpen(false)
    void load()
  }
  const deleteLine = async (l: Line) => {
    if (!window.confirm('Delete this line?')) return
    if (l.attachment_url) {
      await supabase.storage.from('expense-receipts').remove([l.attachment_url])
    }
    const { error } = await supabase.from('expense_claim_lines').delete().eq('id', l.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Line removed')
    void load()
  }

  // ---------- Receipt upload ----------
  const pickFile = (lineId: string) => {
    setUploadingFor(lineId)
    fileInput.current?.click()
  }
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !uploadingFor || !claim) {
      setUploadingFor(null)
      return
    }
    const lineId = uploadingFor
    setUploadingFor(null)
    const ext = f.name.split('.').pop()
    const path = `${claim.id}/${lineId}.${ext}`
    const { error: upErr } = await supabase.storage.from('expense-receipts').upload(path, f, { upsert: true })
    if (upErr) {
      toast.error('Upload failed', { description: upErr.message })
      return
    }
    const { error: updErr } = await supabase
      .from('expense_claim_lines')
      .update({ attachment_url: path, has_receipt: true })
      .eq('id', lineId)
    if (updErr) {
      toast.error('Save failed', { description: updErr.message })
      return
    }
    toast.success('Receipt uploaded')
    void load()
  }
  const downloadReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from('expense-receipts').createSignedUrl(path, 300)
    if (error || !data) {
      toast.error('Could not get download URL', { description: error?.message })
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  // ---------- Workflow ----------
  const submit = async () => {
    if (!claim) return
    if (lines.length === 0) {
      toast.error('Add at least one line item before submitting')
      return
    }
    // Validate required receipts
    const missing = lines.filter((l) => {
      const c = categories.find((x) => x.id === l.category_id)
      return c?.requires_attachment && !l.has_receipt
    })
    if (missing.length > 0) {
      const yes = window.confirm(
        `${missing.length} line(s) need a receipt but none is attached. Submit anyway?`
      )
      if (!yes) return
    }
    const { error } = await supabase
      .from('expense_claims')
      .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString(), total_amount: total })
      .eq('id', claim.id)
    if (error) {
      toast.error('Submit failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'expense_claim', entityId: claim.id, after: { status: 'SUBMITTED' } })
    toast.success('Claim submitted for approval')
    void load()
  }

  const decide = async () => {
    if (!claim) return
    const newStatus = decisionAction === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    const { error } = await supabase
      .from('expense_claims')
      .update({
        status: newStatus,
        decided_at: new Date().toISOString(),
        decided_by: appUser?.id,
        decision_note: decisionNote.trim() || null,
      })
      .eq('id', claim.id)
    if (error) {
      toast.error('Update failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'expense_claim', entityId: claim.id, after: { status: newStatus, decision_note: decisionNote } })
    toast.success(`Claim ${newStatus.toLowerCase()}`)
    setDecisionOpen(false)
    setDecisionNote('')
    void load()
  }

  const reimburse = async () => {
    if (!claim) return
    if (!window.confirm('Mark this claim as reimbursed?')) return
    const { error } = await supabase
      .from('expense_claims')
      .update({ status: 'REIMBURSED', paid_at: new Date().toISOString() })
      .eq('id', claim.id)
    if (error) {
      toast.error('Update failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'UPDATE', entityType: 'expense_claim', entityId: claim.id, after: { status: 'REIMBURSED' } })
    toast.success('Marked reimbursed')
    void load()
  }

  const cancelDraft = async () => {
    if (!claim) return
    if (!window.confirm('Cancel this draft? It will be deleted.')) return
    await supabase.storage.from('expense-receipts').list(claim.id).then(async (r) => {
      const files = (r.data ?? []).map((f) => `${claim.id}/${f.name}`)
      if (files.length > 0) await supabase.storage.from('expense-receipts').remove(files)
    })
    const { error } = await supabase.from('expense_claims').delete().eq('id', claim.id)
    if (error) {
      toast.error('Cancel failed', { description: error.message })
      return
    }
    toast.success('Cancelled')
    navigate('/expenses')
  }

  if (loading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!claim) return null

  const statusVariant =
    claim.status === 'APPROVED' || claim.status === 'REIMBURSED'
      ? 'success'
      : claim.status === 'SUBMITTED'
      ? 'warm'
      : claim.status === 'REJECTED' || claim.status === 'CANCELLED'
      ? 'destructive'
      : 'outline'

  return (
    <div className="space-y-6">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="hidden"
        onChange={onFileChosen}
      />

      <PageHeader
        title={claim.title}
        description={`${claim.claim_no} · ${claim.employees?.full_name ?? ''} ${claim.employees?.employee_code ? `(${claim.employees.employee_code})` : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/expenses')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {editable && (
              <>
                <Button size="sm" onClick={submit}>
                  <Send className="h-4 w-4" /> Submit
                </Button>
                <Button variant="outline" size="sm" onClick={() => void cancelDraft()}>
                  Cancel draft
                </Button>
              </>
            )}
            {canApprove && claim.status === 'SUBMITTED' && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setDecisionAction('APPROVE')
                    setDecisionOpen(true)
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDecisionAction('REJECT')
                    setDecisionOpen(true)
                  }}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
              </>
            )}
            {canApprove && claim.status === 'APPROVED' && (
              <Button size="sm" onClick={() => void reimburse()}>
                <CreditCard className="h-4 w-4" /> Mark reimbursed
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Status</CardDescription>
            <div>
              <Badge variant={statusVariant} className="text-base">{claim.status}</Badge>
            </div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{total.toLocaleString()} {claim.currency}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lines</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{lines.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Claim date</CardDescription>
            <CardTitle className="text-base">{claim.claim_date}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {claim.decision_note && (
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Decision note
            </div>
            <div>{claim.decision_note}</div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Line items</CardTitle>
            <CardDescription>Categorize each receipt for accurate reporting.</CardDescription>
          </div>
          {editable && (
            <Button size="sm" onClick={openLineAdd}>
              <Plus className="h-4 w-4" /> Add line
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No line items yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description / Vendor</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3 w-32" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">{l.expense_date}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{l.category_name ?? '—'}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div>{l.description || <span className="text-muted-foreground italic">No description</span>}</div>
                        {l.vendor && <div className="text-xs text-muted-foreground">{l.vendor}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {Number(l.amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {l.has_receipt && l.attachment_url ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void downloadReceipt(l.attachment_url as string)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        ) : editable ? (
                          <Button variant="ghost" size="sm" onClick={() => pickFile(l.id)}>
                            <Upload className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editable && (
                          <div className="flex items-center gap-1 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => openLineEdit(l)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void deleteLine(l)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/20 font-semibold">
                    <td className="px-4 py-3" colSpan={3}>
                      Total
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{total.toLocaleString()} {claim.currency}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line dialog */}
      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLine ? 'Edit line' : 'Add expense line'}</DialogTitle>
            <DialogDescription>
              {editingLine ? 'Update this expense line.' : 'You can upload a receipt after saving the line.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveLine} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  required
                  value={lineForm.category_id}
                  onChange={(e) => setLineForm({ ...lineForm, category_id: e.target.value })}
                >
                  <option value="">Select…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.requires_attachment ? '(receipt required)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  required
                  type="date"
                  value={lineForm.expense_date}
                  onChange={(e) => setLineForm({ ...lineForm, expense_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Amount (PKR)</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min={0}
                  value={lineForm.amount}
                  onChange={(e) => setLineForm({ ...lineForm, amount: +e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input
                  value={lineForm.vendor}
                  onChange={(e) => setLineForm({ ...lineForm, vendor: e.target.value })}
                  placeholder="e.g. Careem, PIA, Hotel Indigo"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={lineForm.description}
                  onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLineOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save line
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Decision dialog */}
      <Dialog open={decisionOpen} onOpenChange={setDecisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionAction === 'APPROVE' ? 'Approve claim' : 'Reject claim'}
            </DialogTitle>
            <DialogDescription>
              {decisionAction === 'APPROVE'
                ? 'The claim moves to APPROVED. You can then mark it reimbursed once paid.'
                : 'The claim moves to REJECTED. The employee can resubmit a corrected claim.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Note {decisionAction === 'REJECT' && <span className="text-destructive">(required)</span>}</Label>
            <Textarea
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void decide()}
              disabled={decisionAction === 'REJECT' && !decisionNote.trim()}
            >
              <Paperclip className="h-4 w-4" />
              {decisionAction === 'APPROVE' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

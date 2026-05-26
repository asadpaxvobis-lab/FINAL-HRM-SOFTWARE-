import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RefreshCw, Loader2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import {
  ACTIVE_PIPELINE_STAGES,
  CANDIDATE_SOURCES,
  STAGE_LABELS,
  type CandidateStage,
} from '@/lib/recruitment'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Candidate = {
  id: string
  candidate_no: string
  full_name: string
  email: string | null
  phone: string | null
  stage: CandidateStage
  source: string
  rating: number | null
  job_posting_id: string
  job_postings?: { job_no: string; title: string } | null
}

type Job = { id: string; job_no: string; title: string; status: string }

const emptyForm = {
  job_posting_id: '',
  full_name: '',
  email: '',
  phone: '',
  cnic: '',
  source: 'Direct',
  notes: '',
}

export function RecruitmentPipelinePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('recruitment.manage')
  const [rows, setRows] = useState<Candidate[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobFilter, setJobFilter] = useState(searchParams.get('job') ?? '')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function loadJobs() {
    const { data } = await supabase
      .from('job_postings')
      .select('id, job_no, title, status')
      .in('status', ['OPEN', 'ON_HOLD'])
      .order('title')
    setJobs((data ?? []) as Job[])
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('candidates')
      .select('id, candidate_no, full_name, email, phone, stage, source, rating, job_posting_id, job_postings(job_no, title)')
      .order('applied_at', { ascending: false })
      .limit(300)
    if (jobFilter) q = q.eq('job_posting_id', jobFilter)
    const { data, error } = await q
    if (error) toast.error('Failed to load pipeline', { description: error.message })
    else {
      setRows(
        (data ?? []).map((r: Record<string, unknown>) => ({
          ...(r as object),
          job_postings: Array.isArray(r.job_postings) ? (r.job_postings as unknown[])[0] : r.job_postings,
        })) as Candidate[]
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadJobs()
  }, [])

  useEffect(() => {
    void load()
  }, [jobFilter])

  const byStage = useMemo(() => {
    const map = new Map<CandidateStage, Candidate[]>()
    for (const s of ACTIVE_PIPELINE_STAGES) map.set(s, [])
    for (const r of rows) {
      if (ACTIVE_PIPELINE_STAGES.includes(r.stage)) map.get(r.stage)?.push(r)
    }
    return map
  }, [rows])

  const moveStage = async (c: Candidate, stage: CandidateStage) => {
    if (!canManage && !hasPermission('recruitment.interview')) return
    setBusy(true)
    const { error } = await supabase
      .from('candidates')
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq('id', c.id)
    setBusy(false)
    if (error) {
      toast.error('Move failed', { description: error.message })
      return
    }
    void load()
  }

  const submitCandidate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser || !canManage) return
    if (!form.job_posting_id || !form.full_name.trim()) {
      toast.error('Job and name are required')
      return
    }
    setBusy(true)
    const candidate_no = await nextCode({
      table: 'candidates',
      column: 'candidate_no',
      prefix: 'CAN-',
      width: 4,
      companyId: appUser.company_id,
    })
    const payload = {
      company_id: appUser.company_id,
      candidate_no,
      job_posting_id: form.job_posting_id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      cnic: form.cnic.trim() || null,
      source: form.source,
      notes: form.notes.trim() || null,
    }
    const { data, error } = await supabase.from('candidates').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Could not add candidate', { description: error.message })
      return
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'candidate', entityId: data?.id, after: payload })
    toast.success('Candidate added')
    setOpen(false)
    setForm(emptyForm)
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidate pipeline"
        description="Drag candidates through stages — click a card for interviews and hire."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruitment">Hub</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Add candidate
              </Button>
            )}
          </>
        }
      />

      <Select className="w-72" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
        <option value="">All open jobs</option>
        {jobs.map((j) => (
          <option key={j.id} value={j.id}>
            {j.job_no} — {j.title}
          </option>
        ))}
      </Select>

      {loading ? (
        <div className="p-16 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {ACTIVE_PIPELINE_STAGES.map((stage) => (
            <Card key={stage} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  {STAGE_LABELS[stage]}
                  <Badge variant="outline">{(byStage.get(stage) ?? []).length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-2 pt-0">
                {(byStage.get(stage) ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'rounded-lg border p-3 bg-card hover:border-primary/40 cursor-pointer transition-colors',
                      busy && 'opacity-60 pointer-events-none'
                    )}
                    onClick={() => navigate(`/recruitment/candidates/${c.id}`)}
                  >
                    <div className="font-medium text-sm">{c.full_name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.candidate_no}</div>
                    <div className="text-[11px] text-muted-foreground truncate mt-1">
                      {c.job_postings?.title ?? '—'}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                        {ACTIVE_PIPELINE_STAGES.filter((s) => s !== stage).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted"
                            onClick={() => void moveStage(c, s)}
                          >
                            → {STAGE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    )}
                    <ChevronRight className="h-3 w-3 text-muted-foreground ml-auto mt-1" />
                  </div>
                ))}
                {(byStage.get(stage) ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No candidates</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add candidate</DialogTitle>
            <DialogDescription>Link to an open job posting.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCandidate} className="space-y-4">
            <div className="space-y-2">
              <Label>Job posting *</Label>
              <Select required value={form.job_posting_id} onChange={(e) => setForm({ ...form, job_posting_id: e.target.value })}>
                <option value="">Select job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_no} — {j.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Full name *</Label>
              <Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                {CANDIDATE_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

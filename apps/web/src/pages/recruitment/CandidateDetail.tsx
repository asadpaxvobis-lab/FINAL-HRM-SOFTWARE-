import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plus, UserPlus, Calendar, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import {
  CANDIDATE_STAGES,
  INTERVIEW_TYPES,
  STAGE_LABELS,
  hireCandidate,
  type CandidateStage,
} from '@/lib/recruitment'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Interview = {
  id: string
  scheduled_at: string
  interview_type: string
  location: string | null
  interviewer_name: string | null
  status: string
  rating: number | null
  feedback: string | null
}

type Candidate = {
  id: string
  candidate_no: string
  full_name: string
  email: string | null
  phone: string | null
  cnic: string | null
  source: string
  stage: CandidateStage
  rating: number | null
  notes: string | null
  employee_id: string | null
  job_postings?: {
    job_no: string
    title: string
    branch_id: string | null
    department_id: string | null
    designation_id: string | null
  } | null
}

const today = () => new Date().toISOString().slice(0, 10)

export function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { appUser, hasPermission } = useAuth()
  const canInterview = hasPermission('recruitment.interview') || hasPermission('recruitment.manage')
  const canHire = hasPermission('recruitment.hire') || hasPermission('recruitment.manage')
  const [row, setRow] = useState<Candidate | null>(null)
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [intOpen, setIntOpen] = useState(false)
  const [hireOpen, setHireOpen] = useState(false)
  const [joiningDate, setJoiningDate] = useState(today())
  const [intForm, setIntForm] = useState({
    scheduled_at: '',
    interview_type: 'HR',
    location: '',
    interviewer_name: '',
  })

  async function load() {
    if (!id) return
    setLoading(true)
    const [{ data: cand, error }, { data: ints }] = await Promise.all([
      supabase
        .from('candidates')
        .select(
          `id, candidate_no, full_name, email, phone, cnic, source, stage, rating, notes, employee_id,
           job_postings(job_no, title, branch_id, department_id, designation_id)`
        )
        .eq('id', id)
        .single(),
      supabase
        .from('recruitment_interviews')
        .select('id, scheduled_at, interview_type, location, interviewer_name, status, rating, feedback')
        .eq('candidate_id', id)
        .order('scheduled_at', { ascending: false }),
    ])
    if (error) {
      toast.error('Not found')
      navigate('/recruitment/pipeline')
      return
    }
    const jobRaw = cand.job_postings
    const jobRel = Array.isArray(jobRaw) ? jobRaw[0] : jobRaw
    setRow({ ...(cand as Omit<Candidate, 'job_postings'>), job_postings: jobRel ?? null })
    setInterviews((ints ?? []) as Interview[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const updateStage = async (stage: CandidateStage) => {
    if (!row) return
    setBusy(true)
    const { error } = await supabase
      .from('candidates')
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq('id', row.id)
    setBusy(false)
    if (error) {
      toast.error('Update failed', { description: error.message })
      return
    }
    toast.success(`Moved to ${STAGE_LABELS[stage]}`)
    void load()
  }

  const scheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!row || !appUser || !intForm.scheduled_at) return
    setBusy(true)
    const payload = {
      candidate_id: row.id,
      scheduled_at: new Date(intForm.scheduled_at).toISOString(),
      interview_type: intForm.interview_type,
      location: intForm.location.trim() || null,
      interviewer_name: intForm.interviewer_name.trim() || null,
      created_by: appUser.id,
    }
    const { data, error } = await supabase.from('recruitment_interviews').insert(payload).select('id').single()
    setBusy(false)
    if (error) {
      toast.error('Schedule failed', { description: error.message })
      return
    }
    if (row.stage === 'APPLIED' || row.stage === 'SCREENING') {
      await supabase.from('candidates').update({ stage: 'INTERVIEW', stage_updated_at: new Date().toISOString() }).eq('id', row.id)
    }
    await writeAuditLog({ action: 'CREATE', entityType: 'recruitment_interview', entityId: data?.id, after: payload })
    toast.success('Interview scheduled')
    setIntOpen(false)
    void load()
  }

  const completeInterview = async (iv: Interview) => {
    setBusy(true)
    const { error } = await supabase
      .from('recruitment_interviews')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
      .eq('id', iv.id)
    setBusy(false)
    if (error) toast.error('Update failed', { description: error.message })
    else void load()
  }

  const onHire = async () => {
    if (!row || !appUser?.company_id) return
    setBusy(true)
    try {
      const { employeeId, employeeCode } = await hireCandidate(row.id, appUser.company_id, joiningDate)
      await writeAuditLog({
        action: 'CREATE',
        entityType: 'candidate_hire',
        entityId: row.id,
        after: { employee_id: employeeId, employee_code: employeeCode },
      })
      toast.success(`Hired as ${employeeCode}`)
      setHireOpen(false)
      navigate(`/employees/${employeeId}`)
    } catch (err) {
      toast.error('Hire failed', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  if (loading || !row) {
    return (
      <div className="p-16 grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  const job = row.job_postings
  const canHireNow =
    canHire &&
    row.stage !== 'HIRED' &&
    !row.employee_id &&
    job?.branch_id &&
    job?.department_id &&
    job?.designation_id

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.full_name}
        description={`${row.candidate_no} · ${job?.title ?? '—'}`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruitment/pipeline">
                <ArrowLeft className="h-4 w-4" /> Pipeline
              </Link>
            </Button>
            {canHireNow && (
              <Button size="sm" onClick={() => setHireOpen(true)}>
                <UserPlus className="h-4 w-4" /> Hire as employee
              </Button>
            )}
            {row.employee_id && (
              <Button size="sm" variant="outline" asChild>
                <Link to={`/employees/${row.employee_id}`}>View employee</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap gap-2 items-center">
        <Badge>{STAGE_LABELS[row.stage]}</Badge>
        <span className="text-sm text-muted-foreground">Source: {row.source}</span>
        {CANDIDATE_STAGES.filter((s) => s !== row.stage && s !== 'HIRED').map((s) => (
          <Button key={s} size="sm" variant="ghost" disabled={busy || row.stage === 'HIRED'} onClick={() => void updateStage(s)}>
            → {STAGE_LABELS[s]}
          </Button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div>{row.email ?? '—'}</div>
            <div>{row.phone ?? '—'}</div>
            <div>{row.cnic ?? '—'}</div>
            {row.notes && <p className="text-muted-foreground pt-2 border-t">{row.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Interviews</CardTitle>
              <CardDescription>{interviews.length} scheduled</CardDescription>
            </div>
            {canInterview && row.stage !== 'HIRED' && (
              <Button size="sm" variant="outline" onClick={() => setIntOpen(true)}>
                <Plus className="h-4 w-4" /> Schedule
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {interviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No interviews yet.</p>
            ) : (
              interviews.map((iv) => (
                <div key={iv.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{iv.interview_type}</span>
                    <Badge variant="outline">{iv.status}</Badge>
                  </div>
                  <div className="text-muted-foreground text-xs mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(iv.scheduled_at).toLocaleString('en-PK')}
                  </div>
                  {iv.interviewer_name && <div className="text-xs mt-1">With: {iv.interviewer_name}</div>}
                  {iv.status === 'SCHEDULED' && canInterview && (
                    <Button size="sm" variant="ghost" className="mt-2 h-7" onClick={() => void completeInterview(iv)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark completed
                    </Button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={intOpen} onOpenChange={setIntOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule interview</DialogTitle>
          </DialogHeader>
          <form onSubmit={scheduleInterview} className="space-y-4">
            <div className="space-y-2">
              <Label>Date & time *</Label>
              <Input
                type="datetime-local"
                required
                value={intForm.scheduled_at}
                onChange={(e) => setIntForm({ ...intForm, scheduled_at: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={intForm.interview_type} onChange={(e) => setIntForm({ ...intForm, interview_type: e.target.value })}>
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Interviewer</Label>
              <Input value={intForm.interviewer_name} onChange={(e) => setIntForm({ ...intForm, interviewer_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={intForm.location} onChange={(e) => setIntForm({ ...intForm, location: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIntOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={hireOpen} onOpenChange={setHireOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hire {row.full_name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Creates an employee record using the job&apos;s branch, department, and designation ({job?.job_no}).
          </p>
          <div className="space-y-2">
            <Label>Joining date *</Label>
            <Input type="date" required value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHireOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void onHire()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm hire'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

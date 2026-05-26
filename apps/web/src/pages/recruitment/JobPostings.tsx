import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Loader2, Pencil, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { EMPLOYMENT_TYPES, JOB_STATUSES, pkr } from '@/lib/recruitment'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
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

type Job = {
  id: string
  job_no: string
  title: string
  status: string
  openings: number
  hired_count: number
  employment_type: string
  salary_min: number | null
  salary_max: number | null
  posted_at: string | null
  closes_at: string | null
  branch_id: string | null
  department_id: string | null
  designation_id: string | null
  description: string | null
  requirements: string | null
  notes: string | null
  branches?: { name: string } | null
  departments?: { name: string } | null
  designations?: { title: string } | null
}

type Lookup = { id: string; name?: string; title?: string }

const emptyForm = {
  title: '',
  branch_id: '',
  department_id: '',
  designation_id: '',
  description: '',
  requirements: '',
  openings: 1,
  salary_min: '',
  salary_max: '',
  employment_type: 'Full-time',
  status: 'DRAFT',
  posted_at: '',
  closes_at: '',
  notes: '',
}

const statusVariant = (s: string) => {
  if (s === 'OPEN') return 'warm' as const
  if (s === 'DRAFT') return 'outline' as const
  if (s === 'CLOSED') return 'secondary' as const
  return 'outline' as const
}

export function JobPostingsPage() {
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('recruitment.manage')
  const [rows, setRows] = useState<Job[]>([])
  const [branches, setBranches] = useState<Lookup[]>([])
  const [departments, setDepartments] = useState<Lookup[]>([])
  const [designations, setDesignations] = useState<Lookup[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Job | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  async function loadLookups() {
    const [b, d, des] = await Promise.all([
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
      supabase.from('designations').select('id, title').eq('is_active', true).order('title'),
    ])
    setBranches((b.data ?? []).map((x) => ({ id: x.id, name: x.name })))
    setDepartments((d.data ?? []).map((x) => ({ id: x.id, name: x.name })))
    setDesignations((des.data ?? []).map((x) => ({ id: x.id, title: x.title })))
  }

  async function load() {
    setLoading(true)
    let q = supabase
      .from('job_postings')
      .select(
        'id, job_no, title, status, openings, hired_count, employment_type, salary_min, salary_max, posted_at, closes_at, branch_id, department_id, designation_id, description, requirements, notes, branches(name), departments(name), designations(title)'
      )
      .order('created_at', { ascending: false })
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data, error } = await q
    if (error) toast.error('Failed to load jobs', { description: error.message })
    else {
      setRows(
        (data ?? []).map((r: Record<string, unknown>) => {
          const rel = (k: string) => {
            const v = r[k]
            return (Array.isArray(v) ? v[0] : v) as { name?: string; title?: string } | null
          }
          return { ...(r as object), branches: rel('branches'), departments: rel('departments'), designations: rel('designations') } as Job
        })
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadLookups()
    void load()
  }, [statusFilter])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (j: Job) => {
    setEditing(j)
    setForm({
      title: j.title,
      branch_id: j.branch_id ?? '',
      department_id: j.department_id ?? '',
      designation_id: j.designation_id ?? '',
      description: j.description ?? '',
      requirements: j.requirements ?? '',
      openings: j.openings,
      salary_min: j.salary_min != null ? String(j.salary_min) : '',
      salary_max: j.salary_max != null ? String(j.salary_max) : '',
      employment_type: j.employment_type,
      status: j.status,
      posted_at: j.posted_at ?? '',
      closes_at: j.closes_at ?? '',
      notes: j.notes ?? '',
    })
    setOpen(true)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser || !canManage) return
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!form.branch_id || !form.department_id || !form.designation_id) {
      toast.error('Branch, department, and designation are required')
      return
    }
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      title: form.title.trim(),
      branch_id: form.branch_id,
      department_id: form.department_id,
      designation_id: form.designation_id,
      description: form.description.trim() || null,
      requirements: form.requirements.trim() || null,
      openings: Number(form.openings) || 1,
      salary_min: form.salary_min ? Number(form.salary_min) : null,
      salary_max: form.salary_max ? Number(form.salary_max) : null,
      employment_type: form.employment_type,
      status: form.status,
      posted_at: form.posted_at || null,
      closes_at: form.closes_at || null,
      notes: form.notes.trim() || null,
      ...(form.status === 'OPEN' && !form.posted_at ? { posted_at: new Date().toISOString().slice(0, 10) } : {}),
    }

    if (editing) {
      const { error } = await supabase.from('job_postings').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'job_posting', entityId: editing.id, after: payload })
      toast.success('Job updated')
    } else {
      const job_no = await nextCode({
        table: 'job_postings',
        column: 'job_no',
        prefix: 'JOB-',
        width: 4,
        companyId: appUser.company_id,
      })
      const { data, error } = await supabase
        .from('job_postings')
        .insert({ ...payload, job_no, created_by: appUser.id })
        .select('id')
        .single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'job_posting', entityId: data?.id, after: payload })
      toast.success('Job created')
    }
    setOpen(false)
    void load()
  }

  const openCount = useMemo(() => rows.filter((r) => r.status === 'OPEN').length, [rows])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job postings"
        description={`${openCount} open · Define roles before adding candidates.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/recruitment">Recruitment hub</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> New job
              </Button>
            )}
          </>
        }
      />

      <Select className="w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All statuses</option>
        {JOB_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace('_', ' ')}
          </option>
        ))}
      </Select>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No job postings yet.</div>
          ) : (
            <div className="divide-y">
              {rows.map((j) => (
                <div key={j.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{j.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {j.job_no} · {j.departments?.name ?? '—'} · {j.designations?.title ?? '—'} · {j.branches?.name ?? '—'}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {j.hired_count}/{j.openings} filled · {pkr(j.salary_min)}
                      {j.salary_max ? ` – ${pkr(j.salary_max)}` : ''}
                    </div>
                  </div>
                  <Badge variant={statusVariant(j.status)}>{j.status}</Badge>
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/recruitment/pipeline?job=${j.id}`}>Pipeline</Link>
                  </Button>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => openEdit(j)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground opacity-50" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit job posting' : 'New job posting'}</DialogTitle>
            <DialogDescription>Branch, department, and designation are required for hire-to-employee.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Job title *</Label>
                <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Branch *</Label>
                <Select required value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                  <option value="">Select…</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select required value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Designation *</Label>
                <Select required value={form.designation_id} onChange={(e) => setForm({ ...form, designation_id: e.target.value })}>
                  <option value="">Select…</option>
                  {designations.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Employment type</Label>
                <Select value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {JOB_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Openings</Label>
                <Input type="number" min={1} value={form.openings} onChange={(e) => setForm({ ...form, openings: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Salary min (PKR)</Label>
                <Input type="number" min={0} value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Salary max (PKR)</Label>
                <Input type="number" min={0} value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Posted date</Label>
                <Input type="date" value={form.posted_at} onChange={(e) => setForm({ ...form, posted_at: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Closes date</Label>
                <Input type="date" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Requirements</Label>
                <Textarea rows={3} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

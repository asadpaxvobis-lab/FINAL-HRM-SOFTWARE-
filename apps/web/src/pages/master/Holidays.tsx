import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, CalendarHeart, Building2, Download, Upload } from 'lucide-react'
import { toCsv, downloadCsv, parseCsv } from '@/lib/csv'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type Holiday = {
  id: string
  name: string
  holiday_date: string
  holiday_type: string
  description: string | null
  branch_id: string | null
  is_paid: boolean
  is_active: boolean
  branches?: { name: string } | null
}

type Branch = { id: string; name: string }

const HOLIDAY_TYPES = ['Public', 'Religious', 'Company'] as const

export function HolidaysPage() {
  const { appUser, hasPermission } = useAuth()
  const canCreate = hasPermission('holiday.create')
  const canUpdate = hasPermission('holiday.update')
  const [rows, setRows] = useState<Holiday[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [form, setForm] = useState({
    name: '',
    holiday_date: '',
    holiday_type: 'Public' as string,
    description: '',
    branch_id: '',
    is_paid: true,
    is_active: true,
  })
  const [busy, setBusy] = useState(false)
  const [exclOpen, setExclOpen] = useState(false)
  const [exclHoliday, setExclHoliday] = useState<Holiday | null>(null)
  const [exclSet, setExclSet] = useState<Set<string>>(new Set())
  const [exclSaving, setExclSaving] = useState(false)
  const [exclCounts, setExclCounts] = useState<Record<string, number>>({})
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    const start = `${year}-01-01`
    const end = `${year}-12-31`
    const [h, b] = await Promise.all([
      supabase
        .from('holidays')
        .select('id, name, holiday_date, holiday_type, description, branch_id, is_paid, is_active, branches(name)')
        .gte('holiday_date', start)
        .lte('holiday_date', end)
        .order('holiday_date'),
      supabase.from('branches').select('id, name').eq('is_active', true).order('name'),
    ])
    if (h.error) toast.error('Failed to load holidays', { description: h.error.message })
    else {
      const mapped = (h.data ?? []).map((row: Record<string, unknown>) => {
        const br = row.branches
        const branch = Array.isArray(br) ? br[0] : br
        return { ...row, branches: branch } as Holiday
      })
      setRows(mapped)
      const ids = mapped.filter((h) => !h.branch_id).map((h) => h.id)
      if (ids.length) {
        const { data: ex } = await supabase
          .from('branch_holiday_exclusions')
          .select('holiday_id')
          .in('holiday_id', ids)
        const counts: Record<string, number> = {}
        for (const r of ex ?? []) {
          counts[(r as { holiday_id: string }).holiday_id] = (counts[(r as { holiday_id: string }).holiday_id] ?? 0) + 1
        }
        setExclCounts(counts)
      } else {
        setExclCounts({})
      }
    }
    setBranches((b.data ?? []) as Branch[])
    setLoading(false)
  }

  const openExclusions = async (h: Holiday) => {
    setExclHoliday(h)
    setExclSet(new Set())
    setExclOpen(true)
    const { data, error } = await supabase
      .from('branch_holiday_exclusions')
      .select('branch_id')
      .eq('holiday_id', h.id)
    if (error) {
      toast.error('Could not load exclusions', { description: error.message })
      return
    }
    setExclSet(new Set((data ?? []).map((r: { branch_id: string }) => r.branch_id)))
  }

  const toggleExcl = (branchId: string) => {
    setExclSet((prev) => {
      const next = new Set(prev)
      if (next.has(branchId)) next.delete(branchId)
      else next.add(branchId)
      return next
    })
  }

  const saveExclusions = async () => {
    if (!exclHoliday) return
    setExclSaving(true)
    const { error: delErr } = await supabase
      .from('branch_holiday_exclusions')
      .delete()
      .eq('holiday_id', exclHoliday.id)
    if (delErr) {
      setExclSaving(false)
      toast.error('Could not save exclusions', { description: delErr.message })
      return
    }
    if (exclSet.size > 0) {
      const rows = Array.from(exclSet).map((branch_id) => ({ holiday_id: exclHoliday.id, branch_id }))
      const { error: insErr } = await supabase.from('branch_holiday_exclusions').insert(rows)
      if (insErr) {
        setExclSaving(false)
        toast.error('Could not save exclusions', { description: insErr.message })
        return
      }
    }
    await writeAuditLog({
      action: 'UPDATE',
      entityType: 'branch_holiday_exclusions',
      entityId: exclHoliday.id,
      after: { excluded_branches: Array.from(exclSet) },
    })
    setExclCounts((c) => ({ ...c, [exclHoliday.id]: exclSet.size }))
    setExclSaving(false)
    setExclOpen(false)
    toast.success(`${exclSet.size} branch(es) excluded`)
  }

  useEffect(() => {
    void load()
  }, [year])

  const grouped = useMemo(() => {
    const map = new Map<string, Holiday[]>()
    for (const h of rows) {
      const m = h.holiday_date.slice(0, 7)
      if (!map.has(m)) map.set(m, [])
      map.get(m)!.push(h)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [rows])

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: '',
      holiday_date: '',
      holiday_type: 'Public',
      description: '',
      branch_id: '',
      is_paid: true,
      is_active: true,
    })
    setOpen(true)
  }

  const openEdit = (h: Holiday) => {
    setEditing(h)
    setForm({
      name: h.name,
      holiday_date: h.holiday_date,
      holiday_type: h.holiday_type,
      description: h.description ?? '',
      branch_id: h.branch_id ?? '',
      is_paid: h.is_paid,
      is_active: h.is_active,
    })
    setOpen(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      name: form.name.trim(),
      holiday_date: form.holiday_date,
      holiday_type: form.holiday_type,
      description: form.description.trim() || null,
      branch_id: form.branch_id || null,
      is_paid: form.is_paid,
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('holidays').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'holiday', entityId: editing.id })
      toast.success('Holiday updated')
    } else {
      const { data, error } = await supabase.from('holidays').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'holiday', entityId: data?.id })
      toast.success('Holiday added')
    }
    setOpen(false)
    void load()
  }

  const exportCsv = () => {
    const data = rows.map((h) => ({
      name: h.name,
      holiday_date: h.holiday_date,
      holiday_type: h.holiday_type,
      description: h.description ?? '',
      branch_name: (h.branches as { name?: string })?.name ?? '',
      is_paid: h.is_paid ? 'Yes' : 'No',
      is_active: h.is_active ? 'Yes' : 'No',
    }))
    const csv = toCsv(data, ['name', 'holiday_date', 'holiday_type', 'description', 'branch_name', 'is_paid', 'is_active'])
    downloadCsv(`holidays-${year}.csv`, csv)
    toast.success('Exported', { description: `${data.length} holidays` })
  }

  const downloadTemplate = () => {
    const sample = [
      {
        name: 'Sample Public Holiday',
        holiday_date: `${year}-01-01`,
        holiday_type: 'Public',
        description: 'Example',
        branch_name: '',
        is_paid: 'Yes',
        is_active: 'Yes',
      },
    ]
    const csv = toCsv(sample, ['name', 'holiday_date', 'holiday_type', 'description', 'branch_name', 'is_paid', 'is_active'])
    downloadCsv(`holidays-template.csv`, csv)
  }

  const importCsv = async (file: File) => {
    if (!appUser) return
    setImporting(true)
    try {
      const text = await file.text()
      const records = parseCsv(text)
      if (records.length === 0) {
        toast.error('Empty file')
        return
      }
      const branchByName = new Map(branches.map((b) => [b.name.toLowerCase(), b.id]))
      const valid: Record<string, unknown>[] = []
      const errors: string[] = []
      records.forEach((r, idx) => {
        const name = (r.name ?? '').trim()
        const holiday_date = (r.holiday_date ?? '').trim()
        if (!name || !holiday_date) {
          errors.push(`Row ${idx + 2}: missing name or date`)
          return
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
          errors.push(`Row ${idx + 2}: date must be YYYY-MM-DD`)
          return
        }
        const branchName = (r.branch_name ?? '').trim().toLowerCase()
        let branch_id: string | null = null
        if (branchName) {
          const found = branchByName.get(branchName)
          if (!found) {
            errors.push(`Row ${idx + 2}: branch "${r.branch_name}" not found`)
            return
          }
          branch_id = found
        }
        const yes = (v: string) => /^(yes|true|1|y)$/i.test(v.trim())
        valid.push({
          company_id: appUser.company_id,
          name,
          holiday_date,
          holiday_type: r.holiday_type?.trim() || 'Public',
          description: r.description?.trim() || null,
          branch_id,
          is_paid: r.is_paid ? yes(r.is_paid) : true,
          is_active: r.is_active ? yes(r.is_active) : true,
        })
      })
      if (errors.length && valid.length === 0) {
        toast.error('Import failed', { description: errors.slice(0, 3).join(' • ') })
        return
      }
      const { error } = await supabase
        .from('holidays')
        .upsert(valid, { onConflict: 'company_id,holiday_date,name' })
      if (error) {
        toast.error('Import failed', { description: error.message })
        return
      }
      await writeAuditLog({
        action: 'CREATE',
        entityType: 'holidays_import',
        after: { count: valid.length, errors: errors.length },
      })
      toast.success(`Imported ${valid.length} holidays`, {
        description: errors.length ? `${errors.length} row(s) skipped` : undefined,
      })
      void load()
    } catch (err) {
      toast.error('Could not read file', { description: (err as Error).message })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const typeBadge = (t: string) => {
    if (t === 'Religious') return 'warm' as const
    if (t === 'Company') return 'secondary' as const
    return 'outline' as const
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description="Company-wide and branch-specific holidays. Pakistan calendar is pre-seeded — update Islamic dates each year."
        actions={
          <>
            <Select className="w-28" value={year} onChange={(e) => setYear(e.target.value)}>
              {[2025, 2026, 2027, 2028].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <HasPermission perm="holiday.create">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                Template
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importCsv(f)
                }}
              />
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add holiday
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{year} calendar</CardTitle>
          <CardDescription>{rows.length} holidays</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarHeart className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No holidays for {year} yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <div className="px-6 py-2 bg-muted/30 text-xs font-semibold uppercase text-muted-foreground">
                    {new Date(month + '-01').toLocaleString('en-PK', { month: 'long', year: 'numeric' })}
                  </div>
                  {items.map((h) => (
                    <div key={h.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/20">
                      <div className="w-28 text-sm font-mono tabular-nums">{h.holiday_date}</div>
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-medium">{h.name}</div>
                        {h.description && <div className="text-xs text-muted-foreground">{h.description}</div>}
                      </div>
                      <Badge variant={typeBadge(h.holiday_type)}>{h.holiday_type}</Badge>
                      {h.branch_id ? (
                        <Badge variant="secondary">Branch: {(h.branches as { name?: string })?.name ?? '—'}</Badge>
                      ) : (
                        <Badge variant="outline">All branches</Badge>
                      )}
                      {!h.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {!h.branch_id && exclCounts[h.id] > 0 && (
                        <Badge variant="warm">{exclCounts[h.id]} excluded</Badge>
                      )}
                      <div className="flex items-center gap-1">
                        {!h.branch_id && canUpdate && (
                          <Button variant="ghost" size="sm" title="Branch exclusions" onClick={() => void openExclusions(h)}>
                            <Building2 className="h-4 w-4" />
                          </Button>
                        )}
                        {canUpdate && (
                          <Button variant="ghost" size="sm" onClick={() => openEdit(h)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit holiday' : 'Add holiday'}</DialogTitle>
            <DialogDescription>Leave branch empty to apply company-wide.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.holiday_type} onChange={(e) => setForm({ ...form, holiday_type: e.target.value })}>
                  {HOLIDAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Branch (optional)</Label>
              <Select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_paid} onCheckedChange={(v) => setForm({ ...form, is_paid: !!v })} />
              Paid holiday
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
              Active
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={exclOpen} onOpenChange={setExclOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Branch exclusions</DialogTitle>
            <DialogDescription>
              {exclHoliday?.name} on {exclHoliday?.holiday_date}. Tick branches where this holiday does <strong>not</strong> apply.
            </DialogDescription>
          </DialogHeader>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No branches defined yet.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                  <Checkbox checked={exclSet.has(b.id)} onCheckedChange={() => toggleExcl(b.id)} />
                  <span className="text-sm">{b.name}</span>
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExclOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveExclusions} disabled={exclSaving}>
              {exclSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save exclusions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

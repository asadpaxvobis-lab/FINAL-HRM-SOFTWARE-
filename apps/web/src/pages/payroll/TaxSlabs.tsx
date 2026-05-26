import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, Trash2, BarChart3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fmtPKR } from '@/lib/payroll'
import { toast } from 'sonner'

type Slab = {
  id: string
  fy_label: string
  applies_to: 'SALARIED' | 'AOP' | 'NON_SALARIED'
  slab_from: number
  slab_to: number | null
  base_tax: number
  rate_pct: number
  sort_order: number
}

const emptyForm = {
  fy_label: '2025-26',
  applies_to: 'SALARIED' as Slab['applies_to'],
  slab_from: 0,
  slab_to: '' as number | '',
  base_tax: 0,
  rate_pct: 0,
  sort_order: 100,
}

export function TaxSlabsPage() {
  const { appUser, hasPermission } = useAuth()
  const canConfig = hasPermission('payroll.config')
  const [rows, setRows] = useState<Slab[]>([])
  const [loading, setLoading] = useState(true)
  const [fy, setFy] = useState('2025-26')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Slab | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tax_slabs')
      .select('*')
      .order('fy_label', { ascending: false })
      .order('applies_to')
      .order('slab_from')
    if (error) toast.error('Failed to load tax slabs', { description: error.message })
    else setRows((data ?? []) as Slab[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const years = Array.from(new Set(rows.map((r) => r.fy_label))).sort().reverse()
  const filtered = rows.filter((r) => r.fy_label === fy && r.applies_to === 'SALARIED')

  useEffect(() => {
    if (years.length > 0 && !years.includes(fy)) setFy(years[0])
  }, [years, fy])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, fy_label: fy, sort_order: (filtered.length + 1) * 10 })
    setOpen(true)
  }

  const openEdit = (s: Slab) => {
    setEditing(s)
    setForm({
      fy_label: s.fy_label,
      applies_to: s.applies_to,
      slab_from: Number(s.slab_from),
      slab_to: s.slab_to === null ? '' : Number(s.slab_to),
      base_tax: Number(s.base_tax),
      rate_pct: Number(s.rate_pct),
      sort_order: s.sort_order,
    })
    setOpen(true)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!appUser) return
    setBusy(true)
    const payload = {
      company_id: appUser.company_id,
      fy_label: form.fy_label.trim(),
      applies_to: form.applies_to,
      slab_from: Number(form.slab_from),
      slab_to: form.slab_to === '' ? null : Number(form.slab_to),
      base_tax: Number(form.base_tax),
      rate_pct: Number(form.rate_pct),
      sort_order: Number(form.sort_order),
    }
    if (editing) {
      const { error } = await supabase.from('tax_slabs').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'tax_slab', entityId: editing.id, after: payload })
      toast.success('Slab updated')
    } else {
      const { data, error } = await supabase.from('tax_slabs').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'tax_slab', entityId: data?.id, after: payload })
      toast.success('Slab added')
    }
    setOpen(false)
    void load()
  }

  const onDelete = async (s: Slab) => {
    if (!window.confirm('Delete this slab?')) return
    const { error } = await supabase.from('tax_slabs').delete().eq('id', s.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Slab deleted')
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income tax slabs"
        description="Pakistan FBR salaried income-tax slabs. Used by the payroll engine to compute monthly PAYE."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="payroll.config">
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add slab
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Salaried slabs — {fy}</CardTitle>
            <CardDescription>Annual taxable income (PKR)</CardDescription>
          </div>
          {years.length > 0 && (
            <Select value={fy} onChange={(e) => setFy(e.target.value)} className="w-40">
              {years.map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </Select>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No slabs defined for FY {fy}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">From</th>
                    <th className="px-4 py-3">To</th>
                    <th className="px-4 py-3 text-right">Base tax</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 tabular-nums">{fmtPKR(Number(s.slab_from))}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {s.slab_to === null ? <span className="text-muted-foreground">and above</span> : fmtPKR(Number(s.slab_to))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtPKR(Number(s.base_tax))}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(s.rate_pct)}%</td>
                      <td className="px-4 py-3 text-right">
                        {canConfig && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void onDelete(s)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit slab' : 'Add slab'}</DialogTitle>
            <DialogDescription>
              Annual taxable income amounts in PKR. Leave "To" empty for the topmost slab.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Financial year</Label>
                <Input
                  required
                  value={form.fy_label}
                  onChange={(e) => setForm({ ...form, fy_label: e.target.value })}
                  placeholder="2025-26"
                />
              </div>
              <div className="space-y-2">
                <Label>Applies to</Label>
                <Select
                  value={form.applies_to}
                  onChange={(e) => setForm({ ...form, applies_to: e.target.value as Slab['applies_to'] })}
                >
                  <option value="SALARIED">Salaried</option>
                  <option value="AOP">AOP</option>
                  <option value="NON_SALARIED">Non-salaried</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Slab from (PKR/yr)</Label>
                <Input
                  required
                  type="number"
                  value={form.slab_from}
                  onChange={(e) => setForm({ ...form, slab_from: +e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Slab to (PKR/yr — empty for topmost)</Label>
                <Input
                  type="number"
                  value={form.slab_to === '' ? '' : form.slab_to}
                  onChange={(e) =>
                    setForm({ ...form, slab_to: e.target.value === '' ? '' : +e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Base tax (PKR/yr)</Label>
                <Input
                  type="number"
                  value={form.base_tax}
                  onChange={(e) => setForm({ ...form, base_tax: +e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Rate on excess (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.rate_pct}
                  onChange={(e) => setForm({ ...form, rate_pct: +e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: +e.target.value })}
                />
              </div>
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

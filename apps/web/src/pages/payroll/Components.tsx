import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, Coins, Lock } from 'lucide-react'
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

type Component = {
  id: string
  code: string
  name: string
  component_type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIB'
  calc_method: 'FIXED' | 'PCT_BASIC' | 'PCT_GROSS' | 'FORMULA'
  calc_value: number
  formula: string | null
  is_taxable: boolean
  is_eobi_applicable: boolean
  is_pf_applicable: boolean
  is_system: boolean
  is_active: boolean
  sort_order: number
}

const emptyForm = {
  code: '',
  name: '',
  component_type: 'EARNING' as Component['component_type'],
  calc_method: 'FIXED' as Component['calc_method'],
  calc_value: 0,
  formula: '',
  is_taxable: false,
  is_eobi_applicable: false,
  is_pf_applicable: false,
  is_active: true,
  sort_order: 100,
}

const typeLabel: Record<Component['component_type'], string> = {
  EARNING: 'Earning',
  DEDUCTION: 'Deduction',
  EMPLOYER_CONTRIB: 'Employer contribution',
}

const methodLabel: Record<Component['calc_method'], string> = {
  FIXED: 'Fixed amount',
  PCT_BASIC: '% of basic',
  PCT_GROSS: '% of gross',
  FORMULA: 'Formula',
}

export function PayrollComponentsPage() {
  const { appUser, hasPermission } = useAuth()
  const canConfig = hasPermission('payroll.config')
  const [rows, setRows] = useState<Component[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Component | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'ALL' | Component['component_type']>('ALL')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payroll_components')
      .select('*')
      .order('component_type')
      .order('sort_order')
    if (error) toast.error('Failed to load components', { description: error.message })
    else setRows((data ?? []) as Component[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = async () => {
    setEditing(null)
    const code = await nextCode({
      table: 'payroll_components',
      column: 'code',
      prefix: 'PC-',
      width: 3,
      companyId: appUser?.company_id,
    })
    setForm({ ...emptyForm, code })
    setOpen(true)
  }

  const openEdit = (c: Component) => {
    setEditing(c)
    setForm({
      code: c.code,
      name: c.name,
      component_type: c.component_type,
      calc_method: c.calc_method,
      calc_value: Number(c.calc_value),
      formula: c.formula ?? '',
      is_taxable: c.is_taxable,
      is_eobi_applicable: c.is_eobi_applicable,
      is_pf_applicable: c.is_pf_applicable,
      is_active: c.is_active,
      sort_order: c.sort_order,
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
      component_type: form.component_type,
      calc_method: form.calc_method,
      calc_value: Number(form.calc_value),
      formula: form.formula.trim() || null,
      is_taxable: form.is_taxable,
      is_eobi_applicable: form.is_eobi_applicable,
      is_pf_applicable: form.is_pf_applicable,
      is_active: form.is_active,
      sort_order: Number(form.sort_order),
    }
    if (editing) {
      const { error } = await supabase
        .from('payroll_components')
        .update(payload)
        .eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'payroll_component', entityId: editing.id, after: payload })
      toast.success('Component updated')
    } else {
      const { data, error } = await supabase
        .from('payroll_components')
        .insert(payload)
        .select('id')
        .single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'payroll_component', entityId: data?.id, after: payload })
      toast.success('Component added')
    }
    setOpen(false)
    void load()
  }

  const filtered = rows.filter((r) => (filter === 'ALL' ? true : r.component_type === filter))

  const counts = {
    earnings: rows.filter((r) => r.component_type === 'EARNING').length,
    deductions: rows.filter((r) => r.component_type === 'DEDUCTION').length,
    employer: rows.filter((r) => r.component_type === 'EMPLOYER_CONTRIB').length,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll components"
        description="Define earnings, deductions, and employer contributions used in payslip calculation."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="payroll.config">
              <Button size="sm" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" /> Add component
              </Button>
            </HasPermission>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Earnings</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.earnings}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Deductions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.deductions}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employer contributions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.employer}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">All components</CardTitle>
            <CardDescription>{filtered.length} shown</CardDescription>
          </div>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-48">
            <option value="ALL">All types</option>
            <option value="EARNING">Earnings only</option>
            <option value="DEDUCTION">Deductions only</option>
            <option value="EMPLOYER_CONTRIB">Employer contrib. only</option>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Coins className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No components.
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.is_system && (
                        <span className="text-muted-foreground" title="System component (protected)">
                          <Lock className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{c.code}</div>
                  </div>
                  <Badge variant={c.component_type === 'EARNING' ? 'success' : c.component_type === 'DEDUCTION' ? 'destructive' : 'outline'}>
                    {typeLabel[c.component_type]}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {methodLabel[c.calc_method]}
                    {(c.calc_method === 'PCT_BASIC' || c.calc_method === 'PCT_GROSS') && ` · ${c.calc_value}%`}
                    {c.calc_method === 'FIXED' && c.calc_value > 0 && ` · ${c.calc_value}`}
                  </div>
                  {c.is_taxable && <Badge variant="outline">Taxable</Badge>}
                  {c.is_eobi_applicable && <Badge variant="outline">EOBI</Badge>}
                  {c.is_pf_applicable && <Badge variant="outline">PF</Badge>}
                  {!c.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canConfig && (
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit component' : 'Add component'}</DialogTitle>
            <DialogDescription>
              Earnings build the gross. Deductions reduce net pay. Employer contributions only affect total cost.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} readOnly disabled className="font-mono" />
                <p className="text-xs text-muted-foreground">
                  {editing ? 'Codes are immutable.' : 'Auto-generated.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.component_type}
                  onChange={(e) => setForm({ ...form, component_type: e.target.value as Component['component_type'] })}
                >
                  <option value="EARNING">Earning</option>
                  <option value="DEDUCTION">Deduction</option>
                  <option value="EMPLOYER_CONTRIB">Employer contribution</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Calculation method</Label>
                <Select
                  value={form.calc_method}
                  onChange={(e) => setForm({ ...form, calc_method: e.target.value as Component['calc_method'] })}
                >
                  <option value="FIXED">Fixed amount</option>
                  <option value="PCT_BASIC">% of basic</option>
                  <option value="PCT_GROSS">% of gross</option>
                  <option value="FORMULA">Formula (engine-driven)</option>
                </Select>
              </div>
              {form.calc_method !== 'FORMULA' && (
                <div className="space-y-2">
                  <Label>
                    {form.calc_method === 'FIXED' ? 'Amount (PKR)' : 'Percent (%)'}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.calc_value}
                    onChange={(e) => setForm({ ...form, calc_value: +e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: +e.target.value })}
                />
              </div>
              {form.calc_method === 'FORMULA' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Formula notes</Label>
                  <Input
                    value={form.formula}
                    onChange={(e) => setForm({ ...form, formula: e.target.value })}
                    placeholder="Slab-based, EOBI table, etc."
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-4 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_taxable} onCheckedChange={(v) => setForm({ ...form, is_taxable: !!v })} />
                Taxable income
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_eobi_applicable}
                  onCheckedChange={(v) => setForm({ ...form, is_eobi_applicable: !!v })}
                />
                EOBI-applicable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.is_pf_applicable}
                  onCheckedChange={(v) => setForm({ ...form, is_pf_applicable: !!v })}
                />
                PF-applicable
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
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

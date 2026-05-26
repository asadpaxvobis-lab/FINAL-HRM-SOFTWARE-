import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, Wallet, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { nextCode } from '@/lib/codegen'
import { PageHeader } from '@/components/master/PageHeader'
import { HasPermission } from '@/components/HasPermission'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

type LoanType = {
  id: string
  code: string
  name: string
  description: string | null
  max_amount: number | null
  max_installments: number | null
  interest_rate_pct: number
  requires_collateral: boolean
  is_active: boolean
}

const emptyForm = {
  code: '',
  name: '',
  description: '',
  max_amount: '' as number | '',
  max_installments: '' as number | '',
  interest_rate_pct: 0,
  requires_collateral: false,
  is_active: true,
}

export function LoanTypesPage() {
  const { appUser, hasPermission } = useAuth()
  const canManage = hasPermission('loan.approve')
  const [rows, setRows] = useState<LoanType[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LoanType | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('loan_types').select('*').order('name')
    if (error) toast.error('Failed to load loan types', { description: error.message })
    else setRows((data ?? []) as LoanType[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = async () => {
    setEditing(null)
    const code = await nextCode({
      table: 'loan_types',
      column: 'code',
      prefix: 'LT-',
      width: 3,
      companyId: appUser?.company_id,
    })
    setForm({ ...emptyForm, code })
    setOpen(true)
  }

  const openEdit = (t: LoanType) => {
    setEditing(t)
    setForm({
      code: t.code,
      name: t.name,
      description: t.description ?? '',
      max_amount: t.max_amount ?? '',
      max_installments: t.max_installments ?? '',
      interest_rate_pct: Number(t.interest_rate_pct),
      requires_collateral: t.requires_collateral,
      is_active: t.is_active,
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
      description: form.description.trim() || null,
      max_amount: form.max_amount === '' ? null : Number(form.max_amount),
      max_installments: form.max_installments === '' ? null : Number(form.max_installments),
      interest_rate_pct: Number(form.interest_rate_pct),
      requires_collateral: form.requires_collateral,
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('loan_types').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'loan_type', entityId: editing.id, after: payload })
      toast.success('Type updated')
    } else {
      const { data, error } = await supabase.from('loan_types').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'loan_type', entityId: data?.id, after: payload })
      toast.success('Type added')
    }
    setOpen(false)
    void load()
  }

  const onDelete = async (t: LoanType) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return
    const { error } = await supabase.from('loan_types').delete().eq('id', t.id)
    if (error) {
      toast.error('Delete failed', { description: error.message })
      return
    }
    toast.success('Deleted')
    void load()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan types"
        description="Catalog of loan products available to employees with caps and interest rates."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="loan.approve">
              <Button size="sm" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" /> Add type
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All loan types</CardTitle>
          <CardDescription>{rows.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Wallet className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No loan types yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.code}</div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                  </div>
                  {t.max_amount != null && (
                    <Badge variant="outline">Max {Number(t.max_amount).toLocaleString()}</Badge>
                  )}
                  {t.max_installments != null && (
                    <Badge variant="outline">{t.max_installments} mo</Badge>
                  )}
                  <Badge variant={Number(t.interest_rate_pct) > 0 ? 'warm' : 'success'}>
                    {Number(t.interest_rate_pct) > 0 ? `${t.interest_rate_pct}% p.a.` : 'Interest-free'}
                  </Badge>
                  {t.requires_collateral && <Badge variant="outline">Collateral</Badge>}
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canManage && (
                    <div className="flex items-center gap-1">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit loan type' : 'Add loan type'}</DialogTitle>
            <DialogDescription>Caps and interest rate apply when an employee requests this type.</DialogDescription>
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
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max amount (PKR)</Label>
                <Input
                  type="number"
                  value={form.max_amount === '' ? '' : form.max_amount}
                  onChange={(e) =>
                    setForm({ ...form, max_amount: e.target.value === '' ? '' : +e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max installments</Label>
                <Input
                  type="number"
                  value={form.max_installments === '' ? '' : form.max_installments}
                  onChange={(e) =>
                    setForm({ ...form, max_installments: e.target.value === '' ? '' : +e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Annual interest (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.interest_rate_pct}
                  onChange={(e) => setForm({ ...form, interest_rate_pct: +e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.requires_collateral}
                    onCheckedChange={(v) => setForm({ ...form, requires_collateral: !!v })}
                  />
                  Requires collateral
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
                  />
                  Active
                </label>
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

import { useEffect, useState } from 'react'
import { Plus, Pencil, RefreshCw, Loader2, Save, Tags, Trash2 } from 'lucide-react'
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

type Category = {
  id: string
  code: string
  name: string
  description: string | null
  max_per_claim: number | null
  max_per_month: number | null
  requires_attachment: boolean
  gl_account: string | null
  is_active: boolean
}

const emptyForm = {
  code: '',
  name: '',
  description: '',
  max_per_claim: '' as number | '',
  max_per_month: '' as number | '',
  requires_attachment: true,
  gl_account: '',
  is_active: true,
}

export function ExpenseCategoriesPage() {
  const { appUser, hasPermission } = useAuth()
  const canConfig = hasPermission('expense.config')
  const [rows, setRows] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('expense_categories').select('*').order('name')
    if (error) toast.error('Failed to load categories', { description: error.message })
    else setRows((data ?? []) as Category[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = async () => {
    setEditing(null)
    const code = await nextCode({
      table: 'expense_categories',
      column: 'code',
      prefix: 'EC-',
      width: 3,
      companyId: appUser?.company_id,
    })
    setForm({ ...emptyForm, code })
    setOpen(true)
  }

  const openEdit = (c: Category) => {
    setEditing(c)
    setForm({
      code: c.code,
      name: c.name,
      description: c.description ?? '',
      max_per_claim: c.max_per_claim ?? '',
      max_per_month: c.max_per_month ?? '',
      requires_attachment: c.requires_attachment,
      gl_account: c.gl_account ?? '',
      is_active: c.is_active,
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
      max_per_claim: form.max_per_claim === '' ? null : Number(form.max_per_claim),
      max_per_month: form.max_per_month === '' ? null : Number(form.max_per_month),
      requires_attachment: form.requires_attachment,
      gl_account: form.gl_account.trim() || null,
      is_active: form.is_active,
    }
    if (editing) {
      const { error } = await supabase.from('expense_categories').update(payload).eq('id', editing.id)
      setBusy(false)
      if (error) {
        toast.error('Update failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'UPDATE', entityType: 'expense_category', entityId: editing.id, after: payload })
      toast.success('Category updated')
    } else {
      const { data, error } = await supabase.from('expense_categories').insert(payload).select('id').single()
      setBusy(false)
      if (error) {
        toast.error('Create failed', { description: error.message })
        return
      }
      await writeAuditLog({ action: 'CREATE', entityType: 'expense_category', entityId: data?.id, after: payload })
      toast.success('Category added')
    }
    setOpen(false)
    void load()
  }

  const onDelete = async (c: Category) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return
    const { error } = await supabase.from('expense_categories').delete().eq('id', c.id)
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
        title="Expense categories"
        description="Categorize claim lines and set per-claim or per-month spending caps."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <HasPermission perm="expense.config">
              <Button size="sm" onClick={() => void openCreate()}>
                <Plus className="h-4 w-4" /> Add category
              </Button>
            </HasPermission>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All categories</CardTitle>
          <CardDescription>{rows.length} configured</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Tags className="h-8 w-8 mx-auto mb-3 opacity-50" />
              No categories yet.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-[220px]">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.code}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>
                    )}
                  </div>
                  {c.max_per_claim != null && (
                    <Badge variant="outline">Max/claim {Number(c.max_per_claim).toLocaleString()}</Badge>
                  )}
                  {c.max_per_month != null && (
                    <Badge variant="outline">Max/mo {Number(c.max_per_month).toLocaleString()}</Badge>
                  )}
                  {c.requires_attachment && <Badge variant="warm">Receipt required</Badge>}
                  {c.gl_account && <Badge variant="outline">GL {c.gl_account}</Badge>}
                  {!c.is_active && <Badge variant="secondary">Inactive</Badge>}
                  {canConfig && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onDelete(c)}>
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
            <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
            <DialogDescription>Limits and receipt rules apply when employees submit claims.</DialogDescription>
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
                <Label>Max per claim (PKR)</Label>
                <Input
                  type="number"
                  value={form.max_per_claim === '' ? '' : form.max_per_claim}
                  onChange={(e) =>
                    setForm({ ...form, max_per_claim: e.target.value === '' ? '' : +e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max per month (PKR)</Label>
                <Input
                  type="number"
                  value={form.max_per_month === '' ? '' : form.max_per_month}
                  onChange={(e) =>
                    setForm({ ...form, max_per_month: e.target.value === '' ? '' : +e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>GL account</Label>
                <Input
                  value={form.gl_account}
                  onChange={(e) => setForm({ ...form, gl_account: e.target.value })}
                  placeholder="e.g. 6300"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.requires_attachment}
                  onCheckedChange={(v) => setForm({ ...form, requires_attachment: !!v })}
                />
                Require receipt
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

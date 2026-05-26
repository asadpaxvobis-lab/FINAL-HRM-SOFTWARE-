import { useEffect, useState } from 'react'
import { Loader2, Save, Landmark } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { PK_BANKS, isValidPkIban, normalizeIban } from '@/lib/bank'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type BankAccount = {
  id: string
  bank_name: string
  branch_name: string | null
  account_title: string
  account_number: string
  iban: string | null
  is_primary: boolean
  is_active: boolean
  effective_from: string
  notes: string | null
}

const emptyForm = {
  bank_name: '',
  branch_name: '',
  account_title: '',
  account_number: '',
  iban: '',
  is_primary: true,
  is_active: true,
  effective_from: new Date().toISOString().slice(0, 10),
  notes: '',
}

export function BankTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('employee.update') || hasPermission('payroll.config')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('employee_bank_accounts')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('is_primary', true)
      .maybeSingle()
    if (data) {
      setRecordId(data.id)
      setForm({
        bank_name: data.bank_name,
        branch_name: data.branch_name ?? '',
        account_title: data.account_title,
        account_number: data.account_number,
        iban: data.iban ?? '',
        is_primary: data.is_primary,
        is_active: data.is_active,
        effective_from: data.effective_from,
        notes: data.notes ?? '',
      })
    } else {
      setRecordId(null)
      setForm({ ...emptyForm, account_title: employeeName })
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [employeeId, employeeName])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    if (!form.bank_name || !form.account_title.trim() || !form.account_number.trim()) {
      toast.error('Bank name, account title, and account number are required')
      return
    }
    const iban = form.iban.trim() ? normalizeIban(form.iban) : null
    if (iban && !isValidPkIban(iban)) {
      toast.error('Invalid Pakistan IBAN (expected PK + 22 characters)')
      return
    }
    setBusy(true)
    const payload = {
      employee_id: employeeId,
      bank_name: form.bank_name,
      branch_name: form.branch_name.trim() || null,
      account_title: form.account_title.trim(),
      account_number: form.account_number.trim(),
      iban,
      is_primary: form.is_primary,
      is_active: form.is_active,
      effective_from: form.effective_from,
      notes: form.notes.trim() || null,
    }
    let error
    if (recordId) {
      ;({ error } = await supabase.from('employee_bank_accounts').update(payload).eq('id', recordId))
    } else {
      const res = await supabase.from('employee_bank_accounts').insert(payload).select('id').single()
      error = res.error
      if (!error && res.data) setRecordId(res.data.id)
    }
    setBusy(false)
    if (error) {
      toast.error('Save failed', { description: error.message })
      return
    }
    await writeAuditLog({ action: recordId ? 'UPDATE' : 'CREATE', entityType: 'employee_bank_account', entityId: employeeId, after: payload })
    toast.success('Bank details saved')
    void load()
  }

  if (loading) {
    return (
      <div className="p-12 grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Bank account</CardTitle>
        </div>
        <CardDescription>Used for payroll bank disbursement and IBAN export files.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label>Bank *</Label>
            <Select
              required
              disabled={!canEdit}
              value={form.bank_name}
              onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            >
              <option value="">Select bank…</option>
              {PK_BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Branch name</Label>
            <Input
              disabled={!canEdit}
              value={form.branch_name}
              onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
              placeholder="e.g. Gulberg Branch"
            />
          </div>
          <div className="space-y-2">
            <Label>Account title *</Label>
            <Input
              required
              disabled={!canEdit}
              value={form.account_title}
              onChange={(e) => setForm({ ...form, account_title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Account number *</Label>
            <Input
              required
              disabled={!canEdit}
              value={form.account_number}
              onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>IBAN (PK)</Label>
            <Input
              disabled={!canEdit}
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="PK36SCBL0000001123456702"
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">24-character Pakistan IBAN for direct bank upload.</p>
          </div>
          <div className="space-y-2">
            <Label>Effective from</Label>
            <Input
              type="date"
              disabled={!canEdit}
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_active}
              disabled={!canEdit}
              onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
            />
            Active for disbursement
          </label>
          {canEdit && (
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save bank details
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { writeAuditLog } from '@/lib/audit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HasPermission } from '@/components/HasPermission'
import { toast } from 'sonner'

type Company = {
  id: string
  name: string
  legal_name: string | null
  ntn: string | null
  address: string | null
  phone: string | null
  email: string | null
  currency: string
  timezone: string
  fiscal_year_start_month: number
}

export function CompanyProfileSection() {
  const { appUser, hasPermission } = useAuth()
  const canEdit = hasPermission('company.update')
  const [form, setForm] = useState<Company | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!appUser) return
    void (async () => {
      setLoading(true)
      const { data, error } = await supabase.from('companies').select('*').eq('id', appUser.company_id).single()
      if (error) toast.error('Failed to load company', { description: error.message })
      else setForm(data as Company)
      setLoading(false)
    })()
  }, [appUser?.company_id])

  const save = async () => {
    if (!form || !appUser) return
    setSaving(true)
    const { error } = await supabase
      .from('companies')
      .update({
        name: form.name,
        legal_name: form.legal_name,
        ntn: form.ntn,
        address: form.address,
        phone: form.phone,
        email: form.email,
        currency: form.currency,
        timezone: form.timezone,
        fiscal_year_start_month: form.fiscal_year_start_month,
      })
      .eq('id', form.id)
    setSaving(false)
    if (error) toast.error('Save failed', { description: error.message })
    else {
      await writeAuditLog({ action: 'UPDATE', entityType: 'company', entityId: form.id })
      toast.success('Company profile saved')
    }
  }

  if (loading || !form) {
    return (
      <Card>
        <CardContent className="py-8 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Company profile</CardTitle>
          <CardDescription>Legal identity shown on payslips and letters</CardDescription>
        </div>
        <HasPermission perm="company.update">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </HasPermission>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Legal name</Label>
            <Input
              value={form.legal_name ?? ''}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-2">
            <Label>NTN</Label>
            <Input value={form.ntn ?? ''} onChange={(e) => setForm({ ...form, ntn: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!canEdit} />
          </div>
          <div className="space-y-2">
            <Label>Fiscal year starts (month 1–12)</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={form.fiscal_year_start_month}
              onChange={(e) => setForm({ ...form, fiscal_year_start_month: +e.target.value })}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">Default 7 = July (Pakistan FY)</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

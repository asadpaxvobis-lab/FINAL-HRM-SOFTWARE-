import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { HasPermission } from '@/components/HasPermission'
import { IpRangesSection } from '@/components/admin/IpRangesSection'
import { CompanyProfileSection } from '@/components/admin/CompanyProfileSection'
import { writeAuditLog } from '@/lib/audit'

type Settings = {
  apply_income_tax: boolean
  standard_monthly_hours: number
  standard_fortnightly_hours: number
  standard_weekly_hours: number
  payroll_cutoff_day: number
  enable_2fa_for_admin: boolean
  enable_ip_restriction: boolean
}

const defaults: Settings = {
  apply_income_tax: false,
  standard_monthly_hours: 208,
  standard_fortnightly_hours: 96,
  standard_weekly_hours: 48,
  payroll_cutoff_day: 25,
  enable_2fa_for_admin: true,
  enable_ip_restriction: false,
}

export function SettingsPage() {
  const { appUser, hasPermission } = useAuth()
  const canEdit = hasPermission('settings.update')
  const [settings, setSettings] = useState<Settings>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [companyName, setCompanyName] = useState('')

  async function load() {
    if (!appUser) return
    setLoading(true)
    const [s, c] = await Promise.all([
      supabase.from('app_settings').select('settings').eq('company_id', appUser.company_id).single(),
      supabase.from('companies').select('name').eq('id', appUser.company_id).single(),
    ])
    if (s.data) setSettings({ ...defaults, ...(s.data.settings as Settings) })
    if (c.data) setCompanyName(c.data.name)
    setLoading(false)
  }

  useEffect(() => { void load() }, [appUser?.id])

  const save = async () => {
    if (!appUser) return
    setSaving(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ settings })
      .eq('company_id', appUser.company_id)
    setSaving(false)
    if (error) toast.error('Failed to save', { description: error.message })
    else {
      await writeAuditLog({ action: 'UPDATE', entityType: 'app_settings', entityId: appUser.company_id })
      toast.success('Settings saved')
    }
  }

  if (loading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <CompanyProfileSection />

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">{companyName}</p>
        </div>
        <HasPermission perm="settings.update">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </HasPermission>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payroll</CardTitle>
          <CardDescription>How payroll calculates working hours and applies tax</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Monthly hours</Label>
              <Input
                type="number"
                value={settings.standard_monthly_hours}
                onChange={(e) => setSettings({ ...settings, standard_monthly_hours: +e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Fortnightly hours</Label>
              <Input
                type="number"
                value={settings.standard_fortnightly_hours}
                onChange={(e) => setSettings({ ...settings, standard_fortnightly_hours: +e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-2">
              <Label>Weekly hours</Label>
              <Input
                type="number"
                value={settings.standard_weekly_hours}
                onChange={(e) => setSettings({ ...settings, standard_weekly_hours: +e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Payroll cut-off day</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={settings.payroll_cutoff_day}
                onChange={(e) => setSettings({ ...settings, payroll_cutoff_day: +e.target.value })}
                disabled={!canEdit}
              />
              <p className="text-xs text-muted-foreground">Day of month payroll period ends.</p>
            </div>
            <div className="space-y-2">
              <Label className="invisible">Tax</Label>
              <label className="flex items-center gap-2 h-10 px-3 rounded-lg border bg-background cursor-pointer">
                <Checkbox
                  checked={settings.apply_income_tax}
                  onCheckedChange={(v) => setSettings({ ...settings, apply_income_tax: !!v })}
                  disabled={!canEdit}
                />
                <span className="text-sm">Apply income tax in payroll</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
          <CardDescription>Authentication and access controls</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer">
            <Checkbox
              checked={settings.enable_2fa_for_admin}
              onCheckedChange={(v) => setSettings({ ...settings, enable_2fa_for_admin: !!v })}
              disabled={!canEdit}
            />
            <div>
              <div className="text-sm font-medium">Require 2FA for admin users</div>
              <div className="text-xs text-muted-foreground">Admin and HR Admin roles must set up TOTP.</div>
            </div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer">
            <Checkbox
              checked={settings.enable_ip_restriction}
              onCheckedChange={(v) => setSettings({ ...settings, enable_ip_restriction: !!v })}
              disabled={!canEdit}
            />
            <div>
              <div className="text-sm font-medium">Restrict admin login to allowed IP ranges</div>
              <div className="text-xs text-muted-foreground">Configure ranges below once this is on.</div>
            </div>
          </label>
        </CardContent>
      </Card>

      <IpRangesSection />
    </div>
  )
}

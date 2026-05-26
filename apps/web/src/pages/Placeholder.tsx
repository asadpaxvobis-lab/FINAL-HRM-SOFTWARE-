import { Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Props = {
  title: string
  description: string
  phase: number
}

export function PlaceholderPage({ title, description, phase }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle>Coming in Phase {phase}</CardTitle>
          </div>
          <CardDescription>
            This module is on the roadmap. Phase 1 ships authentication, RBAC, and user management. The remaining
            phases follow in order: master data, attendance, leave &amp; overtime, payroll, kiosk &amp; mobile, HR workflows,
            recruitment, and reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            The database schema, RLS policies, and permission entries for this module are already in place — you can
            assign access today and the screens will plug in as each phase ships.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

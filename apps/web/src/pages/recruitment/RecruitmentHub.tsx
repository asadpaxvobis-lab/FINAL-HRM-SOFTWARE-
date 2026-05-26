import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCw, Loader2, Briefcase, Kanban, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/master/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function RecruitmentHubPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('recruitment.manage')
  const [stats, setStats] = useState({ openJobs: 0, activeCandidates: 0, interviews: 0 })
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [jobs, cands, ints] = await Promise.all([
      supabase.from('job_postings').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'),
      supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .in('stage', ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER']),
      supabase.from('recruitment_interviews').select('*', { count: 'exact', head: true }).eq('status', 'SCHEDULED'),
    ])
    setStats({
      openJobs: jobs.count ?? 0,
      activeCandidates: cands.count ?? 0,
      interviews: ints.count ?? 0,
    })
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recruitment"
        description="Job postings, candidate pipeline, interviews, and hire-to-employee."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Open jobs</div>
            <div className="text-2xl font-semibold tabular-nums">{loading ? '—' : stats.openJobs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Active candidates</div>
            <div className="text-2xl font-semibold tabular-nums">{loading ? '—' : stats.activeCandidates}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Upcoming interviews</div>
            <div className="text-2xl font-semibold tabular-nums">{loading ? '—' : stats.interviews}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Job postings</CardTitle>
            </div>
            <CardDescription>Create and publish openings with branch, department, and designation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/recruitment/jobs">{canManage ? 'Manage jobs' : 'View jobs'}</Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Kanban className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Candidate pipeline</CardTitle>
            </div>
            <CardDescription>Track applicants from applied through offer and hire.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/recruitment/pipeline">Open pipeline</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Quick links</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/recruitment/jobs">
                <Plus className="h-4 w-4" /> New job posting
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/recruitment/pipeline">Add candidate</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import {
  Users,
  UserPlus,
  Clock,
  TrendingUp,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { avatarColorFor, cn, initialsFromName } from '@/lib/utils'
import { AnimatedSection } from '@/components/layout/AnimatedSection'

type KpiCardProps = {
  title: string
  value: string | number
  subtext: string
  subtextClass?: string
  icon: LucideIcon
  iconBg: string
  iconColor: string
  to?: string
}

type MonthPoint = { month: string; rate: number }
type DeptPoint = { code: string; count: number }
type ActivityItem = { id: string; name: string; action: string; at: string }
type LeaveItem = {
  id: string
  name: string
  department: string
  dateLabel: string
  days: number
}

const PIPELINE_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'] as const
const ATTENDED_STATUSES = new Set(['Present', 'Late', 'Half Day'])
const WORKDAY_STATUSES = new Set(['Present', 'Late', 'Absent', 'Half Day'])

function formatRelativeLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'short' })
}

function lastSixMonthKeys(): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function attendanceRateFromRows(rows: { status: string }[]): number {
  const relevant = rows.filter((r) => WORKDAY_STATUSES.has(r.status))
  if (relevant.length === 0) return 0
  const attended = relevant.filter((r) => ATTENDED_STATUSES.has(r.status)).length
  return (attended / relevant.length) * 100
}

function auditActionLabel(action: string, entityType: string): string {
  const entity = entityType.replace(/_/g, ' ')
  switch (action.toUpperCase()) {
    case 'CREATE':
      return `created ${entity}`
    case 'UPDATE':
      return `updated ${entity}`
    case 'DELETE':
      return `deleted ${entity}`
    case 'LOGIN':
      return 'logged in'
    case 'LOGOUT':
      return 'logged out'
    default:
      return `${action.toLowerCase()} ${entity}`
  }
}

function KpiCard({ title, value, subtext, subtextClass, icon: Icon, iconBg, iconColor, to }: KpiCardProps) {
  const card = (
    <Card className={cn('shadow-sm', to && 'transition-colors hover:border-primary/30 hover:bg-accent/30')}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
            <p className={cn('text-sm', subtextClass ?? 'text-emerald-600 dark:text-emerald-400')}>{subtext}</p>
          </div>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', iconBg)}>
            <Icon className={cn('h-5 w-5', iconColor)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{card}</Link> : card
}

function ViewAllLink({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      View All
      <ArrowRight className="h-4 w-4" />
    </Link>
  )
}

export function DashboardPage() {
  const { appUser, hasPermission } = useAuth()
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [loading, setLoading] = useState(true)
  const [totalEmployees, setTotalEmployees] = useState(0)
  const [activeEmployees, setActiveEmployees] = useState(0)
  const [newCandidates, setNewCandidates] = useState(0)
  const [pipelineCandidates, setPipelineCandidates] = useState(0)
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null)
  const [attendanceDelta, setAttendanceDelta] = useState<number | null>(null)
  const [pendingLeaves, setPendingLeaves] = useState(0)
  const [totalLeaveRequests, setTotalLeaveRequests] = useState(0)
  const [attendanceTrend, setAttendanceTrend] = useState<MonthPoint[]>([])
  const [deptDistribution, setDeptDistribution] = useState<DeptPoint[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [upcomingLeaves, setUpcomingLeaves] = useState<LeaveItem[]>([])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const monthKeys = lastSixMonthKeys()
        const rangeStart = `${monthKeys[0]}-01`
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const thirtyDaysAgoIso = thirtyDaysAgo.toISOString()

        const canAttendance = hasPermission('attendance.view')
        const canRecruitment = hasPermission('recruitment.view')
        const canLeave = hasPermission('leave.view')
        const canAudit = hasPermission('audit.view')

        const [
          empTotal,
          empActive,
          candNew,
          candPipeline,
          pendLeave,
          allLeave,
          dailyRows,
          empByDept,
          auditRows,
          recentLeaves,
          pendingLeaveList,
        ] = await Promise.all([
          supabase.from('employees').select('*', { count: 'exact', head: true }),
          supabase.from('employees').select('*', { count: 'exact', head: true }).eq('is_active', true),
          canRecruitment
            ? supabase
                .from('candidates')
                .select('*', { count: 'exact', head: true })
                .gte('applied_at', thirtyDaysAgoIso)
                .in('stage', PIPELINE_STAGES)
            : Promise.resolve({ count: 0 }),
          canRecruitment
            ? supabase.from('candidates').select('*', { count: 'exact', head: true }).in('stage', PIPELINE_STAGES)
            : Promise.resolve({ count: 0 }),
          canLeave
            ? supabase.from('leave_applications').select('*', { count: 'exact', head: true }).eq('status', 'Pending')
            : Promise.resolve({ count: 0 }),
          canLeave
            ? supabase.from('leave_applications').select('*', { count: 'exact', head: true })
            : Promise.resolve({ count: 0 }),
          canAttendance
            ? supabase
                .from('attendance_daily')
                .select('attendance_date, status')
                .gte('attendance_date', rangeStart)
                .lte('attendance_date', todayIso)
            : Promise.resolve({ data: [] as { attendance_date: string; status: string }[] }),
          supabase
            .from('employees')
            .select('department_id, departments ( code, name )')
            .eq('is_active', true),
          canAudit
            ? supabase
                .from('audit_logs')
                .select('id, action, entity_type, user_email, created_at, users ( full_name )')
                .order('created_at', { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] as Record<string, unknown>[] }),
          canLeave
            ? supabase
                .from('leave_applications')
                .select('id, created_at, status, employees ( full_name )')
                .order('created_at', { ascending: false })
                .limit(8)
            : Promise.resolve({ data: [] as Record<string, unknown>[] }),
          canLeave
            ? supabase
                .from('leave_applications')
                .select(
                  'id, start_date, total_days, employees ( full_name, departments ( code, name ) )'
                )
                .eq('status', 'Pending')
                .gte('start_date', todayIso)
                .order('start_date', { ascending: true })
                .limit(6)
            : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        ])

        setTotalEmployees(empTotal.count ?? 0)
        setActiveEmployees(empActive.count ?? 0)
        setNewCandidates(candNew.count ?? 0)
        setPipelineCandidates(candPipeline.count ?? 0)
        setPendingLeaves(pendLeave.count ?? 0)
        setTotalLeaveRequests(allLeave.count ?? 0)

        const daily = (dailyRows.data ?? []) as { attendance_date: string; status: string }[]
        const byMonth = new Map<string, { status: string }[]>()
        for (const key of monthKeys) byMonth.set(key, [])
        for (const row of daily) {
          const key = monthKey(row.attendance_date)
          if (byMonth.has(key)) byMonth.get(key)!.push({ status: row.status })
        }

        const trend: MonthPoint[] = monthKeys.map((key) => ({
          month: monthLabel(key),
          rate: Math.round(attendanceRateFromRows(byMonth.get(key) ?? []) * 10) / 10,
        }))
        setAttendanceTrend(trend)

        if (canAttendance && trend.length >= 2) {
          const current = trend[trend.length - 1]?.rate ?? 0
          const previous = trend[trend.length - 2]?.rate ?? 0
          setAttendanceRate(current)
          setAttendanceDelta(Math.round((current - previous) * 10) / 10)
        } else if (canAttendance && trend.length === 1) {
          setAttendanceRate(trend[0]?.rate ?? 0)
          setAttendanceDelta(null)
        }

        const deptCounts = new Map<string, number>()
        for (const row of empByDept.data ?? []) {
          const dept = row.departments as { code?: string; name?: string } | { code?: string; name?: string }[] | null
          const d = Array.isArray(dept) ? dept[0] : dept
          const code = (d?.code ?? d?.name ?? 'Other').slice(0, 3).toUpperCase()
          deptCounts.set(code, (deptCounts.get(code) ?? 0) + 1)
        }
        const deptPoints = [...deptCounts.entries()]
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6)
        setDeptDistribution(deptPoints)

        const activity: ActivityItem[] = []

        if (canAudit) {
          for (const row of auditRows.data ?? []) {
            const users = row.users as { full_name?: string } | { full_name?: string }[] | null
            const u = Array.isArray(users) ? users[0] : users
            const name = u?.full_name ?? (row.user_email as string) ?? 'User'
            activity.push({
              id: `audit-${row.id}`,
              name,
              action: auditActionLabel(row.action as string, row.entity_type as string),
              at: row.created_at as string,
            })
          }
        }

        if (canLeave) {
          for (const row of recentLeaves.data ?? []) {
            const emp = row.employees as { full_name?: string } | { full_name?: string }[] | null
            const e = Array.isArray(emp) ? emp[0] : emp
            const name = e?.full_name ?? 'Employee'
            const status = (row.status as string)?.toLowerCase() ?? 'updated'
            activity.push({
              id: `leave-${row.id}`,
              name,
              action:
                status === 'pending'
                  ? 'submitted leave request'
                  : `${status} leave request`,
              at: row.created_at as string,
            })
          }
        }

        activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        setRecentActivity(activity.slice(0, 5))

        setUpcomingLeaves(
          (pendingLeaveList.data ?? []).map((row: Record<string, unknown>) => {
            const emp = row.employees as
              | { full_name?: string; departments?: { code?: string; name?: string } | { code?: string; name?: string }[] | null }
              | { full_name?: string; departments?: { code?: string; name?: string } | { code?: string; name?: string }[] | null }[]
              | null
            const e = Array.isArray(emp) ? emp[0] : emp
            const deptRaw = e?.departments
            const deptObj = Array.isArray(deptRaw) ? deptRaw[0] : deptRaw
            const startDate = row.start_date as string
            const days = Number(row.total_days) || 1
            return {
              id: row.id as string,
              name: e?.full_name ?? 'Employee',
              department: deptObj?.name ?? deptObj?.code ?? '—',
              dateLabel: new Date(`${startDate}T12:00:00`).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              }),
              days,
            }
          })
        )
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [todayIso, hasPermission])

  const attendanceSubtext =
    attendanceDelta === null
      ? 'Based on recent attendance'
      : `${attendanceDelta >= 0 ? '+' : ''}${attendanceDelta}% from last month`

  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Welcome back{appUser?.full_name ? `, ${appUser.full_name.split(' ')[0]}` : ''}! Here&apos;s what&apos;s
            happening today.
          </p>
        </div>
      </AnimatedSection>

      {/* KPI row */}
      <AnimatedSection delay={60}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Employees"
          value={loading ? '—' : totalEmployees}
          subtext={`${loading ? '—' : activeEmployees} active`}
          icon={Users}
          iconBg="bg-blue-500/10"
          iconColor="text-blue-600 dark:text-blue-400"
          to={hasPermission('employee.view') ? '/employees' : undefined}
        />
        <KpiCard
          title="New Candidates"
          value={loading ? '—' : newCandidates}
          subtext={`${loading ? '—' : pipelineCandidates} in pipeline`}
          icon={UserPlus}
          iconBg="bg-emerald-500/10"
          iconColor="text-emerald-600 dark:text-emerald-400"
          to={hasPermission('recruitment.view') ? '/recruitment/pipeline' : undefined}
        />
        <KpiCard
          title="Attendance Rate"
          value={loading || attendanceRate === null ? '—' : `${attendanceRate}%`}
          subtext={hasPermission('attendance.view') ? attendanceSubtext : 'No access'}
          subtextClass={
            attendanceDelta !== null && attendanceDelta >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          }
          icon={Clock}
          iconBg="bg-orange-500/10"
          iconColor="text-orange-600 dark:text-orange-400"
          to={hasPermission('attendance.view') ? '/attendance' : undefined}
        />
        <KpiCard
          title="Pending Leaves"
          value={loading ? '—' : pendingLeaves}
          subtext={`${loading ? '—' : totalLeaveRequests} total requests`}
          subtextClass="text-muted-foreground"
          icon={TrendingUp}
          iconBg="bg-slate-500/10"
          iconColor="text-slate-600 dark:text-slate-400"
          to={hasPermission('leave.view') ? '/leave' : undefined}
        />
        </div>
      </AnimatedSection>

      {/* Charts row */}
      <AnimatedSection delay={120}>
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Attendance Analytics</CardTitle>
            {hasPermission('attendance.view') && <ViewAllLink to="/attendance" />}
          </CardHeader>
          <CardContent className="pt-2">
            {!hasPermission('attendance.view') ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                You don&apos;t have permission to view attendance analytics.
              </div>
            ) : loading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={attendanceTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip
                    formatter={(value) => [`${value ?? 0}%`, 'Rate']}
                    contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base font-semibold">Department Distribution</CardTitle>
            {hasPermission('department.view') && <ViewAllLink to="/departments" />}
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : deptDistribution.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                No department data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={deptDistribution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        </div>
      </AnimatedSection>

      {/* Activity row */}
      <AnimatedSection delay={180}>
        <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
            {hasPermission('audit.view') && <ViewAllLink to="/admin/audit" />}
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      avatarColorFor(item.name)
                    )}
                  >
                    {initialsFromName(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{item.name}</span>{' '}
                      <span className="text-muted-foreground">{item.action}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeLong(item.at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-base font-semibold">Upcoming Leave Requests</CardTitle>
            {hasPermission('leave.view') && <ViewAllLink to="/leave" />}
          </CardHeader>
          <CardContent className="space-y-4">
            {!hasPermission('leave.view') ? (
              <p className="text-sm text-muted-foreground">You don&apos;t have permission to view leave requests.</p>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : upcomingLeaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming pending leave requests.</p>
            ) : (
              upcomingLeaves.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      avatarColorFor(item.name)
                    )}
                  >
                    {initialsFromName(item.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.department}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm text-muted-foreground">{item.dateLabel}</span>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium',
                        item.days <= 1
                          ? 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
                          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      )}
                    >
                      {item.days} day{item.days === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        </div>
      </AnimatedSection>
    </div>
  )
}

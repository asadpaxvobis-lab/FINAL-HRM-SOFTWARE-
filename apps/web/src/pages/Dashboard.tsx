import {
  Users,
  Building2,
  Briefcase,
  GraduationCap,
  CalendarDays,
  CalendarRange,
  Timer,
  Clock,
  FileQuestion,
  HardDrive,
  Wallet,
  Receipt,
  Coins,
  Megaphone,
  Pin,
  AlertTriangle,
  FileText,
  BarChart3,
  LogOut,
  Shield,
  Settings as SettingsIcon,
  ClipboardList,
  UserCircle,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

type Stat = {
  label: string
  value: number | string
  icon: LucideIcon
  hint: string
  to?: string
  perm?: string
}

type QuickAction = {
  label: string
  description: string
  to: string
  icon: LucideIcon
  perm?: string
  tone: 'orange' | 'blue' | 'green' | 'purple' | 'amber' | 'rose' | 'cyan' | 'slate'
}

const toneClasses: Record<QuickAction['tone'], string> = {
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  cyan: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
}

const quickActions: { heading: string; items: QuickAction[] }[] = [
  {
    heading: 'People',
    items: [
      { label: 'Employees', description: 'Browse, add, and edit employee records', to: '/employees', icon: Users, perm: 'employee.view', tone: 'orange' },
      { label: 'Departments', description: 'Organize teams and units', to: '/departments', icon: Briefcase, perm: 'department.view', tone: 'blue' },
      { label: 'Designations', description: 'Job titles and grades', to: '/designations', icon: GraduationCap, perm: 'designation.view', tone: 'purple' },
      { label: 'Branches', description: 'Physical locations and sites', to: '/branches', icon: Building2, perm: 'branch.view', tone: 'cyan' },
    ],
  },
  {
    heading: 'Time & Attendance',
    items: [
      { label: 'Holidays', description: 'Calendar and branch exclusions', to: '/holidays', icon: CalendarRange, perm: 'holiday.view', tone: 'rose' },
      { label: 'Shifts', description: 'Define work schedules', to: '/shifts', icon: Timer, perm: 'shift.view', tone: 'amber' },
      { label: 'Roster', description: 'Assign shifts in bulk', to: '/roster', icon: ClipboardList, perm: 'shift.view', tone: 'green' },
      { label: 'Attendance', description: 'Daily attendance and punches', to: '/attendance', icon: Clock, perm: 'attendance.view', tone: 'blue' },
      { label: 'Corrections', description: 'Approve missing punch requests', to: '/attendance/corrections', icon: FileQuestion, perm: 'attendance.view', tone: 'orange' },
      { label: 'Overtime', description: 'OT requests, approvals, payouts', to: '/overtime', icon: Clock, perm: 'overtime.view', tone: 'purple' },
    ],
  },
  {
    heading: 'Leave',
    items: [
      { label: 'Leave', description: 'Apply and track requests', to: '/leave', icon: CalendarDays, perm: 'leave.view', tone: 'purple' },
      { label: 'Leave balances', description: 'View and grant balances', to: '/leave/balances', icon: CalendarDays, perm: 'leave.view', tone: 'cyan' },
      { label: 'Leave types', description: 'Configure policies', to: '/leave/types', icon: CalendarDays, perm: 'leave.config', tone: 'slate' },
    ],
  },
  {
    heading: 'Payroll & Finance',
    items: [
      { label: 'Payroll runs', description: 'Periods, payslips, releases', to: '/payroll', icon: Wallet, perm: 'payroll.view', tone: 'green' },
      { label: 'Payroll components', description: 'Earnings, deductions, contributions', to: '/payroll/components', icon: Wallet, perm: 'payroll.config', tone: 'cyan' },
      { label: 'Tax slabs', description: 'FBR salaried income-tax bands', to: '/payroll/tax-slabs', icon: Wallet, perm: 'payroll.view', tone: 'purple' },
      { label: 'Expense claims', description: 'Submit and approve expenses', to: '/expenses', icon: Receipt, perm: 'expense.view', tone: 'amber' },
      { label: 'Expense categories', description: 'Caps, GL accounts, receipt rules', to: '/expenses/categories', icon: Receipt, perm: 'expense.config', tone: 'rose' },
      { label: 'Loans & advances', description: 'Request, approve, and track repayments', to: '/loans', icon: Coins, perm: 'loan.view', tone: 'green' },
      { label: 'Loan types', description: 'Caps, interest, installments', to: '/loans/types', icon: Coins, perm: 'loan.approve', tone: 'blue' },
    ],
  },
  {
    heading: 'Communication',
    items: [
      { label: 'Announcements', description: 'Company-wide notice board', to: '/announcements', icon: Megaphone, perm: 'announcement.view', tone: 'rose' },
      { label: 'Letters', description: 'Offer, experience, NOC, warnings', to: '/letters', icon: FileText, perm: 'letter.view', tone: 'blue' },
      { label: 'Resignations', description: 'Exit requests, clearance, settlement', to: '/resignations', icon: LogOut, perm: 'resignation.view', tone: 'amber' },
    ],
  },
  {
    heading: 'Reports',
    items: [
      { label: 'Reports', description: 'Muster roll, salary register, statutory', to: '/reports', icon: BarChart3, perm: 'report.view', tone: 'purple' },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Users', description: 'System login accounts', to: '/admin/users', icon: Users, perm: 'user.view', tone: 'slate' },
      { label: 'Roles & permissions', description: 'RBAC configuration', to: '/admin/roles', icon: Shield, perm: 'role.view', tone: 'orange' },
      { label: 'Devices', description: 'Biometric & punch devices', to: '/admin/devices', icon: HardDrive, perm: 'attendance.view', tone: 'cyan' },
      { label: 'Audit log', description: 'System change history', to: '/admin/audit', icon: ClipboardList, perm: 'audit.view', tone: 'green' },
      { label: 'Settings', description: 'Company profile and preferences', to: '/admin/settings', icon: SettingsIcon, perm: 'settings.view', tone: 'amber' },
      { label: 'My profile', description: 'Update name, password, view permissions', to: '/profile', icon: UserCircle, tone: 'blue' },
    ],
  },
]

export function DashboardPage() {
  const { appUser, roles, permissions, hasPermission } = useAuth()
  const [stats, setStats] = useState({
    employees: '—' as number | string,
    branches: '—' as number | string,
    departments: '—' as number | string,
    designations: '—' as number | string,
    users: '—' as number | string,
    onLeaveToday: '—' as number | string,
    pendingLeave: '—' as number | string,
    pendingCorrections: '—' as number | string,
    upcomingHolidays: '—' as number | string,
    activeDevices: '—' as number | string,
  })
  const [onLeaveList, setOnLeaveList] = useState<{ id: string; name: string; type: string; until: string }[]>([])
  const [upcomingHolidays, setUpcomingHolidays] = useState<{ id: string; name: string; date: string }[]>([])
  const [announcements, setAnnouncements] = useState<
    { id: string; title: string; category: string; priority: string; pinned: boolean; published_at: string | null; unread: boolean }[]
  >([])

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const in30Iso = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  }, [])

  useEffect(() => {
    const load = async () => {
      const [emp, br, dep, desg, us, dev, hol, holList, leaveToday, pendLeave, pendCorr] = await Promise.all([
        supabase.from('employees').select('*', { count: 'exact', head: true }),
        supabase.from('branches').select('*', { count: 'exact', head: true }),
        supabase.from('departments').select('*', { count: 'exact', head: true }),
        supabase.from('designations').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
        supabase.from('attendance_devices').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase
          .from('holidays')
          .select('*', { count: 'exact', head: true })
          .gte('holiday_date', todayIso)
          .lte('holiday_date', in30Iso),
        supabase
          .from('holidays')
          .select('id, name, holiday_date')
          .gte('holiday_date', todayIso)
          .lte('holiday_date', in30Iso)
          .order('holiday_date', { ascending: true })
          .limit(5),
        supabase
          .from('leave_applications')
          .select('id, from_date, to_date, status, employees ( first_name, last_name ), leave_types ( name )')
          .lte('from_date', todayIso)
          .gte('to_date', todayIso)
          .eq('status', 'APPROVED')
          .limit(8),
        supabase
          .from('leave_applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'PENDING'),
        supabase
          .from('attendance_corrections')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'PENDING'),
      ])

      setStats({
        employees: emp.count ?? 0,
        branches: br.count ?? 0,
        departments: dep.count ?? 0,
        designations: desg.count ?? 0,
        users: us.count ?? 0,
        activeDevices: dev.count ?? 0,
        upcomingHolidays: hol.count ?? 0,
        onLeaveToday: leaveToday.data?.length ?? 0,
        pendingLeave: pendLeave.count ?? 0,
        pendingCorrections: pendCorr.count ?? 0,
      })

      setOnLeaveList(
        (leaveToday.data ?? []).map((r: any) => ({
          id: r.id,
          name: `${r.employees?.first_name ?? ''} ${r.employees?.last_name ?? ''}`.trim() || 'Employee',
          type: r.leave_types?.name ?? 'Leave',
          until: r.to_date,
        }))
      )
      setUpcomingHolidays(
        (holList.data ?? []).map((h: any) => ({ id: h.id, name: h.name, date: h.holiday_date }))
      )

      // Announcements feed (latest 5 published + read state for this user)
      if (hasPermission('announcement.view')) {
        const [{ data: ann }, { data: reads }] = await Promise.all([
          supabase
            .from('announcements')
            .select('id, title, category, priority, pinned, published_at')
            .eq('status', 'PUBLISHED')
            .order('pinned', { ascending: false })
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(5),
          appUser?.id
            ? supabase.from('announcement_reads').select('announcement_id').eq('user_id', appUser.id)
            : Promise.resolve({ data: [] as { announcement_id: string }[] }),
        ])
        const readSet = new Set((reads ?? []).map((r) => (r as { announcement_id: string }).announcement_id))
        setAnnouncements(
          (ann ?? []).map((a: any) => ({
            id: a.id,
            title: a.title,
            category: a.category,
            priority: a.priority,
            pinned: a.pinned,
            published_at: a.published_at,
            unread: !readSet.has(a.id),
          }))
        )
      }
    }
    void load().catch(() => {})
  }, [todayIso, in30Iso, appUser?.id, hasPermission])

  const statTiles: Stat[] = [
    { label: 'Employees', value: stats.employees, icon: Users, hint: 'Total in system', to: '/employees', perm: 'employee.view' },
    { label: 'Departments', value: stats.departments, icon: Briefcase, hint: 'Configured', to: '/departments', perm: 'department.view' },
    { label: 'Designations', value: stats.designations, icon: GraduationCap, hint: 'Job titles', to: '/designations', perm: 'designation.view' },
    { label: 'Branches', value: stats.branches, icon: Building2, hint: 'Active locations', to: '/branches', perm: 'branch.view' },
    { label: 'On leave today', value: stats.onLeaveToday, icon: CalendarDays, hint: 'Approved leave', to: '/leave', perm: 'leave.view' },
    { label: 'Pending leave', value: stats.pendingLeave, icon: CalendarDays, hint: 'Awaiting decision', to: '/leave', perm: 'leave.approve' },
    { label: 'Pending corrections', value: stats.pendingCorrections, icon: FileQuestion, hint: 'Attendance fixes', to: '/attendance/corrections', perm: 'attendance.view' },
    { label: 'Upcoming holidays', value: stats.upcomingHolidays, icon: CalendarRange, hint: 'Next 30 days', to: '/holidays', perm: 'holiday.view' },
  ]

  const visibleStats = statTiles.filter((s) => !s.perm || hasPermission(s.perm))

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Hello, {appUser?.full_name?.split(' ')[0] || 'there'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {roles.join(' · ') || 'No roles assigned'}
            {' · '}
            {permissions.size} permissions
          </p>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {visibleStats.map((s) => {
          const card = (
            <Card className={cn('transition-colors', s.to && 'hover:border-primary/40 hover:bg-accent/40')}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
                <p className="text-xs text-muted-foreground pt-1">{s.hint}</p>
              </CardContent>
            </Card>
          )
          return s.to ? (
            <Link key={s.label} to={s.to}>
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          )
        })}
      </div>

      {/* Announcements feed */}
      {hasPermission('announcement.view') && announcements.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-primary" /> Announcements
              </CardTitle>
              <CardDescription>Latest company-wide updates.</CardDescription>
            </div>
            <Link to="/announcements" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {announcements.map((a) => (
                <Link
                  key={a.id}
                  to={`/announcements/${a.id}`}
                  className={cn(
                    'flex items-center gap-3 px-6 py-3 hover:bg-muted/30',
                    a.pinned && 'bg-amber-50/40 dark:bg-amber-950/10'
                  )}
                >
                  <div className="flex flex-col items-center gap-0.5 min-w-[20px]">
                    {a.pinned && <Pin className="h-3.5 w-3.5 text-amber-600" />}
                    {a.priority === 'URGENT' && <AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        {a.category}
                      </span>
                      {a.unread && <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>
                    <div className={cn('truncate text-sm', a.unread ? 'font-semibold' : 'font-medium')}>
                      {a.title}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString() : '—'}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today snapshot + system overview */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" /> On leave today
            </CardTitle>
            <CardDescription>Approved leave currently in effect.</CardDescription>
          </CardHeader>
          <CardContent>
            {onLeaveList.length === 0 ? (
              <div className="text-sm text-muted-foreground">No employees on leave today.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {onLeaveList.map((l) => (
                  <li key={l.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{l.type}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">until {l.until}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" /> Upcoming holidays
            </CardTitle>
            <CardDescription>Next 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingHolidays.length === 0 ? (
              <div className="text-sm text-muted-foreground">No holidays in the next 30 days.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {upcomingHolidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-xs text-muted-foreground">{h.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> System overview
            </CardTitle>
            <CardDescription>What's running right now.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active devices</span>
              <span className="font-medium tabular-nums">{stats.activeDevices}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">System users</span>
              <span className="font-medium tabular-nums">{stats.users}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your roles</span>
              <span className="font-medium">{roles.join(', ') || '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your permissions</span>
              <span className="font-medium tabular-nums">{permissions.size}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Quick actions</h3>
          <p className="text-sm text-muted-foreground">
            Jump straight to any module. Tiles are filtered by your permissions.
          </p>
        </div>

        {quickActions.map((section) => {
          const items = section.items.filter((i) => !i.perm || hasPermission(i.perm))
          if (items.length === 0) return null
          return (
            <div key={section.heading} className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.heading}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group rounded-xl border bg-card p-4 hover:border-primary/40 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn('h-10 w-10 rounded-lg grid place-items-center', toneClasses[item.tone])}>
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight truncate group-hover:text-primary">
                          {item.label}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

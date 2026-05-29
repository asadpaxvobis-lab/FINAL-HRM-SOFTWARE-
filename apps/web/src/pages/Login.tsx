import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AppLogo } from '@/components/branding/AppLogo'
import { getDefaultHomePath } from '@/lib/defaultRoute'

export function LoginPage() {
  const [email, setEmail] = useState('admin@hrm.com')
  const [password, setPassword] = useState('admin123')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)
  const { signIn, hasPermission } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from?.pathname as string | undefined

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) {
      toast.error('Sign-in failed', { description: error })
      return
    }
    toast.success('Welcome back')
    const home = getDefaultHomePath(hasPermission)
    const dest = from && from !== '/' ? from : home
    navigate(dest, { replace: true })
  }

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background motion-safe:animate-page-enter motion-reduce:animate-none">
      {/* Left: form */}
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl space-y-8">
          <div className="text-center">
            <AppLogo centered className="h-64 w-full max-w-[560px] min-h-[16rem]" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>

      {/* Right: branded panel */}
      <div className="hidden lg:flex relative items-center justify-center overflow-hidden bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_20%,white,transparent_40%),radial-gradient(circle_at_70%_60%,white,transparent_40%)]" />
        <div className="relative z-10 max-w-lg w-full text-white px-10 text-center">
          <AppLogo centered className="h-80 w-full max-w-[640px] min-h-[20rem] mb-12 brightness-0 invert drop-shadow-sm" />
          <div className="text-sm font-medium opacity-90 mb-3 tracking-wide uppercase">HRM + Payroll ERP</div>
          <h2 className="text-4xl font-semibold leading-tight tracking-tight mb-4">
            Run your team with calm, clarity, and care.
          </h2>
          <p className="text-base opacity-90 leading-relaxed">
            One place for attendance, leave, payroll, and people — built for Pakistan, designed for Industry 4.0.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-3 text-sm">
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="font-medium">Real-time</div>
              <div className="text-xs opacity-80">Attendance & dashboards</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="font-medium">Biometric</div>
              <div className="text-xs opacity-80">ZKTeco + face + GPS</div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <div className="font-medium">Multi-pay</div>
              <div className="text-xs opacity-80">Weekly / 15-day / Monthly</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

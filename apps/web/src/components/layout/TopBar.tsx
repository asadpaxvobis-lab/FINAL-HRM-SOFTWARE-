import { LogOut, KeyRound, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { avatarColorFor, initialsFromName } from '@/lib/utils'
import { GlobalSearch } from '@/components/layout/GlobalSearch'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { AppLogo } from '@/components/branding/AppLogo'

export function TopBar() {
  const { appUser, roles, signOut } = useAuth()
  const navigate = useNavigate()

  const displayName = appUser?.full_name || appUser?.email || 'User'
  const initials = initialsFromName(displayName)
  const seed = appUser?.email ?? displayName
  const colorClass = avatarColorFor(seed)

  return (
    <header className="app-topbar min-h-[7rem] border-b bg-background/95 backdrop-blur sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 gap-3">
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <AppLogo
          centered
          className="h-28 w-auto max-w-[400px] sm:max-w-[480px] shrink-0 lg:hidden"
        />
        <div className="min-w-0 hidden sm:block lg:block">
          <h1 className="text-sm font-semibold tracking-tight truncate">Welcome back</h1>
          {roles.length > 0 && (
            <span className="text-xs text-muted-foreground truncate block">{roles.join(' · ')}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <GlobalSearch />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className={colorClass}>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start leading-tight">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs text-muted-foreground">{appUser?.email}</span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm">{displayName}</span>
                <span className="text-xs text-muted-foreground font-normal">{appUser?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <UserRound className="h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/change-password')}>
              <KeyRound className="h-4 w-4" /> Change password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

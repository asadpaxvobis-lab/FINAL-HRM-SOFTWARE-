import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  className?: string
}

/** Pill sun/moon switch — toggles light ↔ dark (matches dashboard reference UI). */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <div
      className={cn(
        'relative inline-flex h-9 w-[4.5rem] shrink-0 items-center rounded-full border border-border bg-muted/60 p-1',
        className
      )}
      role="group"
      aria-label="Theme"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1 left-1 h-7 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-sm transition-transform duration-200 ease-out',
          isDark && 'translate-x-[calc(100%+0.125rem)]'
        )}
      />
      <button
        type="button"
        onClick={() => setTheme('light')}
        className={cn(
          'relative z-10 flex h-7 flex-1 items-center justify-center rounded-full transition-colors',
          !isDark ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
        )}
        aria-label="Light mode"
        aria-pressed={!isDark}
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setTheme('dark')}
        className={cn(
          'relative z-10 flex h-7 flex-1 items-center justify-center rounded-full transition-colors',
          isDark ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80'
        )}
        aria-label="Dark mode"
        aria-pressed={isDark}
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  )
}

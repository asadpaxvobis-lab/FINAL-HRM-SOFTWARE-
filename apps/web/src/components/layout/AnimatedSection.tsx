import { cn } from '@/lib/utils'

type AnimatedSectionProps = {
  children: React.ReactNode
  className?: string
  /** Stagger delay in ms (used with page-enter animation). */
  delay?: number
}

/** Fade + slide-in block; pair with staggered `delay` for dashboard rows/cards. */
export function AnimatedSection({ children, className, delay = 0 }: AnimatedSectionProps) {
  return (
    <div
      className={cn('motion-safe:animate-page-enter motion-reduce:animate-none', className)}
      style={delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

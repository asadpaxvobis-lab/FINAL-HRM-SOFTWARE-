import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

type PageTransitionProps = {
  children: React.ReactNode
  className?: string
}

/** Fade + slide-in when the route changes (respects reduced motion). */
export function PageTransition({ children, className }: PageTransitionProps) {
  const { pathname } = useLocation()

  return (
    <div
      key={pathname}
      className={cn('motion-safe:animate-page-enter motion-reduce:animate-none', className)}
    >
      {children}
    </div>
  )
}

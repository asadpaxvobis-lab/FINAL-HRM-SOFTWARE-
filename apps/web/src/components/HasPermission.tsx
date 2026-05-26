import type { ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'

type Props = {
  perm: string | string[]
  any?: boolean
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Gates UI by permission. Pass a single perm code or an array.
 * - default: requires ALL listed permissions
 * - any={true}: requires ANY one of the listed permissions
 */
export function HasPermission({ perm, any = false, fallback = null, children }: Props) {
  const { hasPermission } = useAuth()
  const codes = Array.isArray(perm) ? perm : [perm]
  const allowed = any ? codes.some(hasPermission) : codes.every(hasPermission)
  return <>{allowed ? children : fallback}</>
}

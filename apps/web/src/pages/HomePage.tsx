import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getDefaultHomePath } from '@/lib/defaultRoute'
import { DashboardPage } from '@/pages/Dashboard'

export function HomePage() {
  const { hasPermission } = useAuth()

  if (!hasPermission('dashboard.view')) {
    return <Navigate to={getDefaultHomePath(hasPermission)} replace />
  }

  return <DashboardPage />
}

export function DefaultHomeRedirect() {
  const { hasPermission } = useAuth()
  return <Navigate to={getDefaultHomePath(hasPermission)} replace />
}

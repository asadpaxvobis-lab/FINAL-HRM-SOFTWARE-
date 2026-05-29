import { flattenNavItems, navSections } from '@/lib/navigation'

/** Landing page after login — dashboard for admins, otherwise first allowed menu item. */
export function getDefaultHomePath(hasPermission: (code: string) => boolean): string {
  if (hasPermission('dashboard.view')) return '/'
  const items = flattenNavItems(navSections, hasPermission)
  const first = items.find((item) => item.to !== '/')
  return first?.to ?? '/profile'
}

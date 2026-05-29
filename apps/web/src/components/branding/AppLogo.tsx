import { cn } from '@/lib/utils'

const LOGO_SRC = '/safwa-logo.png'

type AppLogoProps = {
  className?: string
  alt?: string
  /** Center the mark (login hero, sidebar banner). */
  centered?: boolean
}

/** SAFWA brand mark — used in sidebar, login, top bar, and printable reports. */
export function AppLogo({ className, alt = 'SAFWA', centered = false }: AppLogoProps) {
  return (
    <img
      src={LOGO_SRC}
      alt={alt}
      className={cn('object-contain', centered ? 'object-center mx-auto' : 'object-left', className)}
    />
  )
}

export { LOGO_SRC }

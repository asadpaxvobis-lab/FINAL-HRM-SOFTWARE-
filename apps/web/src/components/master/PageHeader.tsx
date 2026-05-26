import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

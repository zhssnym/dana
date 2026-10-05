import type { ReactNode } from 'react'

import type { LucideIcon } from '../lib/icons.js'
import { ArrowLeft } from '../lib/icons.js'
import { cn } from './ui/utils.js'

export function ContextPageHeader({
  parent,
  title,
  backLabel,
  icon: Icon,
  heading,
  actions,
  onBack,
  compact = false,
}: {
  readonly parent: string
  readonly title: string
  readonly backLabel?: string
  readonly icon: LucideIcon
  readonly heading: ReactNode
  readonly actions: ReactNode
  readonly onBack: () => void
  readonly compact?: boolean
}): React.JSX.Element {
  return (
    <header className={cn('min-w-0 border-b border-border', compact ? 'pb-3' : 'pb-[var(--space-group)]')}>
      <button
        type="button"
        aria-label={backLabel ?? `Back to ${parent}`}
        className="inline-flex max-w-full items-center gap-1.5 rounded-sm text-xs text-muted-foreground hover:text-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="truncate">{parent}</span>
      </button>
      <div className={cn('flex min-w-0 items-center gap-3', compact ? 'mt-2' : 'mt-4')}>
        <Icon className={cn('shrink-0 text-foreground', compact ? 'size-4' : 'size-6')} strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0 flex-1" title={title}>{heading}</div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
    </header>
  )
}

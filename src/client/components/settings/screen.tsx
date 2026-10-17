// The shared frame for Settings and Trash: one column under a plain title.
import type { ComponentProps, ReactNode } from 'react'

import type { LucideIcon } from '../../lib/icons.js'
import { ScreenHead } from '../../views/usePlace.js'
import { Row } from '../ui/row.js'
import { cn } from '../ui/utils.js'

export function Screen({
  title,
  icon,
  description,
  actions,
  bleed = true,
  children,
}: {
  readonly title: string
  readonly icon?: LucideIcon
  readonly description?: ReactNode
  // At most one quiet control on the title's line.
  readonly actions?: ReactNode
  // Clickable rows bleed their padding into the gutter so labels align with the title.
  // Settings' rows are not clickable and sit on the edges.
  readonly bleed?: boolean
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <div className="w-full pb-16">
      <div className="pb-6">
        <ScreenHead
          title={title}
          {...(icon === undefined ? {} : { icon })}
          {...(actions === undefined ? {} : { controls: actions })}
          {...(description === undefined ? {} : { fact: description })}
        />
      </div>
      <div className={bleed ? '-mx-2' : undefined}>{children}</div>
    </div>
  )
}

// A titled section with a rule under its heading, as in Notion's settings. The untitled
// destructive tail gets only the rule.
export function SettingsSection({
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & { readonly title?: string }): React.JSX.Element {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col [&+&]:mt-(--settings-section-gap)', className)}
      {...props}
    >
      <div className="mx-2 border-b border-border pb-3">
        {title === undefined ? null : <h2 className="text-base font-section text-foreground">{title}</h2>}
      </div>
      <div className="flex flex-col pt-1">{children}</div>
    </section>
  )
}

// A label with a one-line description and the control at the right. On a phone the
// control stays on the label's line and the description wraps.
export function StackingRow({ className, label, ...props }: ComponentProps<typeof Row>): React.JSX.Element {
  return (
    <Row
      label={<span className="font-section">{label}</span>}
      className={cn(
        'gap-4 py-(--settings-row-padding) max-sm:gap-3',
        className,
      )}
      {...props}
    />
  )
}

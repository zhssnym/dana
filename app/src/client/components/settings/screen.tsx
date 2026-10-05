// The shared frame for Settings and Trash: one column under a plain title.
import type { ComponentProps, ReactNode } from 'react'

import { ScreenHead } from '../../views/usePlace.js'
import { Row, RowGroup } from '../ui/row.js'
import { cn } from '../ui/utils.js'

export function Screen({
  title,
  description,
  actions,
  bleed = true,
  children,
}: {
  readonly title: string
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
          {...(actions === undefined ? {} : { controls: actions })}
          {...(description === undefined ? {} : { fact: description })}
        />
      </div>
      <div className={bleed ? '-mx-2' : undefined}>{children}</div>
    </div>
  )
}

// Headings and whitespace group settings; only the untitled destructive tail gets
// a divider.
export function SettingsSection({
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & { readonly title?: string }): React.JSX.Element {
  return (
    <RowGroup
      title={title}
      divider={title === undefined}
      aria-label={title}
      className={cn(title === undefined && 'pt-1', className)}
      {...props}
    >
      {children}
    </RowGroup>
  )
}

// Compact, aligned with the section heading. On a phone the control stays on the
// label's line and the description wraps.
export function StackingRow({ className, label, ...props }: ComponentProps<typeof Row>): React.JSX.Element {
  return (
    <Row
      label={label}
      className={cn(
        'min-h-9 gap-4 py-1 max-sm:gap-3',
        className,
      )}
      {...props}
    />
  )
}

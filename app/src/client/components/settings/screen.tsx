/*
The frame the account's own screens share: Settings and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between them changes the content and nothing else. No mark, no cover, no
card: the title says where you are.
*/
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
  /* At most one quiet control on the title's line. */
  readonly actions?: ReactNode
  /* Clickable rows bleed their padding into the gutter, so a row's label and
     the title share one left edge while the hover tint has room. Settings'
     rows are not clickable and sit on the edges themselves. */
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

/*
Settings follows the same flat row-group language as the rest of Dana. A
section heading and whitespace do the grouping; ordinary settings do not need
a rounded box around them or a hairline between every row. The one untitled
section is the destructive tail, so it earns the group's single divider.
*/
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

/* Settings' row stays compact and aligned with the section heading. On a phone
   too the control stays on the label's line; a description wraps instead.
   With no card edge to compensate for, the system Row's quiet 8px inset is the
   only horizontal padding. */
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

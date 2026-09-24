/*
The frame the account's own screens share: Settings, People and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between the three from the account menu changes the content and nothing else.
No mark, no cover, no card: the title says where you are.
*/
import type { ComponentProps, ReactNode } from 'react'

import { Row } from '../ui/row.js'
import { cn } from '../ui/utils.js'

export function Screen({
  title,
  description,
  actions,
  children,
}: {
  readonly title: string
  readonly description?: ReactNode
  /* At most one quiet control on the title's line. */
  readonly actions?: ReactNode
  readonly children: ReactNode
}): React.JSX.Element {
  return (
    <div className="w-full pt-2 pb-16">
      <header className="flex items-start justify-between gap-4 pb-6">
        <div className="min-w-0">
          <h1 className="text-[length:var(--text-title-size)] leading-[var(--text-title-line)] font-title text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0 pt-1">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

/* Settings' row: the system Row, with the control stacked under the label
   below the `sm` breakpoint so a phone has one layout. */
export function StackingRow({ className, ...props }: ComponentProps<typeof Row>): React.JSX.Element {
  return (
    <Row
      className={cn('max-sm:flex-wrap max-sm:[&>span:last-child:not(:first-child)]:basis-full', className)}
      {...props}
    />
  )
}

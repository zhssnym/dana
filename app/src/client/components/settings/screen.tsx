/*
The frame the account's own screens share: Settings, People and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between the three from the account menu changes the content and nothing else.
No mark, no cover, no card: the title says where you are.
*/
import type { ComponentProps, ReactNode } from 'react'

import { ScreenHead } from '../../views/usePlace.js'
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
    <div className="w-full pb-16">
      <div className="pb-6">
        <ScreenHead
          title={title}
          {...(actions === undefined ? {} : { controls: actions })}
          {...(description === undefined ? {} : { fact: description })}
        />
      </div>
      {/* Rows bleed their padding into the gutter, so a row's label, a
          group's heading and the title share one left edge. */}
      <div className="-mx-2">
      {children}
      </div>
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

/*
The frame the account's own screens share: Settings and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between them changes the content and nothing else. No mark, no cover, no
card: the title says where you are.
*/
import type { ComponentProps, ReactNode } from 'react'

import { ScreenHead } from '../../views/usePlace.js'
import { Row } from '../ui/row.js'
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
A Settings section, after Hassan's grouped-cards reference (r12): a small
muted label above one rounded, bordered card, its rows split by the one
hairline. Groups stand further apart than a label from its card. An untitled
section (Delete account) is the card alone.
*/
export function SettingsSection({
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & { readonly title?: string }): React.JSX.Element {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-1.5 [&+&]:mt-4', className)}
      {...props}
    >
      {title === undefined ? null : (
        <h2 className="text-xs font-title text-muted-foreground">{title}</h2>
      )}
      <div className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border">
        {children}
      </div>
    </section>
  )
}

/* Settings' row: the system Row inside a card, 12px in from the card's edge,
   36px tall (44 with a description), its label at body weight. On a phone
   too the control stays on the label's line; a description wraps instead. */
export function StackingRow({ className, label, ...props }: ComponentProps<typeof Row>): React.JSX.Element {
  return (
    <Row
      label={label}
      className={cn(
        'min-h-9 gap-4 rounded-none px-3 py-1 max-sm:gap-3',
        className,
      )}
      {...props}
    />
  )
}

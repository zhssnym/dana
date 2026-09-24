/*
The frame the account's own screens share: Settings and Trash.

One column at the page measure, left-aligned under a plain title, so moving
between them changes the content and nothing else. No mark, no cover, no
card: the title says where you are.
*/
import type { ComponentProps, ReactNode } from 'react'

import { ScreenHead } from '../../views/usePlace.js'
import { Row } from '../ui/row.js'
import { Separator } from '../ui/separator.js'
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
A Settings section: a heading clearly above the rows (16/600), one hairline
under it, then its rows. Sections stand well apart, further than rows do, so
the page reads as a few groups rather than one list. Title, headings, rows
and dividers share the column's two edges.
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
      className={cn('flex flex-col [&+&]:mt-10', className)}
      {...props}
    >
      {/* Untitled (Delete account, last): set apart by the divider alone. */}
      {title === undefined ? <Separator /> : (
        <>
          <h2 className="pb-2 text-(length:--text-heading-size) leading-(--text-heading-line) font-title text-foreground">
            {title}
          </h2>
          <Separator />
        </>
      )}
      {children}
    </section>
  )
}

/* Settings' row: the system Row at one height whether or not it carries a
   description, its label at medium weight, on the column's edges; the
   control stacks under the label below the `sm` breakpoint so a phone has
   one layout. */
export function StackingRow({ className, label, ...props }: ComponentProps<typeof Row>): React.JSX.Element {
  return (
    <Row
      label={<span className="font-section">{label}</span>}
      className={cn(
        'min-h-14 px-0 py-2',
        'max-sm:flex-wrap max-sm:[&>span:last-child:not(:first-child)]:basis-full',
        className,
      )}
      {...props}
    />
  )
}

/*
The named regions of 9.1, added to that section at the P8 change control on
2026-08-11.

"Every section a page's structure names is a named region, and a control
inside one is addressed as that control within that region." The ruling exists
because a folder page carries two quick-add rows with identical accessible
names and different specified defaults, and nothing about either input tells
them apart. A landmark is what tells them apart, so a section here is a
landmark and not a `div` with a heading in it.

Two rules this file encodes so no page has to remember them:

- **The region's name is the heading where the section gives one, and the
  datum where it does not.** So `name` is passed explicitly rather than
  inferred from the heading, and Done's day groups and Tasks' folder groups
  pass the folder or the day they were generated from.
- **A collapsible section is a region plus a control carrying the same name,
  and the control's expanded state is what open and collapsed mean.** That is
  the ruling's own sentence, and it is why the control below is a `button`
  with `aria-expanded` rather than anything that merely looks collapsed.

Tasks' Inbox block is the case that fixes the shape: a named region with no
visible heading. A region's name is announced and addressed, not rendered, so
`heading` is optional and `name` never is.
*/
import { useState } from 'react'
import type { ReactNode } from 'react'

interface PageSectionProps {
  /** The region's accessible name. 9.1's table decides it. */
  readonly name: string
  /** The visible heading, where the section gives one. */
  readonly heading?: string
  readonly children: ReactNode
}

export function PageSection({
  name,
  heading,
  children,
}: PageSectionProps): React.JSX.Element {
  return (
    <section aria-label={name}>
      {heading === undefined ? null : <h2>{heading}</h2>}
      {children}
    </section>
  )
}

interface CollapsibleSectionProps {
  readonly name: string
  readonly defaultOpen: boolean
  readonly children: ReactNode
  /** Told when the section opens, so a page can defer the section's fetch. */
  readonly onOpenChange?: (open: boolean) => void
}

export function CollapsibleSection({
  name,
  defaultOpen,
  children,
  onOpenChange,
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section aria-label={name}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            const next = !open
            setOpen(next)
            onOpenChange?.(next)
          }}
        >
          {name}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed. 6 Q7 asserts the completed
          row is not on the page until the section is opened, and a hidden
          element is still on the page to everything but a screen reader. */}
      {open ? children : null}
    </section>
  )
}

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
import { ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Which register a section's heading is drawn in.
 *
 * `section` is the default and is 9.1's own section headings, "Carried over",
 * "Today", "Planned", a folder group's name. `day` is the quieter label a
 * group generated from a date takes, which is Done's day groups: the design
 * draws those small and quiet because the date is a divider between runs of
 * rows rather than a title over a part of the page. Nothing about the region
 * changes with it, so a criterion addressing a section by name is unaffected.
 */
export type HeadingTone = 'section' | 'day'

const HEADING_CLASS: Record<HeadingTone, string> = {
  section: 'section-heading',
  day: 'day-heading',
}

interface PageSectionProps {
  /** The region's accessible name. 9.1's table decides it. */
  readonly name: string
  /** The visible heading, where the section gives one. */
  readonly heading?: string
  readonly tone?: HeadingTone
  readonly children: ReactNode
}

export function PageSection({
  name,
  heading,
  tone = 'section',
  children,
}: PageSectionProps): React.JSX.Element {
  return (
    <section aria-label={name}>
      {heading === undefined ? null : (
        <h2 className={HEADING_CLASS[tone]}>{heading}</h2>
      )}
      {children}
    </section>
  )
}

interface CollapsibleSectionProps {
  readonly name: string
  readonly defaultOpen: boolean
  readonly tone?: HeadingTone
  readonly children: ReactNode
  /** Told when the section opens, so a page can defer the section's fetch. */
  readonly onOpenChange?: (open: boolean) => void
}

export function CollapsibleSection({
  name,
  defaultOpen,
  tone = 'section',
  children,
  onOpenChange,
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section aria-label={name}>
      <h2 className={HEADING_CLASS[tone]}>
        <button
          type="button"
          className="flex items-center gap-2"
          aria-expanded={open}
          onClick={() => {
            const next = !open
            setOpen(next)
            onOpenChange?.(next)
          }}
        >
          {/*
          The disclosure glyph, `aria-hidden` because `aria-expanded` on the
          button is what actually carries the state and is what AC-058 reads.
          It is the second cue rather than the only one, which is the design's
          rule for every state it draws: the arrow is what a sighted reader
          sees and the expanded state is what everything else does.
          */}
          {open ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronRight aria-hidden="true" className="size-4" />
          )}
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

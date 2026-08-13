/*
The named regions of 9.1, added to that section at the P8 change control on
2026-08-11.

"Every section a page's structure names is a named region, and a control
inside one is addressed as that control within that region." The ruling exists
because a page can carry two quick-adds with identical accessible names and
different specified defaults, and nothing about either input tells them apart.
A landmark is what tells them apart, so a section here is a landmark and not a
`div` with a heading in it.

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

**Restyled at P8R session R6 in the designer's vocabulary**, and restyled only:
the classes below are his group heading and his collapsible trigger, read off
`my-day-screen.tsx`, and the elements, the roles and the expanded state are
untouched. The trigger is deliberately still this file's own button rather
than his `Collapsible` primitive, because AC-058's browser half reads the
`aria-expanded` on it and a swap of mechanism there buys nothing this section
asks for.
*/
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

/**
 * Which register a section's heading is drawn in.
 *
 * `section` is 9.1's own section headings, "Carried over", "Today", a folder
 * group's name. `page` is the larger label All gives its two halves, which the
 * design draws as a titled band with a rule beneath it because those two carry
 * whole pages inside them. `day` is a group generated from a date, which is
 * Done's day groups. Nothing about the region changes with any of them, so a
 * criterion addressing a section by name is unaffected.
 */
export type HeadingTone = 'section' | 'page' | 'day'

const HEADING_CLASS: Record<HeadingTone, string> = {
  section:
    'mb-1 truncate px-2 text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]',
  page: 'text-base leading-6 font-semibold text-foreground',
  day: 'mb-1 px-2 text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]',
}

interface PageSectionProps {
  /** The region's accessible name. 9.1's table decides it. */
  readonly name: string
  /** The visible heading, where the section gives one. */
  readonly heading?: string
  readonly tone?: HeadingTone
  /** Drawn beside the heading, which is where the design puts a page glyph. */
  readonly headingMedia?: ReactNode
  readonly children: ReactNode
}

export function PageSection({
  name,
  heading,
  tone = 'section',
  headingMedia,
  children,
}: PageSectionProps): React.JSX.Element {
  return (
    <section aria-label={name}>
      {heading === undefined ? null : tone === 'page' ? (
        <div className="mb-2 flex h-8 items-center gap-2 border-b border-border px-2">
          {headingMedia}
          <h2 className={HEADING_CLASS[tone]}>{heading}</h2>
        </div>
      ) : headingMedia === undefined ? (
        <h2 className={HEADING_CLASS[tone]}>{heading}</h2>
      ) : (
        <div className="mb-1 flex h-7 items-center gap-2 px-2">
          {headingMedia}
          <h2 className="truncate text-[13px] font-semibold text-[var(--color-graphite-700)]">
            {heading}
          </h2>
        </div>
      )}
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
      {/*
      A heading around the control, which 9.4 asks for outright ("recap
      collapsed at bottom (heading 'Done today (N)')") and 9.6 asks for by
      naming a section. The element is the heading and the button inside it is
      the control, so both of 9.1's halves are true of one thing.
      */}
      <h2>
        <button
          type="button"
          className="group/collapse flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-[13px] font-semibold text-[var(--color-graphite-600)] hover:bg-[var(--color-graphite-50)] hover:text-[var(--color-graphite-800)] focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
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
          <ChevronRight
            className={open ? 'size-4 rotate-90 transition-transform' : 'size-4 transition-transform'}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {name}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed. 6 Q7 asserts the completed
          row is not on the page until the section is opened, and a hidden
          element is still on the page to everything but a screen reader. */}
      {open ? <div className="mt-0.5">{children}</div> : null}
    </section>
  )
}

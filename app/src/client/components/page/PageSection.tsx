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

**Every section with a heading collapses, since S17a**, and the sentence
behind that is Imran's of 2026-08-22: "Sections have two types: native
sections and sections added by users, both should be same, only the native
sections can't be deleted or renamed. Right now native sections are not
collapsable which is not good, but they can carry an icon or even a profile
avatar." The folder page's user-made sections had folded since S12 and every
computed section in the product, Today's two groups, Scheduled's rungs,
Assignments' people, All's two halves, was a bare heading that could not. Two
grammars for one idea, which the designer's `task-section.tsx` fixes at the
level of behaviour: there is one section and the only differences are
capabilities. A heading you cannot fold is a heading that cannot get out of
your way.

**A section with no heading still cannot fold, and that is not an exception to
the ruling.** The control the ruling requires carries the section's name, and
a region whose name is a datum rather than a heading has nothing to draw that
control as. Those regions are announced and never rendered, so there is
nothing on screen for a person to want out of the way.

**The mark is inline in the heading and leaves no hole when it is absent.**
Imran's constraint, in the designer's transcription: "if a section does not
carry an icon, the section should not feel like it's lacking something." So
`headingMedia` sits between the chevron and the name rather than in a reserved
slot, and a section without one simply starts its name earlier. The chevron is
the constant left anchor instead, which is honest, because it is the one thing
every section really does have.

**The count is `aria-hidden` and the control's name stays the section's
alone.** AC-176's precedent, which this file already carried for
`CollapsibleSection`: a control named "Completed (2)" is a different string
from "Completed", and 9.1's names table fixes the second. My Day's recap is
the exception it always was, 9.4 spelling the count inside the heading itself.

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
  section: 'truncate text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]',
  page: 'truncate text-base leading-6 font-semibold text-foreground',
  day: 'truncate text-[13px] leading-6 font-semibold text-[var(--color-graphite-700)]',
}

/** The band the heading sits on, the one thing the three tones differ in. */
const BAND_CLASS: Record<HeadingTone, string> = {
  section: 'mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left',
  page: 'mb-2 flex h-8 w-full items-center gap-1.5 border-b border-border px-2 text-left',
  day: 'mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left',
}

const BAND_HOVER =
  'transition-colors outline-none hover:bg-[var(--color-graphite-50)] focus-visible:ring-2 focus-visible:ring-ring/30'

interface PageSectionProps {
  /** The region's accessible name. 9.1's table decides it. */
  readonly name: string
  /** The visible heading, where the section gives one. */
  readonly heading?: string
  readonly tone?: HeadingTone
  /** Drawn beside the heading, which is where the design puts a section's mark. */
  readonly headingMedia?: ReactNode
  /** The quiet figure beside the name, `aria-hidden` so the control keeps its. */
  readonly count?: number
  /** Whether the section starts open. Every computed one does. */
  readonly defaultOpen?: boolean
  readonly children: ReactNode
}

export function PageSection({
  name,
  heading,
  tone = 'section',
  headingMedia,
  count,
  defaultOpen = true,
  children,
}: PageSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)

  /* No heading, no control, and the region is all there is: see the header. */
  if (heading === undefined) {
    return <section aria-label={name}>{children}</section>
  }

  return (
    <section aria-label={name}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
          }}
          className={`group/section ${BAND_CLASS[tone]} ${BAND_HOVER}`}
        >
          {/* `aria-hidden` because `aria-expanded` on the button is what
              carries the state, the rule this file already applied to
              `CollapsibleSection`'s chevron: the arrow is the second cue and
              never the only one. */}
          <ChevronRight
            className={
              open
                ? 'size-4 shrink-0 rotate-90 text-[var(--color-graphite-400)] transition-transform'
                : 'size-4 shrink-0 text-[var(--color-graphite-400)] transition-transform'
            }
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {headingMedia}
          <span className={HEADING_CLASS[tone]}>{heading}</span>
          {count === undefined ? null : (
            <span
              aria-hidden="true"
              className="shrink-0 text-[12px] leading-4 font-normal text-[var(--color-graphite-400)] tabular-nums"
            >
              {count}
            </span>
          )}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed, 6 Q7's rule and the one
          `CollapsibleSection` below already runs on: a hidden element is still
          on the page to everything but a screen reader. */}
      {open ? children : null}
    </section>
  )
}

interface CollapsibleSectionProps {
  readonly name: string
  readonly defaultOpen: boolean
  readonly children: ReactNode
  /** Told when the section opens, so a page can defer the section's fetch. */
  readonly onOpenChange?: (open: boolean) => void
  /**
   * A visible count beside the name, `aria-hidden` so the control's accessible
   * name stays exactly the section's. The folder page's "Completed" needs
   * this: AC-176 matches that name exact, its own comment saying a control
   * named "Completed (2)" would be a different string, while My Day's recap
   * carries its count inside the name because 9.4's heading spells one there.
   */
  readonly count?: number
}

export function CollapsibleSection({
  name,
  defaultOpen,
  children,
  onOpenChange,
  count,
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section aria-label={name}>
      {/*
      A heading around the control, which 9.4 asks for outright ("recap
      collapsed at bottom (heading 'Done today (N)')") and 9.6 asks for by
      naming a section. The element is the heading and the button inside it is
      the control, so both of 9.1's halves are true of one thing.

      It stays its own component rather than folding into `PageSection`, which
      now collapses too, and the designer keeps the two apart for a stated
      reason: the quiet section that *closes* a page "is not a peer of the
      sections that organise it". One is a band, the other is one line.
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
          {count === undefined ? null : (
            <span aria-hidden="true" className="font-normal text-[var(--color-graphite-500)]">
              ({count})
            </span>
          )}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed. 6 Q7 asserts the completed
          row is not on the page until the section is opened, and a hidden
          element is still on the page to everything but a screen reader. */}
      {open ? <div className="mt-0.5">{children}</div> : null}
    </section>
  )
}

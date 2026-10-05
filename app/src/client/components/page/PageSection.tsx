// Named page regions (spec 9.1). A section is a landmark so two identical controls
// can be told apart by region. A collapsible one is a button with aria-expanded.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from '../../lib/icons.js'

/** Heading style only; the region is unchanged by tone. */
export type HeadingTone = 'section' | 'page' | 'day'

const HEADING_CLASS: Record<HeadingTone, string> = {
  section: 'truncate text-sm leading-6 font-medium text-foreground',
  page: 'truncate text-sm leading-6 font-semibold text-foreground',
  day: 'truncate text-sm leading-6 font-medium text-foreground',
}

const BAND_CLASS: Record<HeadingTone, string> = {
  section: 'mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left',
  page: 'mb-2 flex h-8 w-full items-center gap-1.5 border-b border-border px-2 text-left',
  day: 'mb-1 flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left',
}

const BAND_HOVER =
  'transition-colors hover:bg-muted'

interface PageSectionProps {
  /** The region's accessible name (spec 9.1's names table). */
  readonly name: string
  readonly heading?: string
  readonly tone?: HeadingTone
  readonly headingMedia?: ReactNode
  /** `aria-hidden`, so the control's name stays the section's alone (AC-176). */
  readonly count?: number
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

  // No heading means no control: the region is all there is.
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
          {/* `aria-expanded` on the button carries the state; the chevron is decoration. */}
          <ChevronRight
            className={
              open
                ? 'size-4 shrink-0 rotate-90 text-quiet-foreground transition-transform'
                : 'size-4 shrink-0 text-quiet-foreground transition-transform'
            }
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {headingMedia}
          <span className={HEADING_CLASS[tone]}>{heading}</span>
          {count === undefined ? null : (
            <span
              aria-hidden="true"
              className="shrink-0 text-xs leading-4 font-normal text-muted-foreground tabular-nums"
            >
              {count}
            </span>
          )}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed, so it is off the page for every reader. */}
      {open ? children : null}
    </section>
  )
}

interface CollapsibleSectionProps {
  readonly name: string
  readonly defaultOpen: boolean
  readonly children: ReactNode
  /** Lets a page defer the section's fetch until it opens. */
  readonly onOpenChange?: (open: boolean) => void
  /** A visible count, `aria-hidden` so the accessible name stays the section's (AC-176). */
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
      {/* A heading wrapping the button control. Separate from `PageSection`: the quiet
          section that closes a page is one line, not a band. */}
      <h2>
        <button
          type="button"
          className="group/collapse flex h-[var(--control-height)] w-full items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-expanded={open}
          onClick={() => {
            const next = !open
            setOpen(next)
            onOpenChange?.(next)
          }}
        >
          {/* `aria-expanded` carries the state (AC-058 reads it); the chevron is decoration. */}
          <ChevronRight
            className={open ? 'size-4 rotate-90 transition-transform' : 'size-4 transition-transform'}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {name}
          {count === undefined ? null : (
            <span aria-hidden="true" className="font-normal text-supporting-foreground">
              ({count})
            </span>
          )}
        </button>
      </h2>
      {/* Absent rather than hidden while collapsed: tests assert the row is not on the page. */}
      {open ? <div className="mt-0.5">{children}</div> : null}
    </section>
  )
}

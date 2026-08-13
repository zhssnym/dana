/*
The heading every list screen opens with, which the designer draws the same
way on all six: a contextual glyph, the page's name, and one quiet line under
it saying what the page holds.

It is one component rather than six copies for the reason the page states are
one component: six pages each drawing their own header is six chances for one
of them to drift, and the drift is invisible until somebody opens two of them
side by side, which is exactly what produced package P8R.

**It is a page's own header and never the application's.** A `header` element
maps to `banner` only when it is not inside `article`, `aside`, `main`, `nav`
or `section`, and the shell renders every page inside its `main`, so this one
is content. AC-174 asserts the absence of a banner on every page, and that
placement is the shell's requirement rather than this file's freedom.

The subtitles are the designer's own words. Section 9 writes no copy for them
and forbids none: it fixes what a page holds and in what order, and a line
saying "Undated tasks" under a heading reading "Tasks" is presentation of a
rule 9.5 already states. They are transcribed from his screens rather than
paraphrased, which is the same discipline the normative strings get, because a
port that reworded them would be a difference from the prototype and RFC 0002
makes that a defect.
*/
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeading({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly subtitle: string
  /** The one control a header may carry, which is My Day's switch and Planned's modes. */
  readonly actions?: ReactNode
}): React.JSX.Element {
  return (
    <header className="flex min-h-12 items-start justify-between gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          className="mt-0.5 size-6 shrink-0 text-[var(--color-graphite-700)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
            {title}
          </h1>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {actions}
    </header>
  )
}

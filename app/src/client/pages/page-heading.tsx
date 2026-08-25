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
/* The icon module of DES-125, since S8. */
import type { LucideIcon } from '../lib/icons.js'
import type { ReactNode } from 'react'

export function PageHeading({
  icon: Icon,
  title,
  subtitle,
  fact,
  actions,
}: {
  readonly icon: LucideIcon
  readonly title: string
  readonly subtitle: string
  /**
   * The quiet figure beside the name, and only two places have one.
   *
   * DES-149: "the fact rides the title's line; prose sits under it", and "a
   * progress figure, which only Today and a folder have, is the quiet figure
   * beside the name. Tasks, Planned, Important, All and Done are queries, and
   * nothing completes a query, so their fact slot stays empty rather than
   * growing an invented number to fill it." 9.4's head names it in terms, "the
   * fact 'N of M done'".
   */
  readonly fact?: string
  /** The one control a header may carry, which is now People's alone: DES-150
   * moved every place-page's control into the window bar. */
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
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="truncate text-2xl leading-8 font-semibold text-foreground">
              {title}
            </h1>
            {fact === undefined ? null : (
              <span className="shrink-0 text-xs text-muted-foreground">{fact}</span>
            )}
          </div>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {actions}
    </header>
  )
}

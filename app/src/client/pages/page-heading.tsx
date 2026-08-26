/*
The head every place page opens with: the composition the folder page settled,
made shareable.

**Reworked at S17a into DES-149's F3 head, which is the second of the parity
audit's five first-open gaps.** This file drew the v1 header until then, a 24px
glyph inline with the title and a subtitle stacked under it, while the folder
page one click away had moved to a cover, a mark at identity scale and a window
bar. Two compositions, one product, and the pages sit one click apart. The
designer extracted the folder page's head precisely so that every place would
wear it (DES-124's rule, "extracted rather than copied"), and the extraction
never reached the build.

What the composition is, and the order is the whole of it:

    mark
    Title   fact
    description

**A system page's mark is not pickable, and a folder's is.** That difference is
the honest one and it survives the port: a folder is the person's own thing, so
its glyph and colour are theirs to choose (DES-130), while Today's sun is
Dana's, and offering a picker on it would promise a choice that does not exist.
Same geometry, same optical position, no popover, so the two read as one family
without either telling a lie. AC-247 asserts both halves, the absence here and
the presence on `components/page/IdentityHead.tsx`.

**The fact rides the title's line; prose sits under it.** The folder page put
its completion ratio on the baseline and its description below (DES-130 as
Imran revised it), and the places divide the same way: "Starred tasks" is prose
and a progress figure is the quiet figure beside the name. A page with nothing
to count leaves that slot empty rather than inventing a number to fill it.

**Two of the head's five parts are deliberately absent, and this is the
record.** The designer's `page-head.tsx` also carries a cover band, an "Add
cover" affordance and a description a person can rewrite in place, all three
backed in the prototype by a browser-local identity store keyed by the page's
name. Dana has nowhere to put them: 4.19's bundle carries theme, density, the
clock, where a task opens, the pin list, the sidebar order and the saved-view
arrangements, and no column anywhere holds a native page's cover or a person's
own wording for one. 9.4 does ask for an "editable description" in terms, so
this is a gap between a numbered section and the schema rather than a choice,
and adding the column is a change to a frozen section that protocol section 3
puts with the owner. It is escalated to the Integration Steward with a
recommendation rather than improvised here, and until that is ruled on the
description renders as Dana's own sentence for the place, which is what every
one of these pages showed before and what `routes.ts` calls the page's
question.

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
    <header className="pt-2">
      {/*
      The mark at identity scale, standing over the name rather than beside it,
      and not a control: a `div` and never a `button`, for the reason the
      header's second note gives.
      */}
      <div className="-ml-1.5 flex size-10 shrink-0 items-center justify-center text-[var(--color-graphite-800)]">
        <Icon className="size-8" strokeWidth={1.5} aria-hidden="true" />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="min-w-0 truncate text-2xl leading-8 font-semibold text-foreground">
            {title}
          </h1>
          {fact === undefined ? null : (
            <span className="shrink-0 text-xs leading-4 text-muted-foreground tabular-nums">
              {fact}
            </span>
          )}
        </div>
        {actions}
      </div>

      <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{subtitle}</p>
    </header>
  )
}

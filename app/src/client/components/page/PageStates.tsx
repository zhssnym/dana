/*
The four states section 9 gives every page, defined once.

"Every page has five possible states unless narrowed: loading (skeleton rows),
populated, empty (copy below), error (copy below), plus the global offline
banner." The banner is the layout's, because it is global. The other four are
here, and the rule this file establishes is that **a page renders its rows and
declares its empty copy, and never writes a loading or an error treatment of its
own.** A page's own spinner is acquired one page at a time by people each
solving a real problem.

The markup is the shared state patterns: `SkeletonList` for the loading rows,
`InlineError` for the failed read, and `Empty` with its media, header and
description for the empty state, all from `components/`. The two treatments this
file keeps of its own, the 404 answer and the truncation notice, are drawn in
the same vocabulary.

Four things worth reading before extending this.

**The error state is inline and the toast is global.** 9.4 spells it: "global
toast plus inline retry". The toast is raised by the query cache, once, for
every failed read in the client; what is left here is the retry, which has to be
beside the thing that failed. Its copy is 9.1's `READ_FAILED` and never the
toast's, which AC-183 asserts.

**A 404 is not a failure, it is an answer.** 10.2 makes every inaccessible
resource read as nonexistent, and the client's half of that is showing the
person a missing thing rather than a broken application. A folder page that
rendered a generic error for a 404 would leave them unable to tell the two
apart. So it takes the quiet empty treatment and carries no retry: there is
nothing to retry.

**Offline reads are not given their own copy here.** 9.1 makes the banner the
persistent, global statement of that condition, and 10.6's contract is that
reads need network. Adding a second offline message per page would be two
answers to one question.

**The icon is a prop rather than a constant** because it is contextual: a
different one per surface, a calendar check on My Day, a list on Tasks, a star
on Important. No numbered spec section carries this rule, so this comment and
the callers below are the whole of it. It is optional, so a caller with no icon
for its surface renders the copy alone rather than borrowing somebody else's,
and the empty calendar of 9.5 is the exception and stays a bare grid, which
belongs to the calendar rather than to this file.
*/
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from '../../lib/icons.js'

import { ApiError } from '../../api/http.js'
import { InlineError, SkeletonList } from '../state-patterns.js'
import { Button } from '../ui/button.js'

/** The one empty-state line (also used by the 404 answer). */
export const EMPTY_LINE = 'flex min-h-[var(--row-height)] items-center px-2 text-sm text-muted-foreground'

/**
 * An icon, taken by type rather than as an element so a caller passes
 * `CalendarCheck2` and never a size, a stroke or a colour. All three are this
 * file's, which is what keeps one empty state from looking like another's.
 *
 * The type is the icon module's rather than lucide's own: every icon Dana draws
 * is an export of `lib/icons.tsx` and its wrapper is not lucide's
 * `ForwardRefExoticComponent`.
 */
export type StateIcon = LucideIcon

export interface PageQueryState {
  readonly status: 'pending' | 'error' | 'success'
  readonly error: unknown
  readonly refetch: () => unknown
}

interface PageBodyProps {
  readonly query: PageQueryState
  /** True when the request succeeded and the page has nothing to show. */
  readonly isEmpty: boolean
  /** The empty copy section 6 gives this page. Normative; never paraphrased. */
  readonly emptyCopy: string
  /**
   * Ignored: the empty state is one line with no icon. Kept so callers compile.
   */
  readonly emptyIcon?: StateIcon
  /**
   * The `truncated` flag of the six capped bodies of 7.10. Section 6's cap
   * rule ends "the UI shows a notice", and this is where every page shows it,
   * for the reason the four states are here: one treatment or none.
   */
  readonly truncated?: boolean
  readonly children: ReactNode
}

/*
The 404 and the failed read, which are two different things and are drawn as two
different things: the first is an answer and takes the quiet empty treatment,
the second is a failure and takes the destructive alert.

The sentence is one child of one element, which AC-183 turns on: a client that
split it across a title and a description would have changed it.
*/
function NotFound(): React.JSX.Element {
  return (
    <p className={EMPTY_LINE}>
      Not found. This may have been deleted, or it may never have been yours to see.
    </p>
  )
}

/**
 * The one empty state: a single muted line where the first row would be, no
 * icon. AC-158 reads the sentence.
 */
function EmptyState({ copy }: { readonly copy: string }): React.JSX.Element {
  return <p className={EMPTY_LINE}>{copy}</p>
}

export function PageBody({
  query,
  isEmpty,
  emptyCopy,
  truncated = false,
  children,
}: PageBodyProps): React.JSX.Element {
  if (query.status === 'pending') return <SkeletonList />
  if (query.status === 'error') {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />
    return (
      <InlineError
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  if (isEmpty) return <EmptyState copy={emptyCopy} />
  return (
    <>
      {truncated ? <TruncationNotice /> : null}
      {children}
    </>
  )
}

/**
 * The notice section 6's cap rule asks for and spells no copy for.
 *
 * "List responses capped at 1000 rows with truncated flag ... the UI shows a
 * notice." Six of the nine bodies of 7.10 carry the flag and every one of them
 * is a capped list rather than a paginated one, so the notice is the only thing
 * that distinguishes a page showing everything from a page showing a thousand
 * of something. Without it the person reads the end of a list that has not
 * ended, which is worse than a slow page.
 *
 * **The string is 9.1's inline state copy.** The number is not interpolated,
 * deliberately: the flag says rows were dropped and never how many, and a
 * client that spelled "1000" would be transcribing a limit of 10.3 that the
 * response does not report and that a later release may move.
 *
 * `role="status"` rather than an alert: it is a fact about the list, not a
 * failure, and 9.1's toasts are what failures use.
 */
const TRUNCATION_NOTICE =
  'This list is long, so only the first part is shown. Narrow it down to see the rest.'

export function TruncationNotice(): React.JSX.Element {
  // The quiet metadata register, because it is a fact about the list rather
  // than a warning about it. The design draws no such notice, this string
  // being section 6's requirement and nobody's words yet, so it takes the
  // vocabulary's existing quiet tone rather than one of its own.
  return (
    <p role="status" className="px-2 py-2 text-xs leading-4 text-muted-foreground">
      {TRUNCATION_NOTICE}
    </p>
  )
}

/**
 * The end of an infinite list: 9.5's Done and 9.6's Completed section, which
 * Q6 pages by keyset rather than capping.
 *
 * Two controls' worth of behaviour in one, and the pairing is the point. The
 * button is what makes the next page reachable by keyboard and addressable at
 * all, since section 9 names no control here and a page whose only way forward
 * is a scroll position is a page a screen reader cannot finish reading. The
 * observer is what makes it the "infinite scroll" 9.5 asks for rather than a
 * pager: when the control scrolls into view it is pressed, so the ordinary
 * reader never sees it and the keyboard reader always can.
 *
 * `hasNextPage` is 7.10's null cursor and nothing else. An empty page is not
 * an end of list, so nothing here counts rows to decide whether to stop.
 */
export interface InfinitePageState {
  readonly hasNextPage: boolean
  readonly isFetchingNextPage: boolean
  readonly fetchNextPage: () => unknown
}

export function MorePages({ query }: { readonly query: InfinitePageState }): React.JSX.Element | null {
  const button = useRef<HTMLButtonElement | null>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  useEffect(() => {
    const element = button.current
    if (element === null || !hasNextPage || isFetchingNextPage) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void fetchNextPage()
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!hasNextPage) return null
  return (
    <div className="flex justify-center py-4">
      <Button
        type="button"
        ref={button}
        variant="outline"
        className="px-3"
        disabled={isFetchingNextPage}
        onClick={() => {
          void fetchNextPage()
        }}
      >
        Show more
      </Button>
    </div>
  )
}

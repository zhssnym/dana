/*
The four states section 9 gives every page, defined once.

"Every page has five possible states unless narrowed: loading (skeleton rows),
populated, empty (copy below), error (copy below), plus the global offline
banner." The banner is the layout's, because it is global. The other four are
here, and the rule this file establishes is that **a page renders its rows and
declares its empty copy, and never writes a loading or an error treatment of
its own.**

That rule is the reason this role exists. A page that acquires its own spinner
is the hazard the persona names, and it is acquired one page at a time by
people each solving a real problem.

Three things worth reading before extending this.

**The error state is inline and the toast is global.** 9.4 spells it: "global
toast plus inline retry". The toast is raised by the query cache, once, for
every failed read in the client; what is left here is the retry, which has to
be beside the thing that failed.

**A 404 is not a failure, it is an answer.** 10.2 makes every inaccessible
resource read as nonexistent, and the client's half of that is showing the
person a missing thing rather than a broken application. A folder page that
rendered a generic error for a 404 would leave them unable to tell the two
apart, which is what `session-path.spec.ts` measures.

**Offline reads are not given their own copy here.** 9.1 makes the banner the
persistent, global statement of that condition, and 10.6's contract is that
reads need network. Adding a second offline message per page would be two
answers to one question.

**The four states are drawn here at P8D session 2a**, in role 08's vocabulary,
and the rule above is what makes that one edit rather than six. The loading
state was a "Loading" span over three empty list items and is now the design's
skeleton list; the empty state gains the one restrained contextual icon
`docs/design/notes.md` asks for; the error state takes `inline-error` with its
retry beside it. Not one page changed to get any of it, which is the whole
argument for this file.

The icon is a prop rather than a constant because the note's word is
"contextual": the designer draws a different one per surface, a calendar check
on My Day, a list on Tasks, a star on Important. It is optional, so a caller
that has no icon for its surface renders the copy alone rather than borrowing
somebody else's, and the empty calendar of 9.5 is the note's own exception and
stays a bare grid, which is role 09's business and not this file's.
*/
import { useEffect, useRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { CircleAlert, RefreshCw } from 'lucide-react'

import { ApiError } from '../api/http.js'

/**
 * A Lucide icon, taken by type rather than as an element so a caller passes
 * `CalendarCheck2` and never a size, a stroke or a colour. All three are the
 * `empty-state-media` utility's, which is `tokens.css` and not a page.
 */
export type StateIcon = ComponentType<{ readonly 'aria-hidden': 'true' }>

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
   * The one contextual Lucide icon `notes.md` allows above that copy. Optional:
   * a surface the designer drew no icon for shows the sentence alone rather
   * than borrowing one from a page it is not.
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

/**
 * The loading state: 9's skeleton rows.
 *
 * The placeholders are `aria-hidden` and the status message is not, which is
 * what makes a skeleton a skeleton rather than a list of empty rows: a screen
 * reader hears that the page is loading, and a test asking for the task rows
 * of 9.4 finds none, because none of these is one.
 *
 * The bars keep the row's geometry, which is the whole reason a skeleton beats
 * a spinner on these pages: `skeleton-row` is the task row's own height, so
 * the page does not jump when the data lands. The three widths differ because
 * a list of identical bars reads as a pattern rather than as content arriving;
 * they are the design's own proportions from its skeleton example.
 */
function LoadingRows(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite" className="list-card">
      <span className="sr-only">Loading</span>
      <ul aria-hidden="true">
        {/*
        Every length below is a step of the design's own scale rather than a
        number: `size-5` is the checkbox's 20px, `h-3` is 12px, `w-16` is 64px,
        and the three title widths are proportions and not lengths at all.
        */}
        {['w-3/5', 'w-2/5', 'w-1/2'].map((width) => (
          <li key={width} className="skeleton-row">
            <span className="skeleton size-5" />
            <span className={`skeleton h-3 ${width}`} />
            <span className="skeleton ml-auto h-5 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  )
}

/*
The 404 and the failed read, which are two different things and are drawn as
two different things: the first is an answer and takes the quiet empty
treatment, the second is a failure and takes the danger tint.
*/
function NotFound(): React.JSX.Element {
  return (
    <div className="empty-state">
      <p className="empty-state-text">
        Not found. This may have been deleted, or it may never have been yours to see.
      </p>
    </div>
  )
}

function ErrorWithRetry({ retry }: { readonly retry: () => unknown }): React.JSX.Element {
  return (
    <div className="inline-error">
      <CircleAlert aria-hidden="true" className="size-4" />
      <p className="flex-1">Couldn&apos;t load this. Nothing was changed.</p>
      <button
        type="button"
        className="button-base button-default"
        onClick={() => {
          void retry()
        }}
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Try again
      </button>
    </div>
  )
}

/**
 * The empty state: the copy section 6 writes, under the one contextual icon
 * `notes.md` allows. The icon is `aria-hidden`, so nothing about what a screen
 * reader hears on an empty page moved, and AC-171 still reads the sentence.
 */
function EmptyState({
  copy,
  icon: Icon,
}: {
  readonly copy: string
  readonly icon?: StateIcon
}): React.JSX.Element {
  return (
    <div className="empty-state">
      {Icon === undefined ? null : (
        <span className="empty-state-media">
          <Icon aria-hidden="true" />
        </span>
      )}
      <p className="empty-state-text">{copy}</p>
    </div>
  )
}

export function PageBody({
  query,
  isEmpty,
  emptyCopy,
  emptyIcon,
  truncated = false,
  children,
}: PageBodyProps): React.JSX.Element {
  if (query.status === 'pending') return <LoadingRows />
  if (query.status === 'error') {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />
    return <ErrorWithRetry retry={query.refetch} />
  }
  if (isEmpty) return <EmptyState copy={emptyCopy} icon={emptyIcon} />
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
 * is a capped list rather than a paginated one, so the notice is the only
 * thing that distinguishes a page showing everything from a page showing a
 * thousand of something. Without it the person reads the end of a list that
 * has not ended, which is worse than a slow page.
 *
 * **First pass.** Section 6 requires the notice and writes no words for it,
 * unlike the eight empty states it writes sentence by sentence. The string
 * below is this session's and is recorded as an open silence in
 * `src/client/README.md`; design may reword it without a spec change until
 * something rules otherwise. The number is not interpolated, deliberately: the
 * flag says rows were dropped and never how many, and a client that spelled
 * "1000" would be transcribing a limit of 10.3 that the response does not
 * report and that a later release may move.
 *
 * `role="status"` rather than an alert: it is a fact about the list, not a
 * failure, and 9.1's toasts are what failures use.
 */
const TRUNCATION_NOTICE =
  'This list is long, so only the first part is shown. Narrow it down to see the rest.'

function TruncationNotice(): React.JSX.Element {
  // The quiet metadata treatment, because it is a fact about the list rather
  // than a warning about it. The design draws no such notice, this string
  // being section 6's requirement and nobody's words yet, so it takes the
  // vocabulary's existing quiet register instead of a tone of its own.
  return (
    <p role="status" className="meta py-2">
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
      <button
        type="button"
        ref={button}
        className="button-base button-default"
        disabled={isFetchingNextPage}
        onClick={() => {
          void fetchNextPage()
        }}
      >
        Show more
      </button>
    </div>
  )
}

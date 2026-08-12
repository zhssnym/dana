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
*/
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { ApiError } from '../api/http.js'

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
 */
function LoadingRows(): React.JSX.Element {
  return (
    <div role="status" aria-live="polite">
      <span>Loading</span>
      <ul aria-hidden="true">
        <li />
        <li />
        <li />
      </ul>
    </div>
  )
}

function NotFound(): React.JSX.Element {
  return (
    <div>
      <p className="text-body">Not found. This may have been deleted, or it may never have been yours to see.</p>
    </div>
  )
}

function ErrorWithRetry({ retry }: { readonly retry: () => unknown }): React.JSX.Element {
  return (
    <div>
      <p className="text-body">Couldn&apos;t load this. Nothing was changed.</p>
      <button
        type="button"
        onClick={() => {
          void retry()
        }}
      >
        Try again
      </button>
    </div>
  )
}

export function PageBody({
  query,
  isEmpty,
  emptyCopy,
  truncated = false,
  children,
}: PageBodyProps): React.JSX.Element {
  if (query.status === 'pending') return <LoadingRows />
  if (query.status === 'error') {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />
    return <ErrorWithRetry retry={query.refetch} />
  }
  if (isEmpty) return <p className="text-body">{emptyCopy}</p>
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
  return <p role="status">{TRUNCATION_NOTICE}</p>
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
    <button
      type="button"
      ref={button}
      disabled={isFetchingNextPage}
      onClick={() => {
        void fetchNextPage()
      }}
    >
      Show more
    </button>
  )
}

// Loading, error and empty states for every page, defined once. A 404 is an answer,
// not a failure: it shows the not-found line with no retry.
import type { ReactNode } from 'react'
import type { LucideIcon } from '../../lib/icons.js'

import { ApiError } from '../../api/http.js'
import { InlineError, SkeletonList } from '../state-patterns.js'

export const EMPTY_LINE = 'flex min-h-[var(--row-height)] items-center px-2 text-sm text-muted-foreground'

export type StateIcon = LucideIcon

export interface PageQueryState {
  readonly status: 'pending' | 'error' | 'success'
  readonly error: unknown
  readonly refetch: () => unknown
}

interface PageBodyProps {
  readonly query: PageQueryState
  readonly isEmpty: boolean
  /** Fixed copy from the spec; never paraphrased. */
  readonly emptyCopy: string
  /**
   * Ignored: the empty state is one line with no icon. Kept so callers compile.
   */
  readonly emptyIcon?: StateIcon
  /** The capped list's `truncated` flag. */
  readonly truncated?: boolean
  readonly children: ReactNode
}

// The sentence must stay one child of one element (AC-183).
function NotFound(): React.JSX.Element {
  return (
    <p className={EMPTY_LINE}>
      Not found. This may have been deleted, or it may never have been yours to see.
    </p>
  )
}

/** One muted line where the first row would be (AC-158 reads it). */
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

/** The response says rows were dropped, never how many, so the notice has no number. */
const TRUNCATION_NOTICE =
  'This list is long, so only the first part is shown. Narrow it down to see the rest.'

export function TruncationNotice(): React.JSX.Element {
  return (
    <p role="status" className="px-2 py-2 text-xs leading-4 text-muted-foreground">
      {TRUNCATION_NOTICE}
    </p>
  )
}

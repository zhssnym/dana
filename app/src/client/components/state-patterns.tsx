/*
The designer's `src/components/state-patterns.tsx`, ported:
the offline banner, the inline failed-read state and the loading skeleton,
which are the page states 9.1 and
section 6 give every page.

**The inline error is the one thing in this file that is rewritten rather
than relabelled, and it is the reason AC-183 exists.** His `InlineError`
renders 9.1's global error toast, "Something went wrong. Nothing was saved.
Try again.", which is wrong here. The two
strings answer different questions. The toast reports that a write did not
land; this line reports that a read did not arrive, so a page showing
"Nothing was saved" where nothing was being saved tells a person something
false about their own data. The line is 9.1's inline state copy,
`READ_FAILED`, and its control is 9.1's "Try again" where his read "Retry".

Both strings live in `ui/copy.ts` rather than here, which is where every
string section 9 fixes and a component renders lives, and AC-183 reads the
failed-read line as one text run: it is one child of one element, so a client
that splits it across a title and a description has changed it.

**The other strings in this file are exact against 9.1 and 10.3**: the
offline banner, the offline-write toast, the error toast and the rate-limit
toast. The empty states are section 6's and arrive as the `copy` prop from
the page layer, which owns them.

`OfflineBanner` keeps `role="status"` and the toasts keep `aria-live`, so an
offline banner that appears while a person is typing announces itself without
moving focus.
*/
/* `CircleAlert` rather than `AlertCircle`: the icon module keeps one name for
   the one drawing, lucide's deprecated alias having drifted onto a second
   meaning before F5 collapsed the two. */
import { CircleAlert as AlertCircle, RefreshCw, WifiOff } from '../lib/icons.js'

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from './ui/alert.js'
import { Button } from './ui/button.js'
import { READ_FAILED, TRY_AGAIN } from './ui/copy.js'
import { Skeleton } from './ui/skeleton.js'
import { cn } from './ui/utils.js'

export function OfflineBanner({ className }: { className?: string }) {
  return (
    <Alert
      className={cn(
        'min-h-[var(--control-height)] rounded-md border-[var(--color-warning-200)] bg-[var(--color-warning-100)] px-3 py-2 text-[var(--color-warning-700)]',
        className,
      )}
      role="status"
    >
      <WifiOff className="size-4" strokeWidth={1.75} aria-hidden="true" />
      <AlertDescription className="text-sm text-[var(--color-warning-700)]">
        You&apos;re offline. Dana needs a connection; changes can&apos;t be saved right now.
      </AlertDescription>
    </Alert>
  )
}

/**
 * 9.1's failed-read state: the line beside the thing that failed, with the
 * "Try again" control of that section's control table.
 *
 * `onRetry` is a callback and this component performs no refetch itself,
 * which is the rule for everything in this directory. A page that renders this state
 * without wiring the callback has rendered a control that does nothing.
 */
export function InlineError({ onRetry }: { onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="min-h-20 pr-28">
      <AlertCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
      <AlertTitle className="text-sm">{READ_FAILED}</AlertTitle>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button
          variant="outline"
          className="h-[var(--control-height)] px-3 text-sm"
          onClick={onRetry}
        >
          <RefreshCw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {TRY_AGAIN}
        </Button>
      </AlertAction>
    </Alert>
  )
}

function SkeletonRow({ short = false }: { short?: boolean }) {
  return (
    <div className="grid min-h-[var(--row-height)] grid-cols-[var(--control-height)_minmax(0,1fr)_7.5rem] items-center gap-2 rounded-md px-1">
      <div className="flex size-[var(--control-height)] items-center justify-center">
        <Skeleton className="size-[var(--checkbox-size)] rounded-sm" />
      </div>
      <Skeleton className={short ? 'h-3.5 w-2/5' : 'h-3.5 w-3/5'} />
      <Skeleton className="ml-auto h-3.5 w-20" />
    </div>
  )
}

export function SkeletonList() {
  return (
    <div
      className="flex flex-col gap-[var(--space-row)]"
      aria-label="Loading tasks"
      aria-busy="true"
    >
      <SkeletonRow />
      <SkeletonRow short />
      <SkeletonRow />
    </div>
  )
}

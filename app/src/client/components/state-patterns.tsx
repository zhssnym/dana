// Shared page states: the offline banner, the failed-read line and the loading
// skeleton. The failed-read line is `READ_FAILED`, not the write-failure toast, and must
// stay one text run (AC-183).
import { CircleAlert as AlertCircle, RefreshCw } from '../lib/icons.js'
import { NOTICE } from '../state/ToastRegion.js'

import {
  Alert,
  AlertAction,
  AlertTitle,
} from './ui/alert.js'
import { Button } from './ui/button.js'
import { READ_FAILED, TRY_AGAIN } from './ui/copy.js'
import { Skeleton } from './ui/skeleton.js'
import { cn } from './ui/utils.js'

// Drawn in the toasts' column, and stays while the connection is down.
export function OfflineBanner({ className }: { className?: string }) {
  return (
    <div className={cn(NOTICE, className)} role="status">
      <span className="min-w-0 flex-1 leading-5">
        You&apos;re offline. Dana needs a connection; changes can&apos;t be saved right now.
      </span>
    </div>
  )
}

/**
 * The failed-read line with "Try again". It performs no refetch: wire `onRetry`, or
 * the control does nothing.
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

/*
 * The one notice column, bottom-centre: toasts, plus the offline notice and undo bar passed as `children`. No
 * icons or dismiss controls. `clearsCapture` lifts it above the phone's floating add button.
 */
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

import { cn } from '../components/ui/utils.js'

import { dismissToast, subscribeToToasts, toastSnapshot } from './toasts.js'
import type { Toast } from './toasts.js'

/** Long enough to read twice; short enough not to outlive the page. */
const TOAST_LIFETIME_MS = 8_000

export const NOTICE =
  'pointer-events-auto flex min-h-[var(--row-height)] max-w-full items-center gap-2 rounded-md bg-foreground px-3 py-1 text-sm text-background shadow-md duration-150 ease-out animate-in fade-in slide-in-from-bottom-1'

/** A notice's text action, in the notice's colours (`size="sm"`). */
export const NOTICE_BUTTON = '-mr-1.5 shrink-0 text-background hover:bg-background/15 active:bg-background/20'

export function ToastRegion({
  clearsCapture = true,
  children,
}: {
  readonly clearsCapture?: boolean
  readonly children?: ReactNode
} = {}): React.JSX.Element {
  const toasts = useSyncExternalStore<readonly Toast[]>(
    subscribeToToasts,
    toastSnapshot,
    toastSnapshot,
  )
  /* Every toast leaves on its own. */
  useEffect(() => {
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        dismissToast(toast.id)
      }, TOAST_LIFETIME_MS),
    )
    return () => {
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [toasts])
  return (
    <div
      className={cn(
        'pointer-events-none fixed left-1/2 z-[60] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2',
        clearsCapture ? 'bottom-20 md:bottom-6' : 'bottom-6',
      )}
    >
      <ul role="status" aria-live="polite" className="contents">
        {toasts.map((toast) => (
          <li key={toast.id} className={NOTICE}>
            <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}

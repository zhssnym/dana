/*
The one place transient messages appear: bottom-centre of the window, one
column, one look (the dark notice). Toasts from `toasts.ts` stack here, and the
shell passes the undo bar in as `children` so it sits in the same column.

The icon is chosen from the message, because the bus carries only strings:
failures get one, plain confirmations ("Link copied") get none.

`clearsCapture` lifts the column above the phone's floating add button where
that button is drawn.
*/
import { useEffect, useSyncExternalStore, type ReactNode } from 'react'

import { CircleAlert, Clock3, WifiOff, X } from '../lib/icons.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../components/ui/utils.js'

import { ERROR_TOAST, OFFLINE_WRITE_TOAST } from './toasts.js'
import { dismissToast, subscribeToToasts, toastSnapshot } from './toasts.js'
import type { Toast } from './toasts.js'

/** Long enough to read twice; short enough not to outlive the page. */
const TOAST_LIFETIME_MS = 8_000

/** The one look every notice in the column shares. */
export const NOTICE =
  'pointer-events-auto flex min-h-[var(--row-height)] max-w-full items-center gap-2 rounded-lg bg-foreground py-1 pr-1 pl-3 text-sm text-background shadow-md duration-150 ease-out animate-in fade-in slide-in-from-bottom-1'

/** A notice's button colours on the dark surface (size stays the control height). */
export const NOTICE_BUTTON = 'text-background hover:bg-background/15 active:bg-background/20'

function toastIcon(message: string): typeof CircleAlert | null {
  if (message === OFFLINE_WRITE_TOAST) return WifiOff
  if (message.startsWith('Too many requests')) return Clock3
  if (message === ERROR_TOAST || message.startsWith('Something went wrong')) return CircleAlert
  return null
}

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
  /* Every toast leaves on its own; the dismiss control is for sooner. */
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
        {toasts.map((toast) => {
          const Icon = toastIcon(toast.message)
          return (
            <li key={toast.id} className={NOTICE}>
              {Icon === null ? null : (
                <Icon className="size-4 shrink-0 text-background/70" strokeWidth={1.75} aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
              <Button
                variant="ghost"
                size="icon"
                className={cn('shrink-0 text-background/70', NOTICE_BUTTON)}
                aria-label="Dismiss message"
                onClick={() => {
                  dismissToast(toast.id)
                }}
              >
                <X className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </li>
          )
        })}
      </ul>
      {children}
    </div>
  )
}

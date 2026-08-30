/*
Where the toasts of 9.1 are rendered. One instance, in the layout.

A live region rather than a dialog: a toast interrupts nothing and is not
dismissed to continue, and 9.1 gives it no action. The dismiss control is this
file's own addition, because a toast with no timer and no control would stay on
the screen forever; the treatment is the designer's `SystemToast` from the
prototype's `state-patterns.tsx`, so the one dark surface in this client is his
and not a second invention.

The icon is chosen from the message rather than passed in, because the bus of
`toasts.ts` deliberately carries only strings: the offline write and the
rate-limit notice are the two messages 9.1 distinguishes by kind, and every
other failure is the one global error toast.

The stack sits above the floating add button's corner (the prototype clears it
at 76px) so a toast never covers the control a person is most likely to be
reaching for when a write fails.
*/
import { useEffect, useSyncExternalStore } from 'react'

import { AlertCircle, Clock3, WifiOff, X } from 'lucide-react'

import { Button } from '../components/ui/button.js'
import { cn } from '../components/ui/utils.js'

import { OFFLINE_WRITE_TOAST } from './toasts.js'
import { dismissToast, subscribeToToasts, toastSnapshot } from './toasts.js'
import type { Toast } from './toasts.js'

/** Long enough to read twice; short enough not to outlive the page. */
const TOAST_LIFETIME_MS = 8_000

function toastIcon(message: string): typeof AlertCircle {
  if (message === OFFLINE_WRITE_TOAST) return WifiOff
  if (message.startsWith('Too many requests')) return Clock3
  return AlertCircle
}

/**
 * @param clearsCapture Whether the floating capture button of 9.1 is on this
 * page. The prototype's shell moves its toast up by the button's height where
 * one is drawn and puts it back on the corner where none is, which is the same
 * reasoning the undo bar's bottom-left placement rests on: a notice landing on
 * the one control people press most is a worse fault than the one it reports.
 * Taken at S24 with the rest of the shell.
 */
export function ToastRegion({
  clearsCapture = true,
}: {
  readonly clearsCapture?: boolean
} = {}): React.JSX.Element | null {
  const toasts = useSyncExternalStore<readonly Toast[]>(
    subscribeToToasts,
    toastSnapshot,
    toastSnapshot,
  )
  /* polish: taskcard F1. A toast that nobody dismisses used to stand for
     minutes and across page changes, so an error from three screens ago was
     still telling the person nothing was saved. Every toast now leaves on its
     own after long enough to be read; the dismiss control stays for anyone
     who wants it gone sooner. */
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
  if (toasts.length === 0) return null
  return (
    <div role="status" aria-live="polite">
      <ul
        className={cn(
          'fixed right-6 z-[60] flex w-[360px] flex-col gap-2',
          clearsCapture ? 'bottom-[76px]' : 'bottom-6',
        )}
      >
        {toasts.map((toast) => {
          const Icon = toastIcon(toast.message)
          return (
            <li
              key={toast.id}
              className="flex min-h-12 items-center gap-3 rounded-lg bg-[var(--color-graphite-900)] px-3.5 py-2.5 text-sm text-white shadow-[var(--elevation-2)]"
            >
              <Icon
                className="size-4 shrink-0 text-[var(--color-graphite-300)]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 leading-5">{toast.message}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-[var(--color-graphite-300)] hover:bg-white/10 hover:text-white"
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
    </div>
  )
}

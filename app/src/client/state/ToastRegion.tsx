/*
Where the toasts of 9.1 are rendered. One instance, in the layout.

A live region rather than a dialog: a toast interrupts nothing and is not
dismissed to continue, and 9.1 gives it no action. The dismiss control is this
file's own addition, not section 9's; it is here because a toast with no timer
and no control would stay on the screen forever, and it is marked provisional
in README.md so the Component engineer can replace it with the designed
treatment.
*/
import { useSyncExternalStore } from 'react'

import { dismissToast, subscribeToToasts, toastSnapshot } from './toasts.js'
import type { Toast } from './toasts.js'

export function ToastRegion(): React.JSX.Element | null {
  const toasts = useSyncExternalStore<readonly Toast[]>(
    subscribeToToasts,
    toastSnapshot,
    toastSnapshot,
  )
  if (toasts.length === 0) return null
  return (
    /*
    `toast` is on the list rather than on each message, which is a compromise
    and is recorded as one. The class the design implies is a *region* that
    stacks one card per message and clears the floating action beneath it, and
    the vocabulary role 08 landed carries only the card. Putting the card on
    each `li` would pin every message to the same fixed corner, so several
    would sit exactly on top of each other; putting it here renders a single
    message exactly as designed and renders several as one panel of lines,
    which is wrong in a way a reader can still read. Requested as
    `toast-region` in this session's final block.

    The dismiss control is deliberately unstyled: this surface is graphite-900
    and every button tone in the vocabulary is inked for a light one, so an
    inherited white is the readable answer and a `button-quiet` here would be
    graphite-700 on near-black. Its own header already marks it provisional.
    */
    <div role="status" aria-live="polite">
      <ul className="toast flex-col">
        {toasts.map((toast) => (
          <li key={toast.id} className="flex w-full items-center gap-3">
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => {
                dismissToast(toast.id)
              }}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

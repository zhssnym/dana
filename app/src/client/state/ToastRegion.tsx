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
    The region stacks one card per message and clears the floating action
    beneath it; `toast` alone is fixed and would pin every message to the same
    corner, which is what this rendered before the Component engineer's return
    minted the pair. `button-inverse` is the one control tone for a dark
    surface: this card is graphite-900 and every other tone is inked for a
    light one, so the dismiss control was inheriting white by accident.
    */
    <div role="status" aria-live="polite">
      <ul className="toast-region">
        {toasts.map((toast) => (
          <li key={toast.id} className="toast">
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              className="button-base button-inverse"
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

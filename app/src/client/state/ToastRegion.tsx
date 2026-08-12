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
    <div role="status" aria-live="polite">
      <ul>
        {toasts.map((toast) => (
          <li key={toast.id}>
            <span>{toast.message}</span>
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

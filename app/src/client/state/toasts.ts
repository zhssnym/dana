/*
The toast bus of 9.1.

A store rather than a React context, and that is the whole design decision
here. Section 9 gives failed requests one global toast and offline writes
another, and 8.3 gives this client one invalidation strategy; both are
properties of the query layer, and the query layer is constructed once, above
React, in `api/queryClient.ts`. A context would put the only thing that can
raise a toast inside the tree that the thing raising it is not in.

So this module is plain and subscribable, `ToastRegion` renders whatever it
holds, and no page ever calls it: a page that catches its own request error
and shows its own message is exactly the per-page treatment the shared states
exist to prevent.
*/

export interface Toast {
  readonly id: number
  readonly message: string
}

/** 9.1, the global error toast for failed requests. Copy is normative. */
export const ERROR_TOAST = 'Something went wrong. Nothing was saved. Try again.'

/** 9.1, what a write attempted offline shows. Copy is normative. */
export const OFFLINE_WRITE_TOAST = "Couldn't save. You're offline."

type Listener = (toasts: readonly Toast[]) => void

let toasts: readonly Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()

function publish(): void {
  for (const listener of listeners) listener(toasts)
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function toastSnapshot(): readonly Toast[] {
  return toasts
}

export function showToast(message: string): void {
  // Deduplicated on message rather than counted. Two identical failures are
  // one thing a person needs to know, and 8.3's refetch-on-focus can raise
  // the same failure again the moment the tab comes back.
  if (toasts.some((toast) => toast.message === message)) return
  toasts = [...toasts, { id: nextId++, message }]
  publish()
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((toast) => toast.id !== id)
  publish()
}

/** Test and navigation hygiene: nothing here outlives the document. */
export function clearToasts(): void {
  if (toasts.length === 0) return
  toasts = []
  publish()
}

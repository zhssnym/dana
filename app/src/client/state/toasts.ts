/*
 * The toast bus: a plain subscribable store, because the query client that raises toasts lives outside React.
 * Pages never call it directly.
 */

export interface Toast {
  readonly id: number
  readonly message: string
}

/** Spec 9.1 copy, normative. */
export const ERROR_TOAST = 'Something went wrong. Nothing was saved. Try again.'

/** Spec 9.1 copy, normative. */
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
  // Deduplicated by message: refetch on focus can raise the same failure again.
  if (toasts.some((toast) => toast.message === message)) return
  toasts = [...toasts, { id: nextId++, message }]
  publish()
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((toast) => toast.id !== id)
  publish()
}

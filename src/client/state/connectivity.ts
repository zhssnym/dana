/*
 * Whether Dana can reach its server. `navigator.onLine` reads true for a page loaded from the worker cache
 * offline. Sources, most authoritative first: a request that did not complete, a response of any status, the
 * window's online/offline events. The banner can lag by one failed request; no polling.
 */

type Listener = () => void

const listeners = new Set<Listener>()

function initial(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

let online = initial()

function set(next: boolean): void {
  if (online === next) return
  online = next
  for (const listener of listeners) listener()
}

export function reportReachable(): void {
  set(true)
}

export function reportUnreachable(): void {
  set(false)
}

export function isOnline(): boolean {
  return online
}

export function subscribeToConnectivity(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    set(true)
  })
  window.addEventListener('offline', () => {
    set(false)
  })
}

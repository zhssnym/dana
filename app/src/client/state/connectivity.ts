/*
Whether Dana can reach its server, which is what 9.1's banner is about and
what 10.6's ISSUE-19 contract turns on.

**`navigator.onLine` is a hint and cannot be the answer.** It is trustworthy
in one direction and not always in that one: a document loaded from the
service worker's cache while the machine has no connection reports `true`,
measured here under the browser this leg drives, because the flag is set from
the network stack at document creation and a cache hit never asks it. A banner
driven by that flag alone is missing on exactly the load 10.6 exists to make
possible, which is the installed application opening with no network.

So the answer is a small store fed from three sources, in this order of
authority:

- A request that did not complete. That is the condition itself rather than a
  report of it, and `api/http.ts` reports every one.
- A response that arrived, of any status. A 404 or a 422 is the server
  answering, which is proof of a connection.
- The window's own `online` and `offline` events, which are what makes the
  banner appear the moment the connection drops rather than at the next
  request, and `navigator.onLine` when it says false at startup.

The consequence worth stating: the banner can lag the truth by one failed
request on a document that loaded from cache. That is the shortest lag
available without polling, and polling is a request per interval spent on a
question the next real request answers for free.
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

/** A request completed, whatever the server said. */
export function reportReachable(): void {
  set(true)
}

/** A request did not complete. */
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

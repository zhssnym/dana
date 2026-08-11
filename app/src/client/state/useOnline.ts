/*
Whether Dana can reach its server, as a hook.

The judgment lives in `connectivity.ts`, which says why `navigator.onLine`
cannot answer this on its own. Exactly one thing in this client subscribes,
and it is the layout: 9.1's banner is global and persistent while offline, so
a page that asked would be a page with its own offline treatment, which is the
thing the shared states exist to prevent.
*/
import { useSyncExternalStore } from 'react'

import { isOnline, subscribeToConnectivity } from './connectivity.js'

/** Server snapshot: this client never renders anywhere but a browser. */
function serverSnapshot(): boolean {
  return true
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, isOnline, serverSnapshot)
}

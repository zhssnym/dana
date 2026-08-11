/*
Whether this browser believes it has a connection.

The banner of 9.1 is global and persistent while offline, so exactly one thing
in this client subscribes to this and it is the layout. A page that asked
would be a page with its own offline treatment, which is the thing the shared
states exist to prevent.

`navigator.onLine` is trusted in one direction only, which is the direction
that matters here: false means offline, true means "no reason to think
otherwise". A write that fails anyway is caught by `http.ts`, and a read that
fails anyway is an error state.
*/
import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

function snapshot(): boolean {
  return navigator.onLine
}

/** Server snapshot: this client never renders anywhere but a browser. */
function serverSnapshot(): boolean {
  return true
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

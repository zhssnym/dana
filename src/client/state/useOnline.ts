/* Whether Dana can reach its server, as a hook. Only the layout subscribes: the banner is global. */
import { useSyncExternalStore } from 'react'

import { isOnline, subscribeToConnectivity } from './connectivity.js'

/** Server snapshot: this client never renders anywhere but a browser. */
function serverSnapshot(): boolean {
  return true
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToConnectivity, isOnline, serverSnapshot)
}

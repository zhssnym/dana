/*
10.6's update affordance, in the chrome, offered and never taken.

A control rather than a notice: the person is being offered a reload, and
9.1's addressing sentence makes the copy what a screen reader announces and
what a test asks for. It stays on the screen until they act on it, which is
what makes it an offer.
*/
import { useEffect, useState } from 'react'

import { registerServiceWorker, UPDATE_AVAILABLE } from './registerServiceWorker.js'
import type { ServiceWorkerHandle } from './registerServiceWorker.js'

export function UpdatePrompt(): React.JSX.Element | null {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [handle, setHandle] = useState<ServiceWorkerHandle | null>(null)

  useEffect(() => {
    let live = true
    void registerServiceWorker(() => {
      if (live) setNeedRefresh(true)
    }).then((registered) => {
      if (live) setHandle(registered)
    })
    return () => {
      live = false
    }
  }, [])

  if (!needRefresh) return null
  return (
    <button
      type="button"
      onClick={() => {
        handle?.applyUpdate()
      }}
    >
      {UPDATE_AVAILABLE}
    </button>
  )
}

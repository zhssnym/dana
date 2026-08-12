/*
10.6's update affordance, in the chrome, offered and never taken.

A control rather than a notice: the person is being offered a reload, and
9.1's addressing sentence makes the copy what a screen reader announces and
what a test asks for. It stays on the screen until they act on it, which is
what makes it an offer.
*/
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'

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
    /*
    The banner treatment rather than a button's, because this is one of the two
    strips 9.1 puts across the top of the page and it reads as the sibling of
    the offline one. Still a `button`: the copy is what a screen reader
    announces and what AC-100 asks for by role, and pressing it is the whole
    point of an offer that is never taken for you.
    */
    <button
      type="button"
      className="banner banner-update"
      onClick={() => {
        handle?.applyUpdate()
      }}
    >
      <RefreshCw aria-hidden="true" />
      {UPDATE_AVAILABLE}
    </button>
  )
}

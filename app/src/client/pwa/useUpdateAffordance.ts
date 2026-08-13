/*
10.6's update affordance as a piece of state rather than a piece of markup.

Until P8R session R5 this was `UpdatePrompt.tsx`, a component that registered
the worker and rendered its own banner. The designer's shell puts the offer
inside `page-bar.tsx`, which takes `showUpdate` and `onUpdate`, so what the
shell needs from this module is the two values and not a second banner beside
his. The registration, the watch for a worker installing while another
controls the page, and the rule that `skipWaiting` is never called on our own
initiative are unchanged and still live in `registerServiceWorker.ts`.

The copy stays there too, `UPDATE_AVAILABLE`, and `page-bar.tsx` renders the
same string; AC-100 asks for a control carrying it by role and name, which is
9.1's addressing sentence applied to a string 10.6 spells out.
*/
import { useEffect, useState } from 'react'

import { registerServiceWorker } from './registerServiceWorker.js'
import type { ServiceWorkerHandle } from './registerServiceWorker.js'

export interface UpdateAffordance {
  /** Whether a new worker is waiting, which is when 10.6 makes the offer. */
  readonly showUpdate: boolean
  /** Applies the waiting worker. Bound to a click and never called for one. */
  readonly applyUpdate: () => void
}

export function useUpdateAffordance(): UpdateAffordance {
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

  return {
    showUpdate: needRefresh,
    applyUpdate: () => {
      handle?.applyUpdate()
    },
  }
}

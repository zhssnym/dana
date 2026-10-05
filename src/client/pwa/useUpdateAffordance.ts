/*
 * The update affordance (spec 10.6) as state; the shell draws the control. The copy is `UPDATE_AVAILABLE`
 * (AC-100).
 */
import { useEffect, useState } from 'react'

import { registerServiceWorker } from './registerServiceWorker.js'
import type { ServiceWorkerHandle } from './registerServiceWorker.js'

export interface UpdateAffordance {
  /** Whether a new worker is waiting, which is when 10.6 makes the offer. */
  readonly showUpdate: boolean
  /** Applies the waiting worker. Only ever bound to a click. */
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

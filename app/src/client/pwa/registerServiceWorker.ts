

const SCRIPT_URL = '/sw.js'

export interface ServiceWorkerHandle {
  readonly applyUpdate: () => void
}

/** Resolves to a handle even with no worker: in dev, `/sw.js` is not a script and registration fails silently. */
export async function registerServiceWorker(
  onNeedRefresh: () => void,
): Promise<ServiceWorkerHandle> {
  const noop: ServiceWorkerHandle = { applyUpdate: () => undefined }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return noop

  let registration: ServiceWorkerRegistration
  try {
    registration = await navigator.serviceWorker.register(SCRIPT_URL, { scope: '/' })
  } catch {
    return noop
  }

  /*
   * No forced reload: the worker claims clients on activation, so `controllerchange` also fires on a first
   * visit. The reload is bound to the click and waits for the controller.
   */
  let asked = false
  const handle: ServiceWorkerHandle = {
    applyUpdate: () => {
      asked = true
      const waiting = registration.waiting
      if (waiting === null) {
        window.location.reload()
        return
      }
      // The generated worker skips waiting on this message only, so only a click activates it.
      waiting.postMessage({ type: 'SKIP_WAITING' })
    },
  }

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!asked || reloading) return
    reloading = true
    window.location.reload()
  })

  // A version installed on an earlier visit. A set `controller` is what marks an update, not a first install.
  if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
    onNeedRefresh()
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (installing === null) return
    installing.addEventListener('statechange', () => {
      if (installing.state !== 'installed') return
      if (navigator.serviceWorker.controller === null) return
      onNeedRefresh()
    })
  })

  return handle
}

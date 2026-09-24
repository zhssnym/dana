

/** The path the built worker is served from, and the scope it needs. */
const SCRIPT_URL = '/sw.js'

export interface ServiceWorkerHandle {
  /** Applies the waiting version and reloads, only ever from a person's click. */
  readonly applyUpdate: () => void
}

/**
 * Registers the worker and calls `onNeedRefresh` when a new version is waiting.
 *
 * Resolves to a handle even when there is no worker to register: in
 * development, and on any build where the plugin is not wired, `/sw.js` is not
 * a script and registration fails. That is not an error condition for the
 * application, so it is swallowed here rather than surfaced; the page simply
 * has no update to offer.
 */
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
  Whether the person has asked for the update yet.

  This flag is the whole of "no forced reload" on this side. The worker claims
  its clients on activation, so `controllerchange` fires on an ordinary first
  visit as well as after an update, and a reload bound to that event alone
  would reload every first visit and would do it without being asked. So the
  reload below is bound to the click and merely waits for the controller,
  which is the order 10.6 describes: the person chooses, then the new version
  takes over, then the page swaps.
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
      // The generated worker skips waiting on this message and nothing else,
      // so the person's click is the only thing that can activate it.
      waiting.postMessage({ type: 'SKIP_WAITING' })
    },
  }

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!asked || reloading) return
    reloading = true
    window.location.reload()
  })

  // Already waiting when this page loaded: a version installed during an
  // earlier visit and never applied. `controller` being set is what separates
  // an update from a first install, on both paths.
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

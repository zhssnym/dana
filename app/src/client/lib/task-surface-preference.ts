/*
Where a task opens belongs to the person, not to one browser.

`user_settings.task_open` is the record for all three choices: dialog, panel,
and tab. localStorage is only its fast mirror, so the first task can open in
the expected place while the settings bundle is still loading. Once that
bundle arrives it wins and refreshes the mirror, exactly like the theme.

The client calls the panel `right` while the API calls it `panel`; this module
is the only place that translates between those spellings.
*/

import { useEffect, useSyncExternalStore } from 'react'

import { mutateApi } from '../api/http.js'
import { queryKeys } from '../api/keys.js'
import { queryClient, writeFailureMessage } from '../api/queryClient.js'
import { useBundle } from '../api/queries.js'
import { getSettingsResponse } from '../../shared/bundle.js'
import type { GetSettingsResponse, SettingsBundle } from '../../shared/bundle.js'
import { showToast } from '../state/toasts.js'

/**
 * Where a task opens, in the prototype's spelling, which is what every lifted
 * surface switches on.
 *
 * Kept in step with `TaskOpenMode` by the type-check at its call sites; the
 * union is restated here so this module depends on no component.
 */
export type TaskSurfacePreference = 'dialog' | 'right'

/** The API and local mirror deliberately use the same spelling. */
type StoredMode = SettingsBundle['task_open']

const KEY = 'dana.taskSurface'

/** 9.3's default, and what this answers before anyone has chosen. */
const DEFAULT = 'dialog' satisfies StoredMode

function fromStored(mode: string | null): StoredMode {
  return mode === 'panel' || mode === 'tab' ? mode : DEFAULT
}

export function surfacePreferenceFor(mode: StoredMode): TaskSurfacePreference {
  return mode === 'panel' ? 'right' : DEFAULT
}

function read(): StoredMode {
  try {
    return fromStored(localStorage.getItem(KEY))
  } catch {
    /* Private modes and sandboxed frames throw rather than return null. A
       display preference is not worth failing a render over. */
    return DEFAULT
  }
}

let current: StoredMode = read()
const listeners = new Set<() => void>()
/* Serialize writes so two quick choices cannot reach the server out of order
   and leave the account on the older one. The interface still updates at once. */
let writeQueue: Promise<void> = Promise.resolve()

function mirrorTaskOpen(next: StoredMode): void {
  const changed = next !== current
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* The server remains the record when browser storage is unavailable. */
  }
  if (!changed) return
  listeners.forEach((notify) => {
    notify()
  })
}

/** A shared device must not borrow the previous person's first-paint choice. */
export function clearTaskOpenMirror(): void {
  current = DEFAULT
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* Nothing stored is nothing to clear. */
  }
  listeners.forEach((notify) => {
    notify()
  })
}

export function useTaskOpenPreference(): StoredMode {
  const bundle = useBundle()
  const mirrored = useSyncExternalStore<StoredMode>(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => current,
    () => DEFAULT,
  )
  const recorded = bundle.data?.task_open

  useEffect(() => {
    if (recorded !== undefined) mirrorTaskOpen(recorded)
  }, [recorded])

  return recorded ?? mirrored
}

/**
 * 9.7's "where a task opens" control.
 *
 * The mirror updates immediately for a responsive choice, while the account
 * write makes the same choice follow the person to another browser.
 */
export function setTaskOpen(mode: SettingsBundle['task_open']): void {
  const previous = current
  mirrorTaskOpen(mode)
  const client = queryClient()
  const previousBundle = client?.getQueryData<GetSettingsResponse>(queryKeys.bundle())
  client?.setQueryData<GetSettingsResponse>(queryKeys.bundle(), (bundle) =>
    bundle === undefined ? bundle : { ...bundle, task_open: mode },
  )
  writeQueue = writeQueue.then(async () => {
    try {
      const bundle = await mutateApi(getSettingsResponse, {
        method: 'PATCH',
        path: '/settings',
        body: { task_open: mode },
      })
      /* A newer queued choice already owns the optimistic interface. Its
         request will run next, so an older response must not repaint it. */
      if (current !== mode) return
      mirrorTaskOpen(bundle.task_open)
      client?.setQueryData(queryKeys.bundle(), bundle)
      void client?.invalidateQueries()
    } catch (error: unknown) {
      if (current === mode) {
        mirrorTaskOpen(previous)
        client?.setQueryData(queryKeys.bundle(), previousBundle)
        void client?.invalidateQueries()
      }
      showToast(writeFailureMessage(error))
    }
  })
}

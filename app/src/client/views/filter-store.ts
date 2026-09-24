/*
Where a page's View settings live: one entry per page, in `sessionStorage`,
so they survive a reload and a return to the page but never follow a person to
another page or another tab. Storage that throws costs the setting, not the page.
*/
import { useCallback, useSyncExternalStore } from 'react'

import { NO_FILTER, settleFilter } from './filter.js'
import type { PageFilter } from './filter.js'

const KEY_PREFIX = 'dana.filter.'

/* `useSyncExternalStore` needs a stable reference per page until it changes. */
const cache = new Map<string, PageFilter>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const listener of listeners) listener()
}

function load(page: string): PageFilter {
  const cached = cache.get(page)
  if (cached !== undefined) return cached
  let filter = NO_FILTER
  try {
    const stored = window.sessionStorage.getItem(`${KEY_PREFIX}${page}`)
    if (stored !== null) filter = settleFilter(JSON.parse(stored))
  } catch {
    // Unavailable or unparseable storage.
  }
  cache.set(page, filter)
  return filter
}

export function writeFilter(page: string, filter: PageFilter): void {
  cache.set(page, filter)
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${page}`, JSON.stringify(filter))
  } catch {
    // The setting still holds for this page load.
  }
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePageFilter(
  page: string,
): [PageFilter, (next: PageFilter) => void] {
  const filter = useSyncExternalStore(
    subscribe,
    () => load(page),
    () => NO_FILTER,
  )
  const set = useCallback(
    (next: PageFilter) => {
      writeFilter(page, next)
    },
    [page],
  )
  return [filter, set]
}

/*
Where a page's View settings live: one entry per page, in `sessionStorage`,
so they survive a reload and a return to the page but never follow a person to
another page or another tab. Storage that throws costs the setting, not the page.
*/
import { useCallback, useSyncExternalStore } from 'react'

import { NO_FILTER, NO_TASK_FILTER, settleFilter, settleTaskFilter } from './filter.js'
import type { PageFilter, TaskFilter } from './filter.js'

const KEY_PREFIX = 'dana.filter.'
const TASK_KEY_PREFIX = 'dana.task-filter.'

/* `useSyncExternalStore` needs a stable reference per page until it changes. */
const cache = new Map<string, PageFilter>()
const listeners = new Set<() => void>()
const taskCache = new Map<string, TaskFilter>()
const taskListeners = new Set<() => void>()

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

function loadTaskFilter(page: string): TaskFilter {
  const cached = taskCache.get(page)
  if (cached !== undefined) return cached
  let filter = NO_TASK_FILTER
  try {
    const stored = window.sessionStorage.getItem(`${TASK_KEY_PREFIX}${page}`)
    if (stored !== null) filter = settleTaskFilter(JSON.parse(stored))
  } catch {
    // Unavailable or unparseable storage.
  }
  taskCache.set(page, filter)
  return filter
}

function subscribeTaskFilter(listener: () => void): () => void {
  taskListeners.add(listener)
  return () => {
    taskListeners.delete(listener)
  }
}

/** One Work/page definition, reusable by future Task views. */
export function useTaskFilter(
  page: string,
): [TaskFilter, (next: TaskFilter) => void] {
  const filter = useSyncExternalStore(
    subscribeTaskFilter,
    () => loadTaskFilter(page),
    () => NO_TASK_FILTER,
  )
  const set = useCallback(
    (next: TaskFilter) => {
      taskCache.set(page, next)
      try {
        window.sessionStorage.setItem(`${TASK_KEY_PREFIX}${page}`, JSON.stringify(next))
      } catch {
        // The setting still holds for this page load.
      }
      for (const listener of taskListeners) listener()
    },
    [page],
  )
  return [filter, set]
}

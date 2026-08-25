/*
Where a filter lives: one per place-page, for one browser session.

9.1: "A filter belongs to the page and to the session: kept on return to that
page, never carried to another." DES-179 gives both halves their reason and
names the storage in the same breath: "session storage rather than local,
which is the same rule a third time: a filter is working state, not a
preference. Closing the tab ends the session of looking."

**Component state cannot hold this and that is the whole reason the file
exists.** DES-179 opened as a bug, "a filter did not survive leaving the page,
because the shell navigates by full page load and the filter was component
state". AC-222 walks exactly that path, `page.goto` three times, so a store
that lived in memory would report the same red the design session found.

**One key per page, so nothing carries.** The keys are the place keys of
`place-pages.ts`, and a page reads only its own; there is no shape here in
which Today can see what Scheduled was narrowed to.

**`preferences.ts` is the neighbouring file and the two do not merge.** That
one holds the sidebar's width and collapsed state in `localStorage`, because
those are preferences a person keeps. This is `sessionStorage`, per origin and
per tab, never sent, and gone when the tab closes. Both are guarded the same
way, and for the same reason: storage throws rather than answering when a
person has turned site data off, and a page that cannot render because of it
would be a worse failure than one that forgets a narrowing.
*/
import { useCallback, useSyncExternalStore } from 'react'

import { NO_FILTER } from './filter.js'
import type { PageFilter } from './filter.js'

const KEY_PREFIX = 'dana.filter.'

/*
A cache in front of the storage, and it is not an optimisation.
`useSyncExternalStore` requires that `getSnapshot` return the same reference
until something changes; parsing the JSON on every call would hand React a
fresh object each render and loop forever.
*/
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
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored)
      if (typeof parsed === 'object' && parsed !== null) {
        filter = { ...NO_FILTER, ...(parsed as Partial<PageFilter>) }
      }
    }
  } catch {
    // Unavailable or unparseable storage costs the narrowing, not the page.
  }
  cache.set(page, filter)
  return filter
}

/** Sets one page's filter, for this session. */
export function writeFilter(page: string, filter: PageFilter): void {
  cache.set(page, filter)
  try {
    window.sessionStorage.setItem(`${KEY_PREFIX}${page}`, JSON.stringify(filter))
  } catch {
    // As above: the filter still holds for this page load.
  }
  notify()
}

/** Reads one page's filter without subscribing, which the shell needs. */
export function readFilter(page: string): PageFilter {
  return load(page)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * One page's filter and the setter that persists it.
 *
 * The server snapshot is `NO_FILTER`: nothing is prerendered here, but the
 * hook's third argument is what keeps it honest if anything ever is, and it
 * costs a line.
 */
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

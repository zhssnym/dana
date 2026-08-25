/*
The view strip's remembered choice: one preference, across every place-page.

9.1: "The chosen view is one client-side preference across pages; a page not
offering the remembered view falls back to list without forgetting it.
`?mode=` names a view in the URL."

Three things that sentence decides and this file implements.

**One key, not one per page.** A person who works in boards works in boards,
and a preference stored per page would make the same choice seven times. So
the store holds one value and every page reads it.

**Falling back is not forgetting.** `effectiveMode` resolves the remembered
value against what a page offers and answers list when the page cannot draw
it; the stored value is untouched, so leaving Scheduled in calendar mode,
visiting Today, and coming back finds the calendar again. A client that wrote
the fallback back would lose the choice on the first visit to a page that
cannot honour it.

**`?mode=` is a seed rather than a second record.** A link may name a view,
and when one does the value is written to the store and the store answers
every reader afterwards. The alternative, letting the URL win for as long as
it is in the address bar, would leave the strip unable to change the mode it
is showing without also rewriting the address, which is two records of one
fact and 9.1's own reason for one preference.

`localStorage` rather than the session, which is the split `preferences.ts`
and `filter-store.ts` already draw between them: a preference is kept and
working state is not.
*/
import { useCallback, useSyncExternalStore } from 'react'

/** 9.1's three views. List is the ground and every page offers it. */
export type ViewMode = 'list' | 'board' | 'calendar'

const MODE_KEY = 'dana.view-mode'

const MODES: readonly ViewMode[] = ['list', 'board', 'calendar']

function isMode(value: string | null): value is ViewMode {
  return value !== null && (MODES as readonly string[]).includes(value)
}

let cached: ViewMode | null = null
const listeners = new Set<() => void>()

function load(): ViewMode {
  if (cached !== null) return cached
  let mode: ViewMode = 'list'
  try {
    const stored = window.localStorage.getItem(MODE_KEY)
    if (isMode(stored)) mode = stored
  } catch {
    // Storage refused; the session still has a mode, it just is not kept.
  }
  cached = mode
  return mode
}

export function writeViewMode(mode: ViewMode): void {
  cached = mode
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    // As above.
  }
  for (const listener of listeners) listener()
}

/** The remembered value, unresolved. Only `effectiveMode` should show it. */
export function readViewMode(): ViewMode {
  return load()
}

/**
 * The mode a page is actually in: the remembered one where the page offers
 * it, and list where it does not.
 */
export function effectiveMode(
  remembered: ViewMode,
  offered: readonly ViewMode[],
): ViewMode {
  return offered.includes(remembered) ? remembered : 'list'
}

/** `?mode=board` and friends, read off a location's search string. */
export function modeFromSearch(search: string): ViewMode | null {
  const named = new URLSearchParams(search).get('mode')
  return isMode(named) ? named : null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * The mode a page should draw, and the setter its strip calls.
 *
 * `offered` is the page's own row of `place-pages.ts`, so a page that cannot
 * draw a calendar never has to say so twice.
 */
export function useViewMode(
  offered: readonly ViewMode[],
): [ViewMode, (next: ViewMode) => void] {
  const remembered = useSyncExternalStore(
    subscribe,
    load,
    () => 'list' as ViewMode,
  )
  const set = useCallback((next: ViewMode) => {
    writeViewMode(next)
  }, [])
  return [effectiveMode(remembered, offered), set]
}

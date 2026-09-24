/*
The Layout choice (list, linear, board, calendar; linear is a page's own): one remembered preference across
pages, in localStorage. A page that cannot draw the remembered layout shows a
list without forgetting it; `?mode=` seeds the preference.
*/
import { useCallback, useSyncExternalStore } from 'react'

/** 9.1's three views. List is the ground and every page offers it. */
export type ViewMode = 'list' | 'linear' | 'board' | 'calendar'

const MODE_KEY = 'dana.view-mode'

const MODES: readonly ViewMode[] = ['list', 'linear', 'board', 'calendar']

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

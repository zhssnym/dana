/*
The place pages' layout (List, Board, Calendar, as each offers): one remembered
preference across Today, Upcoming and Assigned, in localStorage. A page that
cannot draw the remembered layout shows a list without forgetting it; `?mode=`
seeds the preference. A page's own Work has one rendering (the thread) and no
layout to remember; its retired keys are listed below.
*/
import { useCallback, useSyncExternalStore } from 'react'

/** 9.1's three views. List is the ground and every page offers it. */
export type ViewMode = 'list' | 'board' | 'calendar'

const MODE_KEY = 'dana.view-mode'

/* 'linear' is gone (M4): a device that stored it reads as list, as any
   unknown value does. */
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

/* ----------------------------------------------------------- folder view -- */

/*
A page's own view is retired (M4): Work has one rendering, the thread, so there
is nothing to choose and nothing to remember.

**Retired storage keys, never to be read, renamed or reused:**
`dana.folder-view` (Linear, Board or Freeform, round 5) and Linear's
`dana.linear.state`, `dana.linear.density` and `dana.linear.sort`. Whatever a
device stored under them simply stops mattering; every stored value lands on
the thread. They are named here so nobody takes them for free names; nothing
imports this list, on purpose.
*/
export const RETIRED_STORAGE_KEYS = [
  'dana.folder-view',
  'dana.linear.state',
  'dana.linear.density',
  'dana.linear.sort',
  'dana.folder.show-completed',
] as const

export type FolderView = 'linear' | 'board' | 'freeform'


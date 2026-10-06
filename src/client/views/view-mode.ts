/*
 * The place pages' layout (List, Board, Calendar): one remembered preference in localStorage, seeded by
 * `?mode=`. A page that cannot draw the remembered layout shows a list without forgetting it.
 */
import { useCallback, useSyncExternalStore } from 'react'

/** List is the ground; every page offers it. */
export type ViewMode = 'list' | 'board' | 'calendar'

const MODE_KEY = 'dana.view-mode'

/* 'linear' is gone: a stored value reads as list, as any unknown value does. */
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
    // Storage refused; the mode lasts this session only.
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

/** The remembered mode where the page offers it, else list. */
export function effectiveMode(
  remembered: ViewMode,
  offered: readonly ViewMode[],
): ViewMode {
  return offered.includes(remembered) ? remembered : 'list'
}

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

/** `offered` is the page's row in `place-pages.ts`. */
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

/* Retired storage keys, never to be read, renamed or reused. Nothing imports this list, on purpose. */
export const RETIRED_STORAGE_KEYS = [
  'dana.folder-view',
  'dana.linear.state',
  'dana.linear.density',
  'dana.linear.sort',
  'dana.folder.show-completed',
] as const


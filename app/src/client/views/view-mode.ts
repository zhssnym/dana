/*
The place pages' layout (List, Board, Calendar, as each offers): one remembered
preference across Today, Upcoming and Assigned, in localStorage. A page that
cannot draw the remembered layout shows a list without forgetting it; `?mode=`
seeds the preference. A folder page's view (Linear, Board, Freeform) is its
own preference, below.
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

/* ----------------------------------------------------------- folder view -- */

/*
A page's own view (round 5): Linear, Board or Freeform. Stored apart from the
place pages' layout, so choosing Board on a page no longer turns Assigned into
a board, and choosing Calendar on Upcoming no longer drops every page back to
Freeform. A new key; `dana.view-mode` keeps its meaning for the place pages.
Its first read takes the old key's value once as the default (list is
Freeform), so nobody's current choice moves.
*/
export type FolderView = 'linear' | 'board' | 'freeform'

const FOLDER_VIEW_KEY = 'dana.folder-view'
const FOLDER_VIEWS: readonly FolderView[] = ['linear', 'board', 'freeform']

function isFolderView(value: string | null): value is FolderView {
  return value !== null && (FOLDER_VIEWS as readonly string[]).includes(value)
}

/** A place-page layout read as a page's view: list is Freeform. */
export function folderViewOf(mode: ViewMode | null): FolderView {
  return mode === 'linear' || mode === 'board' ? mode : 'freeform'
}

let folderCached: FolderView | null = null
const folderListeners = new Set<() => void>()

function loadFolderView(): FolderView {
  if (folderCached !== null) return folderCached
  let view: FolderView = 'freeform'
  try {
    const stored = window.localStorage.getItem(FOLDER_VIEW_KEY)
    if (isFolderView(stored)) view = stored
    else {
      const old = window.localStorage.getItem(MODE_KEY)
      view = folderViewOf(isMode(old) ? old : null)
      window.localStorage.setItem(FOLDER_VIEW_KEY, view)
    }
  } catch {
    // Storage refused; the session still has a view.
  }
  folderCached = view
  return view
}

export function writeFolderView(view: FolderView): void {
  folderCached = view
  try {
    window.localStorage.setItem(FOLDER_VIEW_KEY, view)
  } catch {
    // As above.
  }
  for (const listener of folderListeners) listener()
}

function subscribeFolder(listener: () => void): () => void {
  folderListeners.add(listener)
  return () => {
    folderListeners.delete(listener)
  }
}

/** The view every page draws its tasks in, and its setter. */
export function useFolderView(): [FolderView, (next: FolderView) => void] {
  const view = useSyncExternalStore(subscribeFolder, loadFolderView, () => 'freeform' as FolderView)
  return [view, writeFolderView]
}

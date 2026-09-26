/*
The workspace tab strip is session working state, not account data.

The router remains the source of truth for the address on screen. Ordinary
navigation retargets the active tab; choosing a place from the strip's +
control is the one action that adds a tab. Nothing is persisted to the server
or local storage: the strip answers "what am I working with right now?", not
"what should every device remember?".

A tab is keyed by its page pathname for de-duplication. Query/hash state still
travels with the tab, so a Folder can remember the facet or open task it was
showing without turning Purpose / Work / Results / Discussion into another
set of application tabs.
*/
import { useSyncExternalStore } from 'react'

import { paths } from '../routes.js'

export interface Tab {
  readonly id: string
  readonly path: string
}

interface TabState {
  readonly tabs: readonly Tab[]
  readonly activeId: string
}

let counter = 0
function nextId(): string {
  counter += 1
  return `workspace-tab-${String(counter)}`
}

/** The application-level place represented by a URL, excluding page-local state. */
export function tabKey(path: string): string {
  const query = path.indexOf('?')
  const hash = path.indexOf('#')
  const end = Math.min(query < 0 ? path.length : query, hash < 0 ? path.length : hash)
  return path.slice(0, end)
}

const first: Tab = { id: nextId(), path: paths.today }
let state: TabState = { tabs: [first], activeId: first.id }

const listeners = new Set<() => void>()
function publish(): void {
  for (const notify of listeners) notify()
}

export function useTabs(): TabState {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => state,
    () => state,
  )
}

/**
 * Reconcile ordinary router navigation with the working set.
 *
 * If the destination is already represented by another tab, that tab becomes
 * current and takes the exact URL the navigation requested. Otherwise the
 * active tab is retargeted in place, like an address bar.
 */
export function retarget(path: string): void {
  const active = state.tabs.find((tab) => tab.id === state.activeId)
  if (active === undefined || active.path === path) return

  const key = tabKey(path)
  const open = state.tabs.find((tab) => tabKey(tab.path) === key)
  if (open !== undefined && open.id !== state.activeId) {
    state = {
      activeId: open.id,
      tabs: state.tabs.map((tab) => (tab.id === open.id ? { ...tab, path } : tab)),
    }
    publish()
    return
  }

  state = {
    ...state,
    tabs: state.tabs.map((tab) => (tab.id === state.activeId ? { ...tab, path } : tab)),
  }
  publish()
}

/** Add a place beside the active tab, or switch to its existing tab. */
export function openInNewTab(path: string): string {
  const key = tabKey(path)
  const open = state.tabs.find((tab) => tabKey(tab.path) === key)
  if (open !== undefined) {
    state = { ...state, activeId: open.id }
    publish()
    return open.path
  }

  const tab: Tab = { id: nextId(), path }
  const at = state.tabs.findIndex((candidate) => candidate.id === state.activeId)
  const tabs = [...state.tabs]
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab)
  state = { tabs, activeId: tab.id }
  publish()
  return path
}

/** Make a tab current and return the URL the router should show. */
export function selectTab(id: string): string {
  const tab = state.tabs.find((candidate) => candidate.id === id)
  if (tab === undefined) return state.tabs[0]?.path ?? paths.today
  state = { ...state, activeId: id }
  publish()
  return tab.path
}

/** Close one tab; closing the active tab selects its nearest neighbour. */
export function closeTab(id: string, emptyPath: string): string | null {
  const at = state.tabs.findIndex((tab) => tab.id === id)
  if (at < 0) return null

  if (state.tabs.length === 1) {
    const fresh: Tab = { id: nextId(), path: emptyPath }
    state = { tabs: [fresh], activeId: fresh.id }
    publish()
    return emptyPath
  }

  const tabs = state.tabs.filter((tab) => tab.id !== id)
  if (id !== state.activeId) {
    state = { ...state, tabs }
    publish()
    return null
  }

  const neighbour = tabs[at] ?? tabs[at - 1]
  if (neighbour === undefined) return null
  state = { tabs, activeId: neighbour.id }
  publish()
  return neighbour.path
}

/** Commit a pointer or keyboard reorder. */
export function reorderTabs(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return
  const tabs = [...state.tabs]
  const moved = tabs.splice(from, 1)[0]
  if (moved === undefined) return
  tabs.splice(to, 0, moved)
  state = { ...state, tabs }
  publish()
}

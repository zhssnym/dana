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

Collaboration presentation state belongs to the workspace tab for the same
reason. Discussion or Team can be open in one tab and absent in another; only
the active tab's state is visible. Switching tabs therefore hides a panel
without destroying it, and switching back restores the exact panel state that
tab owned. Discussion's full-screen return path is part of that same state so
one workspace tab can never overwrite another tab's source context. Sidebar
width remains a separate viewer/window preference.
*/
import { useSyncExternalStore } from 'react'

import { paths } from '../routes.js'

export type CollaborationPresentation = 'sidebar' | 'full'
export type DiscussionFilter = 'open' | 'resolved'

export interface DiscussionCollaborationState {
  readonly kind: 'discussion'
  readonly folderId: string
  readonly discussionId: string | null
  readonly filter: DiscussionFilter
  readonly presentation: CollaborationPresentation
  /** Exact page/view/query/hash Discussion should return beside or back to. */
  readonly returnTo: string | null
}

export interface TeamCollaborationState {
  readonly kind: 'team'
  readonly folderId: string
  readonly presentation: CollaborationPresentation
}

export type CollaborationState = DiscussionCollaborationState | TeamCollaborationState

export interface Tab {
  readonly id: string
  readonly path: string
  readonly collaboration: CollaborationState | null
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

function newTab(path: string): Tab {
  return { id: nextId(), path, collaboration: null }
}

const first: Tab = newTab(paths.today)
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

/** The collaboration state owned by the workspace tab currently on screen. */
export function useActiveCollaboration(): CollaborationState | null {
  const current = useTabs()
  return current.tabs.find((tab) => tab.id === current.activeId)?.collaboration ?? null
}

/** Non-hook read for event handlers that must preserve the latest active state. */
export function activeCollaboration(): CollaborationState | null {
  return state.tabs.find((tab) => tab.id === state.activeId)?.collaboration ?? null
}

/** The active tab id, used only for tab-local focus bookkeeping and route ownership. */
export function activeWorkspaceTabId(): string {
  return state.activeId
}

/** Replace the active workspace tab's collaboration presentation state. */
export function setActiveCollaboration(next: CollaborationState | null): void {
  const at = state.tabs.findIndex((tab) => tab.id === state.activeId)
  if (at < 0) return
  const tab = state.tabs[at]
  if (tab === undefined || Object.is(tab.collaboration, next)) return
  const tabs = [...state.tabs]
  tabs[at] = { ...tab, collaboration: next }
  state = { ...state, tabs }
  publish()
}

/** Update the active tab without racing a render-captured collaboration value. */
export function updateActiveCollaboration(
  update: (current: CollaborationState | null) => CollaborationState | null,
): void {
  const current = activeCollaboration()
  const next = update(current)
  if (Object.is(current, next)) return
  setActiveCollaboration(next)
}

function visibleBrowserPath(): string | null {
  if (typeof window === 'undefined') return null
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

/**
 * Commit a known destination to the active workspace tab immediately.
 *
 * Presentation transitions use this before router navigation because the
 * TabStrip's ordinary route reconciliation is intentionally passive. Keeping
 * this explicit path prevents a fast workspace-tab switch from observing the
 * previous Discussion URL.
 */
export function commitActiveTabRoute(path: string): void {
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

/**
 * Reconcile ordinary router navigation with the working set.
 *
 * `ownerId` is the workspace tab that owned the route render which scheduled
 * this passive reconciliation. A workspace-tab click changes `activeId`
 * synchronously before React Router changes the browser URL; without this
 * ownership check, the previous tab's still-pending route effect can retarget
 * the newly selected tab back to the old page. The visible-path check covers
 * the inverse race, where the router has already advanced past an older effect.
 *
 * If the current router destination is already represented by another tab,
 * that tab becomes current and takes the exact URL the navigation requested.
 * Otherwise the active tab is retargeted in place, like an address bar.
 */
export function retarget(path: string, ownerId?: string): void {
  if (ownerId !== undefined && state.activeId !== ownerId) return
  const visible = visibleBrowserPath()
  if (visible !== null && visible !== path) return
  commitActiveTabRoute(path)
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

  const tab = newTab(path)
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
    const fresh = newTab(emptyPath)
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

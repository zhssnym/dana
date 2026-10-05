/*
 * The workspace tab strip: session working state, never persisted. The router owns the address on screen;
 * navigation retargets the active tab, and only the strip's + adds one. Tabs are keyed by pathname. Each tab
 * owns its Discussion and Team presentation state, so switching tabs hides a panel without destroying it.
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
  /** The exact route Discussion returns beside or back to. */
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

interface PendingRoute {
  readonly tabId: string
  readonly path: string
}

let counter = 0
function nextId(): string {
  counter += 1
  return `workspace-tab-${String(counter)}`
}

/** The app-level place for a URL, without page-local state. */
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
/*
 * Selecting a tab and the router drawing it are separate steps. Hold the destination between them, so a passive
 * effect from the previous route cannot write its old address into the new tab.
 */
let pendingRoute: PendingRoute | null = null

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

export function useActiveCollaboration(): CollaborationState | null {
  const current = useTabs()
  return current.tabs.find((tab) => tab.id === current.activeId)?.collaboration ?? null
}

/** Non-hook read for event handlers that need the latest state. */
export function activeCollaboration(): CollaborationState | null {
  return state.tabs.find((tab) => tab.id === state.activeId)?.collaboration ?? null
}

export function activeWorkspaceTabId(): string {
  return state.activeId
}

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

/** Updates the active tab without racing a render-captured value. */
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

function expectRoute(path: string): void {
  pendingRoute = { tabId: state.activeId, path }
}

function applyRoute(path: string): void {
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
 * Used before navigation because the strip's route reconciliation is passive. The destination stays pending
 * until the router shows that exact address.
 */
export function commitActiveTabRoute(path: string): void {
  applyRoute(path)
  expectRoute(path)
}

/**
 * Until the router reaches a pending destination, ignore older route effects. A destination already open in
 * another tab makes that tab current; otherwise the active tab is retargeted.
 */
export function retarget(path: string): void {
  if (pendingRoute !== null) {
    if (state.activeId !== pendingRoute.tabId || path !== pendingRoute.path) return
    const visible = visibleBrowserPath()
    if (visible !== null && visible !== path) return
    pendingRoute = null
  }

  const visible = visibleBrowserPath()
  if (visible !== null && visible !== path) return
  applyRoute(path)
}

export function openInNewTab(path: string): string {
  const key = tabKey(path)
  const open = state.tabs.find((tab) => tabKey(tab.path) === key)
  if (open !== undefined) {
    state = { ...state, activeId: open.id }
    expectRoute(open.path)
    publish()
    return open.path
  }

  const tab = newTab(path)
  const at = state.tabs.findIndex((candidate) => candidate.id === state.activeId)
  const tabs = [...state.tabs]
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab)
  state = { tabs, activeId: tab.id }
  expectRoute(path)
  publish()
  return path
}

/** A sidebar row dropped on the strip. A place already open moves to that slot. */
export function openTabAt(path: string, index: number): string {
  const key = tabKey(path)
  const tabs = [...state.tabs]
  const from = tabs.findIndex((tab) => tabKey(tab.path) === key)
  const tab = from < 0 ? newTab(path) : tabs.splice(from, 1)[0]
  if (tab === undefined) return path
  /* Taking the tab out first shifts every later slot left by one. */
  const at = Math.max(0, Math.min(tabs.length, from >= 0 && from < index ? index - 1 : index))
  tabs.splice(at, 0, tab)
  state = { tabs, activeId: tab.id }
  expectRoute(tab.path)
  publish()
  return tab.path
}

export function selectTab(id: string): string {
  const tab = state.tabs.find((candidate) => candidate.id === id)
  if (tab === undefined) return state.tabs[0]?.path ?? paths.today
  state = { ...state, activeId: id }
  expectRoute(tab.path)
  publish()
  return tab.path
}

/** Closing the active tab selects its nearest neighbour. */
export function closeTab(id: string, emptyPath: string): string | null {
  const at = state.tabs.findIndex((tab) => tab.id === id)
  if (at < 0) return null

  if (state.tabs.length === 1) {
    const fresh = newTab(emptyPath)
    state = { tabs: [fresh], activeId: fresh.id }
    expectRoute(emptyPath)
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
  expectRoute(neighbour.path)
  publish()
  return neighbour.path
}

export function reorderTabs(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= state.tabs.length || to >= state.tabs.length) return
  const tabs = [...state.tabs]
  const moved = tabs.splice(from, 1)[0]
  if (moved === undefined) return
  tabs.splice(to, 0, moved)
  state = { ...state, tabs }
  publish()
}

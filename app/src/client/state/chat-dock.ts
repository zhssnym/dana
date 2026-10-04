/*
The Discussion presentation adapter (issue #546, tab-scoped by #569 and
full-screen-first at the project level by #570).

The selected project/thread/filter/presentation/return context live on the
active workspace tab in `shell/tabs.ts`; this module only gives Discussion
callers a narrow API for that state. Switching workspace tabs therefore
changes the visible presentation without mutating either tab. The sidebar
width is deliberately different: it is a shared viewer/window preference and
remains here in localStorage.

`openChatDock` keeps one compatibility distinction that matters to the UI:
an explicit `discussionId` (including `null`) means "open beside this page",
which is what Task/Work entry points use. Omitting it is the project-level
Discussion entry. A fresh project-level entry opens full screen and remembers
the exact current route; if an existing sidebar is merely following navigation,
it stays a sidebar.
*/
import { useSyncExternalStore } from 'react'

import {
  activeCollaboration,
  activeWorkspaceTabId,
  setActiveCollaboration,
  updateActiveCollaboration,
  useActiveCollaboration,
} from '../shell/tabs.js'
import type { DiscussionFilter } from '../shell/tabs.js'

export interface ChatDockState {
  /** Workspace tab that owns this presentation; used to isolate local UI state. */
  readonly workspaceTabId: string
  /** Any page of the project; the server lists the whole project's threads. */
  readonly folderId: string
  /** The open thread, or null for the project's list of threads. */
  readonly discussionId: string | null
  /** The thread-list filter this workspace tab last used. */
  readonly filter: DiscussionFilter
}

export const DOCK_MIN_WIDTH = 360
export const DOCK_MAX_WIDTH = 720
export const DOCK_DEFAULT_WIDTH = 440
export const DOCK_PAGE_MIN = 560
export const DOCK_SIDEBAR_ROOM = 260

const WIDTH_KEY = 'dana.discussion-sidebar.width'

let width = readWidth()
const openers = new Map<string, HTMLElement>()
const widthListeners = new Set<() => void>()

function notifyWidth(): void {
  widthListeners.forEach((listener) => { listener() })
}

function subscribeWidth(listener: () => void): () => void {
  widthListeners.add(listener)
  return () => widthListeners.delete(listener)
}

function readWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : DOCK_DEFAULT_WIDTH
  } catch {
    return DOCK_DEFAULT_WIDTH
  }
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function dockWidthBounds(windowWidth: number): { readonly min: number; readonly max: number } {
  const max = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, windowWidth - DOCK_PAGE_MIN - DOCK_SIDEBAR_ROOM))
  return { min: DOCK_MIN_WIDTH, max }
}

export function openChatDock(next: {
  readonly folderId: string
  /** Omitted = project-level entry; explicit null = sidebar list. */
  readonly discussionId?: string | null
  readonly filter?: DiscussionFilter
}): void {
  const current = activeCollaboration()
  const tabId = activeWorkspaceTabId()
  const sameDiscussion = current?.kind === 'discussion' && current.folderId === next.folderId
  const followingExistingSidebar =
    next.discussionId === undefined &&
    current?.kind === 'discussion' &&
    current.presentation === 'sidebar'
  const projectEntry = next.discussionId === undefined && !followingExistingSidebar
  const presentation = projectEntry ? 'full' : 'sidebar'

  if (
    presentation === 'sidebar' &&
    !(current?.kind === 'discussion' && current.presentation === 'sidebar') &&
    document.activeElement instanceof HTMLElement
  ) {
    openers.set(tabId, document.activeElement)
  }

  setActiveCollaboration({
    kind: 'discussion',
    folderId: next.folderId,
    discussionId: next.discussionId ?? (projectEntry && sameDiscussion ? current.discussionId : null),
    filter: next.filter ?? (sameDiscussion ? current.filter : 'open'),
    presentation,
    returnTo: projectEntry ? currentPath() : sameDiscussion ? current.returnTo : null,
  })
}

export function openDiscussionFullScreen(next: {
  readonly folderId: string
  readonly discussionId: string | null
  /** Undefined preserves the same Discussion's remembered source. */
  readonly returnTo?: string | null
}): void {
  updateActiveCollaboration((current) => {
    const sameDiscussion = current?.kind === 'discussion' && current.folderId === next.folderId
    const returnTo = next.returnTo === undefined
      ? sameDiscussion ? current.returnTo : null
      : next.returnTo
    if (
      sameDiscussion &&
      current.presentation === 'full' &&
      current.discussionId === next.discussionId &&
      current.returnTo === returnTo
    ) return current
    return {
      kind: 'discussion',
      folderId: next.folderId,
      discussionId: next.discussionId,
      filter: sameDiscussion ? current.filter : 'open',
      presentation: 'full',
      returnTo,
    }
  })
}

export function setChatDockFilter(filter: DiscussionFilter): void {
  updateActiveCollaboration((current) => {
    if (current?.kind !== 'discussion' || current.filter === filter) return current
    return { ...current, filter }
  })
}

export function setDiscussionPresentation(presentation: 'sidebar' | 'full'): void {
  updateActiveCollaboration((current) => {
    if (current?.kind !== 'discussion' || current.presentation === presentation) return current
    return { ...current, presentation }
  })
}

export function closeChatDock(): void {
  const current = activeCollaboration()
  if (current?.kind !== 'discussion') return
  const tabId = activeWorkspaceTabId()
  setActiveCollaboration(null)
  const back = openers.get(tabId)
  openers.delete(tabId)
  if (back?.isConnected === true) back.focus()
}

export function setChatDockWidth(next: number): void {
  const rounded = Math.round(next)
  if (rounded === width) return
  width = rounded
  try {
    window.localStorage.setItem(WIDTH_KEY, String(rounded))
  } catch {
    /* A browser that refuses storage keeps the width for this visit only. */
  }
  notifyWidth()
}

export function useChatDock(): ChatDockState | null {
  const current = useActiveCollaboration()
  if (current?.kind !== 'discussion' || current.presentation !== 'sidebar') return null
  return {
    workspaceTabId: activeWorkspaceTabId(),
    folderId: current.folderId,
    discussionId: current.discussionId,
    filter: current.filter,
  }
}

export function useChatDockWidth(): number {
  return useSyncExternalStore(subscribeWidth, () => width, () => DOCK_DEFAULT_WIDTH)
}

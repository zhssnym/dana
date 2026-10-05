/*
 * Discussion presentation: the state lives on the active workspace tab (`shell/tabs.ts`); this is its narrow
 * API. The width is a per-window preference in localStorage. `openChatDock` always opens beside the page.
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
  /** The workspace tab that owns this presentation. */
  readonly workspaceTabId: string
  /** Any page of the project; the server lists the whole project's threads. */
  readonly folderId: string
  /** The open thread, or null for the list. */
  readonly discussionId: string | null
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

export function dockWidthBounds(windowWidth: number): { readonly min: number; readonly max: number } {
  const max = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, windowWidth - DOCK_PAGE_MIN - DOCK_SIDEBAR_ROOM))
  return { min: DOCK_MIN_WIDTH, max }
}

export function openChatDock(next: {
  readonly folderId: string
  readonly discussionId?: string | null
  readonly filter?: DiscussionFilter
}): void {
  const current = activeCollaboration()
  const tabId = activeWorkspaceTabId()
  const sameDiscussion = current?.kind === 'discussion' && current.folderId === next.folderId

  if (
    !(current?.kind === 'discussion' && current.presentation === 'sidebar') &&
    document.activeElement instanceof HTMLElement
  ) {
    openers.set(tabId, document.activeElement)
  }

  setActiveCollaboration({
    kind: 'discussion',
    folderId: next.folderId,
    discussionId: next.discussionId ?? (sameDiscussion ? current.discussionId : null),
    filter: next.filter ?? (sameDiscussion ? current.filter : 'open'),
    presentation: 'sidebar',
    returnTo: sameDiscussion ? current.returnTo : null,
  })
}

export function openDiscussionFullScreen(next: {
  readonly folderId: string
  readonly discussionId: string | null
  /** Undefined keeps the same Discussion's remembered source. */
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

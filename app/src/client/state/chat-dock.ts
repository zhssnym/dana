/*
PROTOTYPE (experimental/chat-side-panel): the chat dock's state.

The dock is one panel at the window's right edge that holds a project's chat
and its people, and stays open while the person moves around the project. A
task opens its own conversation in it, beside the task rather than instead of
it. Which project, which section and which thread are here, not in the URL,
so opening the dock never navigates.
*/
import { useSyncExternalStore } from 'react'

export interface ChatDockState {
  /** Any page of the project; the server lists the whole project's threads. */
  readonly folderId: string
  readonly section: 'chat' | 'people'
  /** The open thread, or null for the project's list of conversations. */
  readonly discussionId: string | null
}

/** The dock's width in pixels: `--sharing-panel-width` in tokens.css. */
export const CHAT_DOCK_WIDTH = 440

let state: ChatDockState | null = null
/** Widened for reading a long thread; then it covers the page beside it. */
let wide = false
/** "Manage team" was pressed where no page could answer; the next one does. */
let managePending = false
const listeners = new Set<() => void>()
const manageListeners = new Set<() => void>()

function set(next: ChatDockState | null): void {
  state = next
  listeners.forEach((notify) => { notify() })
}

/** Opens the dock, or moves the open dock to another section or thread. */
export function openChatDock(next: {
  readonly folderId: string
  readonly section?: 'chat' | 'people'
  readonly discussionId?: string | null
}): void {
  set({
    folderId: next.folderId,
    section: next.section ?? 'chat',
    discussionId: next.discussionId ?? null,
  })
}

export function closeChatDock(): void {
  wide = false
  if (state !== null) set(null)
}

export function toggleChatDockWide(): void {
  wide = !wide
  listeners.forEach((notify) => { notify() })
}

export function useChatDockWide(): boolean {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => wide,
    () => false,
  )
}

export function useChatDock(): ChatDockState | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => state,
    () => null,
  )
}

/** The dock's "Manage team": the page that owns the full people panel opens it. */
export function manageTeam(): void {
  if (manageListeners.size === 0) managePending = true
  manageListeners.forEach((notify) => { notify() })
}

/** A project page listens; one that mounts after the press answers it too. */
export function onManageTeam(listener: () => void): () => void {
  manageListeners.add(listener)
  if (managePending) {
    managePending = false
    listener()
  }
  return () => manageListeners.delete(listener)
}

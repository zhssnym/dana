/*
The Discussion sidebar's state (issue #546).

Discussion has two presentations: the full-screen Discussion tab, and this
sidebar beside the work. Both draw the same thread from the same server rows;
the sidebar only remembers which project and which thread it shows, never a
copy of the conversation. Kept out of the URL so opening it never navigates
away from the task being discussed.
*/
import { useSyncExternalStore } from 'react'

export interface ChatDockState {
  /** Any page of the project; the server lists the whole project's threads. */
  readonly folderId: string
  /** The open thread, or null for the project's list of threads. */
  readonly discussionId: string | null
}

/** The sidebar's width limits. The upper bound also yields to the window,
 * so the work beside it always keeps room (`dockWidthBounds`). */
export const DOCK_MIN_WIDTH = 360
export const DOCK_MAX_WIDTH = 720
export const DOCK_DEFAULT_WIDTH = 440
/** The room the work keeps beside the sidebar: a readable page plus,
 * roughly, the left sidebar. Below it the sidebar lies over the page. */
export const DOCK_PAGE_MIN = 560
export const DOCK_SIDEBAR_ROOM = 260

/* A new key; never rename it (a rename silently resets everyone's width). */
const WIDTH_KEY = 'dana.discussion-sidebar.width'

let state: ChatDockState | null = null
let width = readWidth()
/* Where focus was when the sidebar opened, so closing hands it back. */
let opener: HTMLElement | null = null
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => { listener() })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : DOCK_DEFAULT_WIDTH
  } catch {
    return DOCK_DEFAULT_WIDTH
  }
}

/** The widths the sidebar may take in a window this wide. */
export function dockWidthBounds(windowWidth: number): { readonly min: number; readonly max: number } {
  const max = Math.max(DOCK_MIN_WIDTH, Math.min(DOCK_MAX_WIDTH, windowWidth - DOCK_PAGE_MIN - DOCK_SIDEBAR_ROOM))
  return { min: DOCK_MIN_WIDTH, max }
}

/** Opens the sidebar, or moves the open one to another project or thread. */
export function openChatDock(next: { readonly folderId: string; readonly discussionId?: string | null }): void {
  if (state === null && document.activeElement instanceof HTMLElement) opener = document.activeElement
  state = { folderId: next.folderId, discussionId: next.discussionId ?? null }
  notify()
}

export function closeChatDock(): void {
  if (state === null) return
  state = null
  notify()
  const back = opener
  opener = null
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
  notify()
}

export function useChatDock(): ChatDockState | null {
  return useSyncExternalStore(subscribe, () => state, () => null)
}

/** The width the person chose; `dockWidthBounds` clamps it to the window. */
export function useChatDockWidth(): number {
  return useSyncExternalStore(subscribe, () => width, () => DOCK_DEFAULT_WIDTH)
}

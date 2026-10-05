/*
 * A sidebar row dragged out of the sidebar onto the tab strip. Outside the sidebar a tab-shaped card follows
 * the pointer; over the strip it becomes a ghost tab, and release opens it there. The ghost's own width is
 * taken out of the slot math.
 */
import { useSyncExternalStore } from 'react'

import type { SortableItemState } from '../lib/use-sortable-list.js'
import { openTabAt } from './tabs.js'

/** What a list's `onOver` answers once the row has left the sidebar, so the list stops proposing a slot. */
export const TAB_STRIP = 'tab-strip'

export interface TabDrag {
  readonly path: string
  readonly x: number
  readonly y: number
  /** The slot over the tab strip; null when the row is loose elsewhere. */
  readonly slot: number | null
}

interface Strip {
  /** The whole bar: a row released anywhere on it opens a tab. */
  readonly bar: HTMLElement
  readonly list: HTMLElement
  readonly go: (path: string) => void
}

let strip: Strip | null = null
let drag: TabDrag | null = null
const listeners = new Set<() => void>()

function publish(next: TabDrag | null): void {
  if (drag === next) return
  drag = next
  listeners.forEach((listener) => { listener() })
}

export function registerTabStrip(next: Strip | null): void {
  strip = next
  if (next === null) publish(null)
}

export function useTabDrag(): TabDrag | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => drag,
    () => null,
  )
}

export function clearTabDrop(): void {
  publish(null)
}

/** Once the row has left the sidebar it stays in its place; the card carries the drag from there. */
export function heldForTab(state: SortableItemState, overKey: string | null): SortableItemState {
  return overKey === TAB_STRIP && state.isActive ? { ...state, offset: 0 } : state
}

function inside(element: Element | null, x: number, y: number): boolean {
  if (element === null) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** The sidebar column on screen (the phone's sheet or the desktop rail). */
function inSidebar(x: number, y: number): boolean {
  return [...document.querySelectorAll('[data-sidebar="sidebar"]')].some((element) => inside(element, x, y))
}

/** The open tabs whose middle is left of `x`. */
function slotAt(list: HTMLElement, x: number): number {
  const ghost = list.querySelector<HTMLElement>('[data-tab-ghost]')
  const ghostWidth = ghost?.getBoundingClientRect().width ?? 0
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
  let index = 0
  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect()
    /* A tab after the ghost sits one ghost-width further right than it will. */
    const after = ghost !== null && (ghost.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    const middle = rect.left + rect.width / 2 - (after ? ghostWidth : 0)
    if (middle < x) index += 1
  }
  return index
}

/**
 * Inside the sidebar: null, and the reorder goes on. Outside: the card follows, a ghost tab over the strip, and
 * the answer is `TAB_STRIP`.
 */
export function sidebarDragOver(point: { x: number; y: number }, path: string | null): string | null {
  if (path === null || inSidebar(point.x, point.y)) {
    publish(null)
    return null
  }
  const slot = strip !== null && inside(strip.bar, point.x, point.y) ? slotAt(strip.list, point.x) : null
  publish({ path, x: point.x, y: point.y, slot })
  return TAB_STRIP
}

/**
 * True whenever released outside the sidebar, so the sidebar keeps its order; on the strip it also opens the
 * tab.
 */
export function sidebarDropAt(point: { x: number; y: number }, path: string | null): boolean {
  const target = strip
  const over = sidebarDragOver(point, path)
  const slot = drag?.slot ?? null
  publish(null)
  if (over === null) return false
  if (target !== null && path !== null && slot !== null) target.go(openTabAt(path, slot))
  return true
}

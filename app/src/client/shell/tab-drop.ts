/*
A sidebar row dragged out of the sidebar, and onto the tab strip.

A page, a collection or a Focus list can be picked up in the sidebar and taken
anywhere on screen. Inside the sidebar the drag is the ordinary reorder. Once
the pointer leaves it, the row comes loose: it stays in its own place, and a
card shaped like a tab, with the row's mark and name, follows the pointer
freely (`TabDragCard` in TabStrip.tsx). Brought over the tab strip, the card
settles into a ghost tab at the slot it would take, and letting go there opens
it as a tab at that slot. Let go anywhere else outside the sidebar and nothing
happens.

The sidebar's rows are sorted by `lib/use-sortable-list.ts`, which asks its
owner two questions about anywhere outside the list: `onOver` while the
pointer moves and `onDropAt` on release. The sidebar's lists answer them with
`sidebarDragOver` and `sidebarDropAt`.

The ghost's slot is worked out from the real tabs' positions with the ghost's
own width taken back out, so the ghost pushing tabs aside never moves the slot
it was computed from.
*/
import { useSyncExternalStore } from 'react'

import type { SortableItemState } from '../lib/use-sortable-list.js'
import { openTabAt } from './tabs.js'

/** What a sidebar list's `onOver` answers once the row has left the sidebar:
 * the list stops proposing a slot of its own. */
export const TAB_STRIP = 'tab-strip'

export interface TabDrag {
  /** The place the dragged row opens. */
  readonly path: string
  /** Where the pointer is. */
  readonly x: number
  readonly y: number
  /** Over the tab strip: the slot the new tab would take. Null when the row
   * is loose elsewhere on screen. */
  readonly slot: number | null
}

interface Strip {
  /** The whole bar: a row released anywhere on it opens a tab. */
  readonly bar: HTMLElement
  /** The tabs themselves, for the slot. */
  readonly list: HTMLElement
  /** Shows the place the new tab names. */
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

/** The tab strip registers itself while mounted. */
export function registerTabStrip(next: Strip | null): void {
  strip = next
  if (next === null) publish(null)
}

/** The row in the air outside the sidebar, for the card and the ghost. */
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

/** Forget the drag: it ended, or came back into the sidebar. */
export function clearTabDrop(): void {
  publish(null)
}

/**
 * A sidebar row's drag state, with the carried row kept in its own place once
 * it has left the sidebar: the card carries the drag from there.
 */
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

/** The slot a release at `x` takes: the open tabs whose middle is left of it. */
function slotAt(list: HTMLElement, x: number): number {
  const ghost = list.querySelector<HTMLElement>('[data-tab-ghost]')
  const ghostWidth = ghost?.getBoundingClientRect().width ?? 0
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')]
  let index = 0
  for (const tab of tabs) {
    const rect = tab.getBoundingClientRect()
    /* A tab after the ghost sits one ghost further right than it will. */
    const after = ghost !== null && (ghost.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    const middle = rect.left + rect.width / 2 - (after ? ghostWidth : 0)
    if (middle < x) index += 1
  }
  return index
}

/**
 * Asked while a sidebar row is in the air (`onOver`). Inside the sidebar it
 * answers null and the reorder goes on as ever. Outside it, the row is loose:
 * the card follows the point, settling into a ghost tab over the strip, and
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
 * Asked on release (`onDropAt`). True whenever the row was let go outside the
 * sidebar, so the sidebar leaves its order alone; on the tab strip it also
 * opens the row as a tab at its slot and shows it.
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

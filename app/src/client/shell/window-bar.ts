/*
The window bar's right-hand slot, as a store (DES-139).

**The problem this solves, in the design's own words.** The bar belongs to the
window and its controls belong to whatever the active tab is showing, so a
screen has to render controls into chrome that is drawn above it. The two
obvious answers are both bad: lifting half a screen's state into the shell so
the shell can draw its controls, or threading a render prop through four
components so the screen can hand them down. The design's answer is neither.
The bar registers its container here and screens portal into it, so a screen
keeps its own state and its controls still land in the chrome.

**Why a DOM node and not a React node.** A store of elements would make the
shell re-render every time any screen changed a control, and it would make two
screens mounted at once fight over one slot. A portal target inverts that: the
screen owns its subtree, React keeps it in the screen's own tree for state and
context, and only the *placement* is the shell's. It is also what makes the
slot safe to be absent, which it is on every render before the bar mounts.

**`WindowBarActions` is the only thing that should read this.** A screen
reaching for the node itself would be a screen writing into the shell's DOM.
*/
import { useSyncExternalStore } from 'react'

let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

/** The bar tells the store where its right-hand container is, once mounted. */
export function setWindowBarSlot(element: HTMLElement | null): void {
  if (slot === element) return
  slot = element
  for (const notify of listeners) notify()
}

export function useWindowBarSlot(): HTMLElement | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => slot,
    () => null,
  )
}

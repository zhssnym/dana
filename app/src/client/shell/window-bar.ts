/*
The window bar's slots, as a store (DES-139).

**The problem this solves, in the design's own words.** The bar belongs to the
window and its controls belong to whatever the active tab is showing, so a
screen has to render controls into chrome that is drawn above it. The two
obvious answers are both bad: lifting half a screen's state into the shell so
the shell can draw its controls, or threading a render prop through four
components so the screen can hand them down. The design's answer is neither.
The bar registers its containers here and screens portal into them, so a
screen keeps its own state and its controls still land in the chrome.

**Why a DOM node and not a React node.** A store of elements would make the
shell re-render every time any screen changed a control, and it would make two
screens mounted at once fight over one slot. A portal target inverts that: the
screen owns its subtree, React keeps it in the screen's own tree for state and
context, and only the *placement* is the shell's. It is also what makes a slot
safe to be absent, which it is on every render before the bar mounts.

**Two slots, one mechanism, and the second is 9.1's sentence rather than a
second invention (S10).** "Its left end holds the active filter's removable
chips; its right end holds the active tab's controls." Those are two places in
the bar, and a screen renders into both: the filter control on the right and
the chips it produces on the left. What would have been a second mechanism is
a second store; what this is instead is one store with a named slot, so the
registration, the subscription and the absent-before-mount case are written
once and `WindowBarActions` gained a prop rather than a sibling.

**`WindowBarActions` is the only thing that should read this.** A screen
reaching for a node itself would be a screen writing into the shell's DOM.
*/
import { useSyncExternalStore } from 'react'

/** The bar's two ends, in 9.1's own terms. */
export type WindowBarSlot = 'chips' | 'controls'

const slots: Record<WindowBarSlot, HTMLElement | null> = {
  chips: null,
  controls: null,
}
const listeners = new Set<() => void>()

/** The bar tells the store where one of its containers is, once mounted. */
export function setWindowBarSlot(slot: WindowBarSlot, element: HTMLElement | null): void {
  if (slots[slot] === element) return
  slots[slot] = element
  for (const notify of listeners) notify()
}

export function useWindowBarSlot(slot: WindowBarSlot): HTMLElement | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => slots[slot],
    () => null,
  )
}

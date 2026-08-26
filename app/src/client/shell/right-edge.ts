/*
A panel that takes room from the page rather than covering it.

The designer's `components/right-edge.tsx`, ported at S17b. His header carries
the decision and the two failed mechanisms behind it, and both halves are worth
keeping because the second is the reason this is a store rather than a
stylesheet.

**DES-186 settled it for the task surface**: "a panel sitting *over* the page
hides the row the task came from, which is the one thing a side-by-side view
exists to keep. If covering were acceptable, the dialog would already be the
better answer." **DES-154 is why it is a mechanism and not two effects that
happen to agree**: it was settled for one panel and forgotten for the other,
and Imran said so on 2026-08-23, "the page is not adjusting when chat is appear
as a right sidebar". A settled behaviour belongs to the mechanism.

**The width is a number in a store, and the elegant version was abandoned
rather than never tried.** His first attempt published the width as a CSS
custom property on the root element and let the shell consume it with
`padding-right: var(--right-panel-width, 0px)`. Measured, "the variable
resolved to `360px` on the very element whose padding resolved to `0px`", and a
hand-set `!important` pixel value on that element computed to `0px` too while
`margin-right` applied fine. His conclusion is the one this file keeps: "a
layout that cannot be explained cannot be relied on, and the next person to
touch it would inherit a puzzle instead of a rule." So nothing resolves at
paint time and the value that lays the page out is a number you can print.

**The width is published rather than lifted.** A panel owns its own width, the
task surface's being resizable and remembered, so threading a live number up
through the shell for the shell to hand back down is a lot of wiring for a fact
with one owner.

**One number for both panels, because they share one edge.** Two open at once
would overlap each other long before the page noticed, so a single value is an
honest description of the space rather than a limitation.

**Why `shell/` and not `components/`, which is where the designer keeps it.**
What this publishes is a shell layout fact: how much of the window the page
body may use. The consumer is `app-shell.tsx`, the shape is the module store
`lib/time-format.ts` already uses for a preference every surface reads, and
`app/src/client/components/**` belongs to the Component engineer while the
shell and its page states belong to the Frontend Architect (personas 07 and
08). Nothing about the mechanism moved with the directory.
*/

import { useEffect, useSyncExternalStore } from 'react'

let reserved = 0
const listeners = new Set<() => void>()

function publish(width: number): void {
  if (reserved === width) return
  reserved = width
  listeners.forEach((notify) => {
    notify()
  })
}

/** What the page should keep clear on its right, in pixels. */
export function useRightEdge(): number {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => reserved,
    /* Server-rendered and first-paint answer: nothing is open, so nothing is
       reserved. Dana has no server render, and the third argument is required
       to be a pure function of nothing rather than of the store. */
    () => 0,
  )
}

/**
 * Reserves `width` on the right edge while the caller is mounted.
 *
 * A hook rather than a wrapper component, because every caller is already
 * rendering the panel that owns the width and a wrapper would exist only to
 * hold an effect. The cleanup publishes zero, which is what makes a panel
 * closing give the room back without anybody remembering to.
 */
export function useReserveRightEdge(width: number, open: boolean): void {
  useEffect(() => {
    if (!open) return undefined
    publish(Math.round(width))
    return () => {
      publish(0)
    }
  }, [width, open])
}

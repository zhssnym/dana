/*
A panel that takes room from the page rather than covering it.

Lifted from `docs/design/prototype-v2/src/components/right-edge.tsx` at S23,
read on `v2-build` at `b316785`. The lift discipline of RFC 0004's
prototype-lift section applies: this file diffs empty against that original
except at the seams named at the foot of this header. The designer's own
reasoning below is kept intact, being the design record for what this does.

**The seams are the two mechanical ones every lifted file takes and no
other**: the `@/` specifiers become this client's relative ESM paths (11.4),
and the em dashes leave under protocol section 7's writing convention.

[[DES-186]] settled this for the task surface: a panel sitting *over* the page
hides the row the task came from, which is the one thing a side-by-side view
exists to keep, if covering were acceptable, the dialog would already be the
better answer.

It was settled for one panel and forgotten for the other. Imran, 2026-08-23:
"the page is not adjusting when chat is appear as a right sidebar." The
conversation panel is the second panel on this right edge and it had the fault
the first one was fixed for, which is [[DES-154]] exactly, and the reason this
is a component rather than two effects that happen to agree.

**And then it still did not adjust, because the first version was too clever.**
That version published the width as a CSS custom property on `<html>` and let
the shell consume it with `padding-right: var(--right-panel-width, 0px)`. On
paper that is elegant: one variable, no wiring, nothing to thread. Measured, the
variable resolved to `360px` on the very element whose padding resolved to
`0px`, and a `!important` pixel value set on that element by hand computed to
`0px` too, while `margin-right` on the same element applied fine. I could not
account for it, and that is the point at which a mechanism has to go rather than
be defended: **a layout that cannot be explained cannot be relied on**, and the
next person to touch it would inherit a puzzle instead of a rule.

So the width is a **number in a store**, and the shell reads it with a hook and
writes a plain pixel padding. Nothing resolves at paint time, nothing depends on
inheritance, and the value that lays the page out is the value you can print.
The elegance is worth exactly what it lays out, which was nothing.

**The width is published rather than lifted**, and that part was right. A panel
owns its own width, the task surface's is resizable and remembered, so
threading a live number up through the shell so the shell can hand it back down
is a lot of wiring for a fact with one owner.

One number for both panels, because they share one edge. Two open at once would
overlap each other long before the page noticed, so a single value is not a
limitation but an honest description of the space.
*/

import { useEffect, useSyncExternalStore, type ReactNode } from "react"

let reserved = 0
const listeners = new Set<() => void>()

function publish(width: number) {
  if (reserved === width) return
  reserved = width
  listeners.forEach((notify) => notify())
}

/* What the page should keep clear on its right, in pixels. */
export function useRightEdge() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => reserved,
    () => 0,
  )
}

export function ReservesRightEdge({
  width,
  children,
}: {
  width: number
  children: ReactNode
}) {
  useEffect(() => {
    publish(Math.round(width))
    return () => publish(0)
  }, [width])
  return <>{children}</>
}

/*
A panel that takes room from the page rather than covering it.

[[DES-186]] settled this for the task surface: a panel sitting *over* the page
hides the row the task came from, which is the one thing a side-by-side view
exists to keep — if covering were acceptable, the dialog would already be the
better answer.

It was settled for one panel and forgotten for the other. Imran, 2026-08-23:
"the page is not adjusting when chat is appear as a right sidebar." The
conversation panel is the second panel on this right edge and it had the fault
the first one was fixed for — which is [[DES-154]] exactly, and the reason this
is a component now instead of two effects that happen to agree.

**The width is published rather than lifted.** A panel owns its own width — the
task surface's is resizable and remembered — so threading a live number up
through the shell so the shell can hand it back down is a lot of wiring for a
fact with one owner. The shell reads one variable; nothing has to be told.

One variable for both, because they share one edge. Two panels open at once
would overlap each other long before the page noticed, so a single number is
not a limitation, it is the honest description of the space.
*/

import { useEffect, type ReactNode } from "react"

export function ReservesRightEdge({
  width,
  children,
}: {
  width: number
  children: ReactNode
}) {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--right-panel-width", `${Math.round(width)}px`)
    return () => {
      root.style.removeProperty("--right-panel-width")
    }
  }, [width])

  return <>{children}</>
}

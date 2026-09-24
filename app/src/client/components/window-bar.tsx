/*
The window bar: the strip at the top of the page area. Left is the way here
(history arrows and the breadcrumb trail, portalled in through WindowBarLead);
right holds the controls for whatever the page is showing (WindowBarActions).
Both ends are module-store slots, so a screen renders into the chrome without
lifting its state into the shell.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

const slots: { lead: HTMLElement | null; trail: HTMLElement | null } = {
  lead: null,
  trail: null,
}
const listeners = new Set<() => void>()

function setSlot(end: "lead" | "trail", next: HTMLElement | null) {
  slots[end] = next
  listeners.forEach((notify) => notify())
}

function useSlot(end: "lead" | "trail") {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => slots[end],
    () => null,
  )
}

/* The strip itself, rendered once by the shell. */
export function WindowBar() {
  return (
    <div className="flex h-[var(--shell-windowbar-height)] shrink-0 items-center gap-1.5 bg-card px-3">
      {/* The left end: history arrows and the breadcrumb trail. */}
      <div
        ref={(node) => setSlot("lead", node)}
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
      />
      <div
        ref={(node) => setSlot("trail", node)}
        className="flex shrink-0 items-center gap-1.5"
      />
    </div>
  )
}

/* The bar's left end. Same portal arrangement as `WindowBarActions`, and the
   same reason: whatever owns the state renders into the chrome without the
   chrome having to be told what the state is. */
export function WindowBarLead({ children }: { children: ReactNode }) {
  const node = useSlot("lead")
  if (!node) return null
  return createPortal(children, node)
}

/*
Whatever the active tab wants in the bar's right-hand end.

`order` exists because two things can fill one bar: the shell renders the
chrome every place-page shares, the filter and Activity, while a screen that
owns extra state of its own portals its controls in separately. Portals land in
mount order, which is not an arrangement anybody chose, so each block declares
where it sits and flex puts it there. Lower is further left, matching the
folder page's own arrangement: the view switcher, then the filter, then the
quiet things.
*/
export function WindowBarActions({
  children,
  order = 0,
}: {
  children: ReactNode
  order?: number
}) {
  const node = useSlot("trail")
  if (!node) return null
  return createPortal(
    <div style={{ order }} className="flex shrink-0 items-center gap-1.5">
      {children}
    </div>,
    node,
  )
}

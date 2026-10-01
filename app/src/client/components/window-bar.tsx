/*
The window bar: the compact strip at the top of the page area. Left is the way
here (history arrows and the breadcrumb trail, portalled in through
WindowBarLead); right holds the controls for whatever the page is showing
(WindowBarActions). Both ends are module-store slots, so a screen renders into
the chrome without lifting its state into the shell.

The strip is intentionally a stable shell surface. Covers begin below it and
never paint behind it, leaving this row reliable for directory context, page
controls and future work-page actions.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { TabStrip } from "../shell/TabStrip.js"

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

/* Workspace tabs sit above this row on desktop; the tab component removes
   itself on a phone, where the full strip would compete with Menu and Search.
   The work-page row stays compact at Dana's 32px row height, only 4px taller
   than its controls. */
export function WindowBar() {
  return (
    <>
      <TabStrip />
      <div
        data-window-bar
        className="flex h-[var(--row-height)] shrink-0 items-center gap-1.5 bg-card px-3"
      >
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
    </>
  )
}

/* The window bar's left end. Same portal arrangement as `WindowBarActions`, and
   the same reason: whatever owns the state renders into the chrome without the
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

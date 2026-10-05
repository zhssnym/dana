// The window bar: history and breadcrumb on the left, page controls on the right. Both
// ends are portal slots, so a screen renders into the chrome without lifting state.

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

// Workspace tabs span the window above side panels; only this lower row yields to the
// collaboration panel. `phone` makes it the 48px bar so 44px touch targets fit.
export function WindowBar({ phone = false }: { phone?: boolean }) {
  return (
    <>
      <TabStrip />
      <div
        data-window-bar
        style={{ marginRight: 'var(--collaboration-right-edge, 0px)' }}
        className={
          phone
            ? "flex h-12 shrink-0 items-center gap-1 bg-background px-1 transition-[margin] duration-150 ease-out"
            : "flex h-[var(--row-height)] shrink-0 items-center gap-1.5 bg-card px-3 transition-[margin] duration-150 ease-out"
        }
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

// The left end's portal, like `WindowBarActions`.
export function WindowBarLead({ children }: { children: ReactNode }) {
  const node = useSlot("lead")
  if (!node) return null
  return createPortal(children, node)
}

// The right end. `order` places each portalled block, because portals land in mount
// order; lower is further left.
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

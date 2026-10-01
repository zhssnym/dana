/*
The window bar: the strip at the top of the page area. Left is the way here
(history arrows and the breadcrumb trail, portalled in through WindowBarLead);
right holds the controls for whatever the page is showing (WindowBarActions).
Both ends are module-store slots, so a screen renders into the chrome without
lifting its state into the shell.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { TabStrip } from "../shell/TabStrip.js"
import { useCoverChrome } from "../shell/cover-chrome.js"

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

/* The two quiet strips themselves, rendered once by the shell. Workspace tabs
   sit above the existing window bar on desktop; the tab component removes
   itself on a phone, where the full strip would compete with Menu and Search.

   Whenever the visible page publishes a nearby cover, this bar becomes the
   continuation of that same cover surface on every viewport size. A photo gets
   a localized, theme-aware scrim only in this chrome reading zone, while the
   breadcrumb/actions stay fixed white with a compact shadow. Flat colour covers
   remain untouched. */
export function WindowBar() {
  const cover = useCoverChrome()
  const extendsCover = cover !== null
  const photoCover = extendsCover && Boolean(cover?.backgroundImage)

  return (
    <>
      <TabStrip />
      <div
        data-window-bar
        data-cover-extension={extendsCover ? "true" : undefined}
        className={`relative flex h-[var(--shell-windowbar-height)] shrink-0 items-center gap-1.5 px-3 ${
          extendsCover
            ? "z-10 bg-transparent text-fixed-white [&_a]:!text-fixed-white [&_button]:!text-fixed-white [&_span]:!text-fixed-white"
            : "bg-card"
        }`}
        style={
          extendsCover
            ? {
                textShadow:
                  "0 0 1px rgb(0 0 0 / 0.98), 0 1px 2px rgb(0 0 0 / 0.92), 0 2px 5px rgb(0 0 0 / 0.68)",
              }
            : undefined
        }
      >
        {extendsCover ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--shell-windowbar-height)+8rem)]"
            style={cover}
          >
            {photoCover ? (
              <div
                className="absolute inset-x-0 top-0 h-[calc(var(--shell-windowbar-height)+12px)] opacity-100 dark:opacity-[0.55]"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom, var(--scrim) 0%, var(--scrim) 68%, transparent 100%)",
                }}
              />
            ) : null}
          </div>
        ) : null}
        {/* The left end: history arrows and the breadcrumb trail. */}
        <div
          ref={(node) => setSlot("lead", node)}
          className="relative z-10 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
        />
        <div
          ref={(node) => setSlot("trail", node)}
          className="relative z-10 flex shrink-0 items-center gap-1.5"
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

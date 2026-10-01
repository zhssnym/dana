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

/* A photo-cover readability treatment belongs to the content that needs it,
   never to the whole bar. The soft surface sits just behind one content group,
   uses the existing theme-aware scrim, and blurs only the pixels immediately
   beneath that group. It adds no border, card shadow or layout padding. */
function CoverContrastIsland({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  const cover = useCoverChrome()
  const photoCover = Boolean(cover?.backgroundImage)

  return (
    <div className={`relative isolate ${className}`}>
      {photoCover ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 -z-10 rounded-md bg-[var(--scrim)] opacity-100 backdrop-blur-[6px] dark:opacity-[0.4]"
        />
      ) : null}
      {children}
    </div>
  )
}

/* The two quiet strips themselves, rendered once by the shell. Workspace tabs
   sit above the existing window bar on desktop; the tab component removes
   itself on a phone, where the full strip would compete with Menu and Search.

   Whenever the visible page publishes a nearby cover, this bar becomes the
   continuation of that same cover surface on every viewport size. The cover
   itself stays untouched: photo contrast is added only behind actual chrome
   content through `CoverContrastIsland`. Flat colour covers remain untouched. */
export function WindowBar() {
  const cover = useCoverChrome()
  const extendsCover = cover !== null

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
                  "0 1px 2px rgb(0 0 0 / 0.9), 0 2px 4px rgb(0 0 0 / 0.55)",
              }
            : undefined
        }
      >
        {extendsCover ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[calc(var(--shell-windowbar-height)+8rem)]"
            style={cover}
          />
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
   chrome having to be told what the state is. A photo cover protects the whole
   trail as one quiet contrast island instead of putting a pill around each
   breadcrumb. */
export function WindowBarLead({ children }: { children: ReactNode }) {
  const node = useSlot("lead")
  if (!node || children === null || children === undefined) return null
  return createPortal(
    <CoverContrastIsland className="flex min-w-0 max-w-full items-center">
      {children}
    </CoverContrastIsland>,
    node,
  )
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
      <CoverContrastIsland className="flex shrink-0 items-center gap-1.5">
        {children}
      </CoverContrastIsland>
    </div>,
    node,
  )
}

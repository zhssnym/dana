/*
The page bar: a real tab strip now (DES-217).

The strip has rendered the current page as a browser-style tab since v1, and
grew task tabs at F2 — but the first tab stayed special: wider than the rest,
unclosable, and silently retargeted by every "Open in a new tab", so a folder
asked to open as a second tab appeared to open as the first (Imran,
2026-08-24). The strip now means what it draws:

- **Every tab is the same tab.** One width, one mark-and-title anatomy, one
  close control. The place you are standing on is simply the active tab, not
  a different kind of thing.
- **Closing the tab you are on goes somewhere honest.** The neighbouring
  place takes over; an emptied strip lands on Desk. The shell owns that rule —
  this component only reports the close.
- **Tabs reorder by drag**, on a pointer with a 5px arming threshold so a
  click is never eaten. The strip is a row, so the drag is horizontal and
  bespoke — `use-sortable-list` is vertical and the board's column drag is
  the same judgement one level up.
- **The strip can open things**: the shell passes `addMenu`, a "+" at the end
  of the row, because a tab strip that can only close tabs is half of one.

Tabs live in sessionStorage (the shell navigates by full page load) and are
working state, not data: a fresh visit starts clean. The shell owns the list;
this component draws it.
*/

import { useRef, useState } from "react"
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react"

import type { LucideIcon } from "@/lib/icons"
import { RefreshCw, X } from "@/lib/icons"

import { FolderMark } from "@/components/folder-mark"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const T_FAST = "duration-[var(--duration-fast)] ease-[var(--ease-standard)]"

/*
What an inactive tab does when you touch it — F5, 2026-08-22.

Pressing a tab makes it white, so hover, the preview of that press, moves
toward white rather than away from it. See the note this carried since F5.
*/
const TAB_HOVER =
  "hover:bg-[color-mix(in_oklab,var(--color-graphite-0)_60%,var(--color-graphite-50))]"

export interface PageTab {
  id: string
  title: string
  /* A place tab wears its page's own mark; a folder or task tab wears the
     folder's, resolved by name so a dressed folder follows its tasks into
     the strip. Exactly one of these two is set. */
  icon?: LucideIcon
  iconColor?: string
  folder?: { name?: string; color?: string }
}

export function PageBar({
  tabs = [],
  activeTab = null,
  showUpdate = false,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  addMenu,
}: {
  tabs?: PageTab[]
  activeTab?: string | null
  showUpdate?: boolean
  onSelectTab?: (id: string) => void
  onCloseTab?: (id: string) => void
  onReorderTabs?: (from: number, to: number) => void
  /* The "+" at the row's end — a menu the shell owns, because opening an
     existing page and making a new one are the shell's acts, not the strip's. */
  addMenu?: ReactNode
}) {
  const tabRefs = useRef<(HTMLDivElement | null)[]>([])
  /*
  The drag, measured once at arming.

  The rects are captured when the pointer crosses the threshold and never
  re-read during the move, because the move itself transforms the siblings —
  measuring a thing you are in the middle of moving is the fault DES-212
  recorded for the shell's padding, one gesture over.
  */
  const gesture = useRef<{
    index: number
    startX: number
    armed: boolean
    pointerId: number
    rects: (DOMRect | null)[]
  } | null>(null)
  const [drag, setDrag] = useState<{ index: number; dx: number; to: number } | null>(
    null,
  )
  const dragRef = useRef<typeof drag>(null)
  const suppressClick = useRef(false)

  const beginDrag = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    gesture.current = {
      index,
      startX: event.clientX,
      armed: false,
      pointerId: event.pointerId,
      rects: [],
    }
  }

  const moveDrag = (index: number) => (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active || active.index !== index) return
    const dx = event.clientX - active.startX
    if (!active.armed) {
      if (Math.abs(dx) < 5) return
      active.armed = true
      active.rects = tabRefs.current.map((el) =>
        el ? el.getBoundingClientRect() : null,
      )
      event.currentTarget.setPointerCapture(active.pointerId)
    }
    const own = active.rects[index]
    if (!own) return
    const centre = own.left + own.width / 2 + dx
    let to = 0
    active.rects.forEach((rect, i) => {
      if (i === index || !rect) return
      if (rect.left + rect.width / 2 < centre) to++
    })
    const next = { index, dx, to }
    dragRef.current = next
    setDrag(next)
  }

  const endDrag = () => {
    const active = gesture.current
    const landed = dragRef.current
    gesture.current = null
    dragRef.current = null
    setDrag(null)
    if (!active?.armed) return
    /* The press moved: it was a drag, so the click that follows it is not a
       selection. */
    suppressClick.current = true
    if (landed && landed.to !== landed.index) {
      onReorderTabs?.(landed.index, landed.to)
    }
  }

  /* How far a resting tab steps aside while another passes it. */
  const shiftFor = (index: number) => {
    if (!drag || index === drag.index) return 0
    const width = gesture.current?.rects[drag.index]?.width ?? 0
    if (drag.to > drag.index && index > drag.index && index <= drag.to) return -width
    if (drag.to < drag.index && index >= drag.to && index < drag.index) return width
    return 0
  }

  return (
    <header
      className={showUpdate
        ? "flex h-[var(--control-height)] shrink-0 items-center bg-sidebar"
        : "flex h-[var(--shell-pagebar-height)] shrink-0 items-center bg-sidebar"}
    >
      {tabs.map((tab, index) => {
        const active = activeTab === tab.id
        const dragging = drag?.index === index
        const Icon = tab.icon
        return (
          <div
            key={tab.id}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            onPointerDown={beginDrag(index)}
            onPointerMove={moveDrag(index)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClickCapture={(event) => {
              if (!suppressClick.current) return
              suppressClick.current = false
              event.preventDefault()
              event.stopPropagation()
            }}
            style={{
              transform: dragging
                ? `translate3d(${drag.dx}px, 0, 0)`
                : shiftFor(index)
                  ? `translate3d(${shiftFor(index)}px, 0, 0)`
                  : undefined,
              transition:
                drag && !dragging
                  ? "transform var(--duration-fast) var(--ease-standard)"
                  : undefined,
              zIndex: dragging ? 30 : undefined,
            }}
            className={cn(
              "group/tab relative flex min-w-32 max-w-56 items-center self-stretch rounded-t-lg transition-colors",
              T_FAST,
              active ? "bg-card" : TAB_HOVER,
              dragging && "cursor-grabbing",
            )}
          >
            <button
              type="button"
              onClick={() => onSelectTab?.(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) onCloseTab?.(tab.id)
              }}
              aria-current={active ? "page" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-6 pl-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)] focus-visible:ring-inset"
            >
              {/*
              A tab says what kind of thing it holds — Imran's point 17, kept
              from the first strip. Place tabs carry their page's own mark
              (already resolved by the shell, folder identity included); task
              and folder tabs resolve the folder's mark by name, so a folder
              somebody has dressed follows its tasks here.

              Emphasis rides opacity rather than the hue, the arithmetic the
              sidebar's folder row settled at F5: the colour is the thing's
              identity and has to survive, so an inactive tab's mark fades
              rather than greys.
              */}
              <span
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center transition-opacity",
                  T_FAST,
                  active ? "opacity-100" : "opacity-[0.62] group-hover/tab:opacity-100",
                )}
              >
                {Icon ? (
                  <Icon
                    className="size-3.5"
                    style={tab.iconColor ? { color: tab.iconColor } : undefined}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <FolderMark
                    name={tab.folder?.name}
                    color={tab.folder?.color}
                    className="size-3.5"
                  />
                )}
              </span>
              <span
                className={cn(
                  "block truncate text-xs leading-4 font-medium transition-colors",
                  T_FAST,
                  active
                    ? "text-[var(--color-graphite-800)]"
                    : "text-[var(--color-graphite-500)] group-hover/tab:text-[var(--color-graphite-700)]",
                )}
              >
                {tab.title}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Close tab: ${tab.title}`}
              onClick={() => onCloseTab?.(tab.id)}
              className={cn(
                "absolute right-1 flex size-4 items-center justify-center rounded text-[var(--color-graphite-400)] opacity-0 transition-opacity group-hover/tab:opacity-100 focus-visible:opacity-100 hover:bg-[var(--color-graphite-200)] hover:text-[var(--color-graphite-700)]",
                T_FAST,
                active && "opacity-100",
              )}
            >
              <X className="size-3 data-[size=sm]:size-3" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )
      })}

      {addMenu}

      {showUpdate ? (
        <Button
          variant="ghost"
          className="ml-auto h-[var(--control-height)] px-3 text-sm text-[var(--color-graphite-700)] hover:bg-[var(--color-graphite-100)]"
          onClick={() => window.location.reload()}
        >
          <RefreshCw
            data-icon="inline-start"
            className="size-4"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Update available, reload
        </Button>
      ) : null}
    </header>
  )
}

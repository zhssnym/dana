/*
The window bar: a thin strip under the tabs that belongs to the window rather
than to the page inside it.

Imran's direction, 2026-08-18 (DES-139), against Notion's own arrangement.
The folder page had grown its own sticky control row, which was wrong in a
way that only showed once tabs existed: **controls that belong to "the thing
this tab is showing" are chrome, and chrome does not live inside the scroll
area.** It docked, un-docked, needed a sentinel and a scroll listener, and
repeated the folder's name that the tab beside it already said.

So the strip moves up, out of the page, and becomes part of the shell:

- **Left is deliberately empty**, reserved for the breadcrumb trail that
  arrives with nested folders. Until Dana has directories there is nothing
  true to put there, and inventing something would be inventing a hierarchy.
- **Right holds the controls** for whatever the tab is showing.
- **The title is not repeated.** The tab says it; saying it twice, two
  centimetres apart, is how a chrome stack starts looking cluttered.

**How a screen fills it.** The bar registers its right-hand container in a
module store, and `WindowBarActions` portals into it — so the folder page
keeps its own state and still renders into shell chrome, without lifting
half a screen's state into the shell or threading a render prop through four
components. The store follows `row-density` and `time-format`'s shape, which
is now the house pattern for anything read in one place and written in
another.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

function setSlot(next: HTMLElement | null) {
  slot = next
  listeners.forEach((notify) => notify())
}

function useSlot() {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => {
        listeners.delete(notify)
      }
    },
    () => slot,
    () => null,
  )
}

/* The strip itself, rendered once by the shell directly under the tabs. */
export function WindowBar() {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-graphite-200)] bg-card px-3">
      {/* Reserved for breadcrumbs. Empty is the honest state: Dana has no
          nested folders yet, and a trail of one item is not a trail. */}
      <div className="min-w-0 flex-1" />
      <div ref={setSlot} className="flex shrink-0 items-center gap-1.5" />
    </div>
  )
}

/* Whatever the active tab wants in the bar's right-hand end. */
export function WindowBarActions({ children }: { children: ReactNode }) {
  const node = useSlot()
  if (!node) return null
  return createPortal(children, node)
}

/*
The bar's quietest control: what happened to this thing, and when.

Imran's direction, 2026-08-18, against the same reference. It is a line of
text rather than a button — "Edited 8m ago" — because its resting job is to
*tell* you something, and only its second job is to open. Pressing it lists
the activity: who edited, who created, when.

Fixtures, and honest about it: real activity needs the audit trail DES-076
has owed since v1. What is drawn is the shape that trail would fill.
*/
export function WindowActivity({
  summary,
  entries,
}: {
  summary: string
  entries: { action: string; actor: string; at: string }[]
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-8 items-center rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
          >
            {summary}
          </button>
        }
      />
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          Activity
        </p>
        {entries.map((entry) => (
          <div
            key={`${entry.action}-${entry.at}`}
            className="flex items-baseline gap-2 rounded-md px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[var(--color-graphite-700)]">
              {entry.action} by{" "}
              <span className="font-medium text-[var(--color-graphite-900)]">
                {entry.actor}
              </span>
            </span>
            <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-400)]">
              {entry.at}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

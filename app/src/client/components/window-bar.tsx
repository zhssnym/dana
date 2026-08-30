/*
The window bar: a thin strip under the tabs that belongs to the window rather
than to the page inside it.

Lifted from `docs/design/prototype-v2/src/components/window-bar.tsx` at S23,
read on `v2-build` at `b316785`. The lift discipline of RFC 0004's
prototype-lift section applies: this file diffs empty against that original
except at the seams named at the foot of this header. The designer's own
reasoning below is kept intact, being the design record for what this does.

**This file is RFC 0004's S24 row and arrives at S23 because the task surface
needs three of its exports**, `WindowBarLead`, `WindowBarActions` and
`WindowActivity`: a task opened as a tab carries its own window-bar controls
by 9.3's own sentence, and its folder and section stand at the bar's left.
Writing a second set here would be the duplicate implementation protocol
section 3 forbids in the same breath as the boundary; it sits inside
`app/src/client/components/**`, which is one persona's whole path, so what
moves is the package rather than the ownership. `WindowBar` itself crosses
with them because a bar whose slots exist and whose strip does not is a
portal with nowhere to land; the shell that renders it is S24's.

**Its one non-mechanical seam is `lib/history.ts`**, which is 7.12's `GET
/events` in this client rather than the prototype's `localStorage` log. That
module's own header carries the reasoning, and the three functions this file
reads from it, `verbFor`, `agoFor` and `lineFor`, crossed verbatim inside it.

**The other seams are the two mechanical ones every lifted file takes**: the
`@/` specifiers become this client's relative ESM paths (11.4), and the em
dashes leave under protocol section 7's writing convention.

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
module store, and `WindowBarActions` portals into it, so the folder page
keeps its own state and still renders into shell chrome, without lifting
half a screen's state into the shell or threading a render prop through four
components. The store follows `row-density` and `time-format`'s shape, which
is now the house pattern for anything read in one place and written in
another.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { agoFor, type HistoryEvent, lineFor, verbFor, whenFor } from "../lib/history.js"

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

/* The strip itself, rendered once by the shell directly under the tabs. */
export function WindowBar() {
  return (
    <div className="flex h-[var(--shell-windowbar-height)] shrink-0 items-center gap-1.5 bg-card px-3">
      {/*
      The left end, reserved for breadcrumbs and now also the filter's chips
      (F5, DES-153: active state belongs on the page as removable chips, not as
      a count you have to open a panel to read).

      Two things sharing one end is deliberate rather than a compromise. Both
      answer the same question, *what am I looking at?*, and a trail followed
      by the narrowing applied to it reads left to right in the order a person
      would say it out loud. Dana still has no nested folders, so today the
      trail is empty and the chips have the end to themselves.
      */}
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

/*
The bar's quietest control: what happened to this thing, and when.

Imran's direction, 2026-08-18, against the same reference. It is a line of
text rather than a button, "Edited 8m ago", because its resting job is to
*tell* you something, and only its second job is to open. Pressing it lists
the activity: who did what, when.

**It reads the log now** (2026-08-23). It used to take a summary string and a
list of hand-written lines, and all three call sites passed the same two: an
"Edited" and a "Created" dated 4 August, on a folder made this morning and on
a task you had just typed. The summary is derived here rather than passed,
because a caller that can word "Edited just now" itself is a caller that can
word it differently from the line underneath it, which is exactly what the
old props allowed and what `sentenceFor` and `lineFor` exist to stop.

Nothing recorded yet means nothing to say, so the control does not draw. A
control that opens onto an empty popover is a promise the page cannot keep
(DES-144).
*/
export function WindowActivity({ events }: { events: HistoryEvent[] }) {
  const newest = events[0]
  if (!newest) return null
  /*
  polish: pagehead F4, folderpage F3. This was a button opening an "Activity"
  popover of the same rows the History sheet shows, two doors into one room
  with the sentences truncated in the smaller one. It is the line it looks
  like now; "..." > History is the one way to the record.
  */
  return (
    <span
      className="flex h-7 items-center px-2 text-[12px] leading-4 text-[var(--color-graphite-500)]"
      title={`${verbFor(newest)} ${whenFor(newest.at).toLowerCase()} by ${newest.actor}`}
    >
      {verbFor(newest)} {agoFor(newest.at)}
    </span>
  )
}

/* The popover this replaced, kept beside it and rendered by nothing. */
export function WindowActivityPopover({ events }: { events: HistoryEvent[] }) {
  const newest = events[0]
  if (!newest) return null
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-7 items-center rounded-md px-2 text-[12px] leading-4 text-[var(--color-graphite-500)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none hover:bg-[var(--color-graphite-100)] hover:text-[var(--color-graphite-700)] focus-visible:ring-2 focus-visible:ring-[var(--color-dana-accent-600)]"
          >
            {/*
            The resting line names the act that actually happened, rather than
            saying "Edited" over everything. The reference's phrasing was
            "Edited 8m ago" and a fixed word was the obvious reading of it, but
            it made the control lie in the common case: tick one thing off a
            folder and the bar said the folder had been edited, while the line
            one press below it said Completed. Same length, same shape, and now
            the two agree because both come from the verb.
            */}
            {verbFor(newest)} {agoFor(newest.at)}
          </button>
        }
      />
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)]">
          Activity
        </p>
        {events.slice(0, 8).map((event) => (
          <div
            key={event.id}
            className="flex items-baseline gap-2 rounded-md px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[var(--color-graphite-700)]">
              {lineFor(event)} by{" "}
              <span className="font-medium text-[var(--color-graphite-900)]">
                {event.actor}
              </span>
            </span>
            <span className="shrink-0 text-[12px] leading-4 text-[var(--color-graphite-400)]">
              {whenFor(event.at)}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

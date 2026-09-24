/*
The window bar: a thin strip under the tabs that belongs to the window rather
than to the page inside it.

`WindowBarLead`, `WindowBarActions` and `WindowActivity` are also used by the
task surface: a task opened as a tab carries its own window-bar controls by
9.3's own sentence, and its folder and section stand at the bar's left.

**Activity reads `lib/history.ts`**, which is 7.12's `GET /events`; that
module's own header carries the reasoning, and this file reads `verbFor`,
`agoFor` and `lineFor` from it.

**Controls that belong to "the thing this tab is showing" are chrome, and chrome
does not live inside the scroll area.** A sticky control row inside the page
docks, un-docks, needs a sentinel and a scroll listener, and repeats the name
the tab beside it already says. So the strip is part of the shell:

- **Left is reserved for the breadcrumb trail** that would arrive with nested
  folders. Until Dana has directories there is nothing true to put there, and
  inventing something would be inventing a hierarchy.
- **Right holds the controls** for whatever the tab is showing.
- **The title is not repeated.** The tab says it; saying it twice, two
  centimetres apart, is how a chrome stack starts looking cluttered.

**How a screen fills it.** The bar registers its right-hand container in a
module store, and `WindowBarActions` portals into it, so the folder page keeps
its own state and still renders into shell chrome, without lifting half a
screen's state into the shell or threading a render prop through four
components. The store follows `row-density` and `time-format`'s shape, which is
the house pattern for anything read in one place and written in another.
*/

import { useSyncExternalStore, type ReactNode } from "react"
import { createPortal } from "react-dom"

import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover.js"
import { agoFor, type HistoryEvent, storyFor, verbFor, whenFor } from "../lib/history.js"

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
      The left end, reserved for breadcrumbs and also the filter's chips: active
      state belongs on the page as removable chips, not as a count you have to
      open a panel to read.

      Two things sharing one end is deliberate rather than a compromise. Both
      answer the same question, *what am I looking at?*, and a trail followed by
      the narrowing applied to it reads left to right in the order a person
      would say it out loud. Dana has no nested folders, so the trail is empty
      and the chips have the end to themselves.
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

It is a line of text rather than a button, "Edited 8m ago", because its resting
job is to *tell* you something.

**It reads the log.** The summary is derived here rather than passed, because a
caller that can word "Edited just now" itself is a caller that can word it
differently from the line underneath it, which is what `sentenceFor` and
`lineFor` exist to stop.

Nothing recorded yet means nothing to say, so the control does not draw. A
control that opens onto an empty popover is a promise the page cannot keep.
*/
export function WindowActivity({ events }: { events: HistoryEvent[] }) {
  const newest = events[0]
  if (!newest) return null
  /*
  A line, not a button opening a popover of the same rows the History sheet
  shows: "..." > History is the one way to the record.
  */
  return (
    <span
      className="flex h-7 items-center px-2 text-xs leading-4 text-muted-foreground"
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
            className="flex h-7 items-center rounded-md px-2 text-xs leading-4 text-muted-foreground transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] outline-none hover:bg-accent hover:text-section-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
        <p className="px-2 pt-1 pb-1.5 text-xs leading-4 font-medium text-muted-foreground">
          Activity
        </p>
        {events.slice(0, 8).map((event) => (
          <div
            key={event.id}
            className="flex items-baseline gap-2 rounded-md px-2 py-1.5"
          >
            {/* One sentence, the person first: "Hassan added a step 'Plates'",
                from `lib/history.ts`'s `storyFor`. */}
            <span className="min-w-0 flex-1 truncate text-sm leading-5 text-section-foreground">
              <span className="font-medium text-foreground">
                {event.actor}
              </span>{" "}
              {storyFor(event).slice(event.actor.length + 1)}
            </span>
            <span className="shrink-0 text-xs leading-4 text-quiet-foreground">
              {whenFor(event.at)}
            </span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}

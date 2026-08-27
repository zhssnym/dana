/*
Everything that has happened to one thing.

Imran, 2026-08-23: "for individual task we have a row at the footer of each task
view, but that place seems not enough for a complete history, so another icon in
the footer or maybe overflow list will be needed."

He is right that they are two different jobs, and naming the difference is what
decides the design. The footer's Activity control answers **"is this fresh?"**,
it is a line of text that says *Completed 8 minutes ago*, and pressing it shows
the last handful. This answers **"what happened to this?"**, the whole record,
in order, dated, with who did each thing.

So the shape follows the question. The popover is short, tight and anchored to
its control. This is a sheet, scrolls, groups by day, and shows the actor on
every line rather than only where it changes, a record you are reading to
settle a question should not make you look upwards to find out who did
something.

**It is not a second reader.** Both draw the same events through the same
\`lineFor\`, so the sentence in the popover and the sentence in the sheet are one
string. What differs is how many and how much around them.

The day headings are the one addition. "Today", "Yesterday", then dates,
because the question underneath "what happened" is almost always "what happened
*when*", and a flat list of relative times makes you assemble that yourself.
*/

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog.js"
import {
  type HistoryEvent,
  type HistorySubjectKind,
  lineFor,
  useHistory,
  whenFor,
} from "../lib/history.js"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/* Which day an event belongs to, as the heading a person would write. */
function dayOf(at: number, now = Date.now()) {
  const date = new Date(at)
  const today = new Date(now)
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((midnight(today) - midnight(date)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

function timeOf(at: number) {
  const date = new Date(at)
  return `${date.getHours()}:${`${date.getMinutes()}`.padStart(2, "0")}`
}

export function HistorySheet({
  kind,
  subject,
  name,
  open,
  onOpenChange,
}: {
  kind: HistorySubjectKind
  subject: string
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const events = useHistory(kind, subject)

  /* Grouped in render order rather than sorted into a map, because the events
     already arrive newest-first and a heading is simply the point where the
     day changes. */
  const rows: Array<
    { heading: string } | { event: HistoryEvent }
  > = []
  let seen: string | null = null
  for (const event of events) {
    const day = dayOf(event.at)
    if (day !== seen) {
      rows.push({ heading: day })
      seen = day
    }
    rows.push({ event })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>
        {events.length ? (
          <div className="-mx-1 max-h-[52vh] overflow-y-auto px-1">
            {rows.map((row, index) =>
              "heading" in row ? (
                <p
                  key={`${row.heading}-${index}`}
                  className="px-1 pt-3 pb-1 text-[12px] leading-4 font-medium text-[var(--color-graphite-500)] first:pt-0"
                >
                  {row.heading}
                </p>
              ) : (
                <div
                  key={row.event.id}
                  className="flex items-baseline gap-3 rounded-md px-1 py-1.5"
                >
                  <span
                    className="w-10 shrink-0 text-[12px] leading-5 text-[var(--color-graphite-400)] tabular-nums"
                    title={whenFor(row.event.at)}
                  >
                    {timeOf(row.event.at)}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--color-graphite-700)]">
                    {lineFor(row.event)}
                  </span>
                  <span className="shrink-0 text-[12px] leading-5 text-[var(--color-graphite-500)]">
                    {row.event.actor}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          /* Nothing recorded is a real answer, and a different one from "this
             is new", a fixture task has existed since before the log did. */
          <p className="py-6 text-center text-[13px] leading-5 text-[var(--color-graphite-500)]">
            Nothing has happened to this yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

// The full history of one thing, grouped by day. It uses the same `sentenceOf` as
// the footer's Activity popover, so both say the same words.

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog.js"
import {
  type HistoryEvent,
  type HistorySubjectKind,
  sentenceOf,
  useHistory,
  whenFor,
} from "../lib/history.js"
import { formatClockTime, formatDay, type TimeFormat } from "../lib/dates.js"
import { useTimeFormat } from "../lib/time-format.js"
import { isoDay } from "../tasks/task-model.js"

function civilOf(at: number) {
  return isoDay(new Date(at))
}

function dayOf(at: number, now = Date.now()) {
  return formatDay(civilOf(at), civilOf(now))
}

function timeOf(at: number, clock: TimeFormat) {
  const date = new Date(at)
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  return formatClockTime(`${hh}:${mm}`, clock)
}

export function HistorySheet({
  kind,
  subject,
  open,
  onOpenChange,
  scope = "subject",
}: {
  kind: HistorySubjectKind
  subject: string
  /** The dialog does not repeat it; the page is behind it. */
  name?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  // A folder's sheet reads everything in the folder; others read their subject alone.
  scope?: "subject" | "folder"
}) {
  // Read only while open: a page of closed sheets would otherwise cost one request per row.
  const events = useHistory(kind, subject, open, scope)
  const clock = useTimeFormat()

  // Events arrive newest first, so a heading goes where the day changes. Identical
  // sentences in a row on one day collapse into one line.
  const rows: Array<
    { heading: string } | { event: HistoryEvent; sentence: string }
  > = []
  let seen: string | null = null
  let last: string | null = null
  for (const event of events) {
    const day = dayOf(event.at)
    if (day !== seen) {
      rows.push({ heading: day })
      seen = day
      last = null
    }
    const sentence = sentenceOf(event, { kind, subject })
    if (sentence === last) continue
    last = sentence
    rows.push({ event, sentence })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
        </DialogHeader>
        {events.length ? (
          <div className="max-h-[52vh] overflow-y-auto">
            {rows.map((row, index) =>
              "heading" in row ? (
                <p
                  key={`${row.heading}-${index}`}
                  className="pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-0"
                >
                  {row.heading}
                </p>
              ) : (
                <div
                  key={row.event.id}
                  className="flex items-baseline gap-3 py-1.5"
                >
                  <span
                    className={`${clock === "12" ? "w-16" : "w-10"} shrink-0 text-xs leading-5 text-muted-foreground tabular-nums`}
                    title={whenFor(row.event.at)}
                  >
                    {timeOf(row.event.at, clock)}
                  </span>
                  {/* One sentence with the actor in it. */}
                  <span className="min-w-0 flex-1 text-sm text-foreground">
                    {row.sentence}
                  </span>
                </div>
              ),
            )}
          </div>
        ) : (
          // Nothing recorded is a real answer: some tasks predate the log.
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing has happened to this yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

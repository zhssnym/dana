/*
The task, and everything true about one that is not a question of how it looks.

Extracted from `screens/row-concepts.tsx` on 2026-08-18, when the row and its
card were ported out of the concept lab and into the shell. The lab and the
eight screens now read one definition of what a task is and one set of rules
for turning its fields into words, which is the only arrangement in which the
row and the card cannot disagree.

They did disagree, twice, while all of this lived in one file and each place
wrote its own copy: the row said "Weekly" about a task that repeated on
weekdays, and the calendar never highlighted the selected day. Both faults were
one fact written down in two places. Every such fact is now written here once,
and every surface asks this module rather than remembering.

Fixtures only. Nothing here reaches `app/`; the Lane 2 proposals the card can
draw — attachments, block order, step promotion — stay proposals in
`docs/design/v2-decisions.md` until an RFC says otherwise.
*/

import { formatTime, type TimeFormat } from "@/lib/time-format"


export interface ConceptStep {
  title: string
  done: boolean
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  folder?: { name: string; color: string }
  /* A due date is a day, not a moment. There was a `dueTime` here until
     2026-08-18; Imran ruled the Due picker date-only, and a field nothing
     can set is a field the next person has to work out the fate of. A task
     that needs a time of day has a reminder, which carries one. */
  due?: { label: string; overdue?: boolean }
  reminder?: string
  repeatEvery?: string
  repeatDays?: string[]
  repeatEnds?: string
  assignee?: { initials: string; name: string; image?: string }
  /* Steps are the items themselves rather than a count, so the count is
     derived and ticking one in an expanded card moves the number in the row
     behind it. A count that cannot be wrong is better than a count. */
  steps?: ConceptStep[]
  /* Drawn but never shippable as it stands: attachments need storage,
     permissions and a virus story that DES-055 has owed since v1. Here so the
     card can be judged with a third block in it rather than two.

     `kind` is what decides whether the file can be shown or only handed over,
     and it is deliberately a small closed set rather than a MIME type. The
     server has to decide this by sniffing the bytes anyway — a browser will
     happily run a script that a client labelled image/png — so the client
     never sees a MIME type it might be tempted to trust. */
  attachments?: {
    name: string
    meta: string
    kind: "image" | "video" | "document" | "file"
    preview?: string
  }[]
  /* Which unit a recurrence counts in. Added with the rebuilt Repeat picker,
     which offers daily, weekly, monthly and yearly where the old one offered
     weekly or nothing. Fixtures only; DES-107 territory for the port. */
  repeatUnit?: "day" | "week" | "month" | "year"
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
}

export function stepCount(task: ConceptTask) {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

/* --------------------------------------------------------------- dates -- */
/*
The lab's notional today. The fixtures were written around it — 6 and 8 August
are overdue and 14 August is not — so anything drawing a calendar has to agree
with them, or the row and the picker open above it will contradict each other
on screen while each looks right on its own.
*/
export const LAB_TODAY = new Date(2026, 7, 13)

export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
export const DAY_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
]

export function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysBetween(from: Date, to: Date) {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  )
}

/* The next given weekday strictly after `from`, which is what both "this
   weekend" and "next week" mean when you say them out loud. */
export function nextWeekday(from: Date, weekday: number) {
  const delta = (weekday - from.getDay() + 7) % 7
  return addDays(from, delta === 0 ? 7 : delta)
}

/* A row's due label back into a date. The fixtures write dates as words —
   "Due 14 Aug", "Overdue · 6 Aug", "Due today" — and a calendar cannot
   highlight a string, which is why the picker this replaces never showed a
   selection at all. It did try: it read the day out with /d+/, a pattern
   matching the letter d rather than a digit, so it always came back empty. */
export function parseDueLabel(label: string): Date | null {
  if (/today/i.test(label)) return LAB_TODAY
  if (/tomorrow/i.test(label)) return addDays(LAB_TODAY, 1)
  const found = label.match(/(\d{1,2})\s+([A-Za-z]{3})/)
  if (!found) return null
  const month = MONTH_SHORT.findIndex(
    (name) => name.toLowerCase() === found[2].slice(0, 3).toLowerCase(),
  )
  if (month < 0) return null
  return new Date(2026, month, Number(found[1]))
}

/* And back out again in the fixtures' own words, so a date set from the picker
   reads in the row exactly like one that was always there. Overdue is derived
   here rather than passed in, because it is a fact about the date rather than
   a second thing somebody could set wrongly. */
export function dueLabelFor(date: Date): { label: string; overdue?: boolean } {
  const days = daysBetween(LAB_TODAY, date)
  if (days === 0) return { label: "Due today" }
  if (days === 1) return { label: "Due tomorrow" }
  const stamp = `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
  if (days < 0) return { label: `Overdue · ${stamp}`, overdue: true }
  return { label: `Due ${stamp}` }
}

/* "Sat 15 Aug" — the hint beside a preset, so "This weekend" says which day it
   actually means before anybody commits to it. */
export function shortDate(date: Date) {
  return `${DAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`
}

export function ordinal(day: number) {
  const rest = day % 100
  if (rest >= 11 && rest <= 13) return `${day}th`
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`
}


export const WEEKDAY_KEYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
export const WORKING_WEEK = ["Mo", "Tu", "We", "Th", "Fr"]

/* The date a recurrence counts from: the task's own due date when it has one,
   and otherwise today. "Monthly on the 13th" has to name a number, and taking
   it from anywhere else would make the summary disagree with the row. */
export function repeatAnchor(task: ConceptTask) {
  return (task.due ? parseDueLabel(task.due.label) : null) ?? LAB_TODAY
}

export function repeatSummary(task: ConceptTask) {
  if (!task.recurrence) return "Does not repeat"
  const anchor = repeatAnchor(task)
  const every = Math.max(1, Number(task.repeatEvery ?? "1"))
  const unit = task.repeatUnit ?? "week"
  const days = task.repeatDays ?? []

  let head: string
  if (unit === "day") {
    head = every === 1 ? "Daily" : `Every ${every} days`
  } else if (unit === "month") {
    head =
      every === 1
        ? `Monthly on the ${ordinal(anchor.getDate())}`
        : `Every ${every} months`
  } else if (unit === "year") {
    head = `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()]}`
  } else if (days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) {
    head = "Every weekday"
  } else if (days.length) {
    head = `${every === 1 ? "Weekly" : `Every ${every} weeks`} on ${days.join(", ")}`
  } else {
    head = every === 1 ? `Weekly on ${DAY_LONG[anchor.getDay()]}` : `Every ${every} weeks`
  }
  return task.repeatEnds ? `${head}, until ${task.repeatEnds}` : head
}

/* The same rule in one word, for the row, where "Every 2 weeks on Mo, We, Fr"
   would eat the space five other details are sharing. The row says which kind
   of repeat it is and the card it opens says exactly which one.

   Both come from here, which is the point: the row used to carry the literal
   word "Weekly" whatever the rule actually was, so setting "Every weekday" in
   the card left the row two lines above it saying something untrue. */
export function repeatShort(task: ConceptTask) {
  if (!task.recurrence) return "Does not repeat"
  const every = Math.max(1, Number(task.repeatEvery ?? "1"))
  const unit = task.repeatUnit ?? "week"
  const days = task.repeatDays ?? []
  if (unit === "day") return every === 1 ? "Daily" : `Every ${every} days`
  if (unit === "month") return every === 1 ? "Monthly" : `Every ${every} months`
  if (unit === "year") return "Yearly"
  if (days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) return "Weekdays"
  return every === 1 ? "Weekly" : `Every ${every} weeks`
}

/* The words on a due chip. One function for the same reason the repeat
   summary is one: the row and the card both draw this, and the last time each
   wrote its own, the row spent a day saying "Weekly" about a task that
   repeated on weekdays. No clock here — see the note on `due`. */
export function dueChipValue(task: ConceptTask) {
  return task.due ? task.due.label : "No date"
}

/* A reminder is a sentence with a time somewhere inside it rather than a time
   with words around it, so the clock is swapped in place and the rest is left
   exactly as it was written. */
export function reminderChipValue(task: ConceptTask, format: TimeFormat) {
  if (!task.reminder) return "No reminder"
  return task.reminder.replace(
    /(\d{1,2}:\d{2})/,
    (found) => formatTime(found, format) ?? found,
  )
}

/* --------------------------------------------------------- the people -- */
/*
Avatars carry a real picture rather than initials.

Drawn as inline SVG portraits so the shared build stays one file that asks the
network for nothing — the same constraint the attachment thumbnails work
under. They are deliberately illustrative rather than photographic: a fake
photograph of a person who does not exist is a worse thing to put into a
design review than an obvious drawing.

The fallback initials stay underneath. A real product has people who have not
set a picture, and that state has to keep working, so it is still the thing
the component falls back to.
*/
function portrait(
  bgFrom: string,
  bgTo: string,
  skin: string,
  shade: string,
  hair: string,
  shirt: string,
  hairPath: string,
) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    "<defs>",
    '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="' + bgFrom + '"/>',
    '<stop offset="1" stop-color="' + bgTo + '"/>',
    "</linearGradient>",
    '<linearGradient id="s" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0" stop-color="' + skin + '"/>',
    '<stop offset="1" stop-color="' + shade + '"/>',
    "</linearGradient>",
    "</defs>",
    '<rect width="64" height="64" fill="url(#b)"/>',
    /* Shoulders first, so the neck and jaw sit over them. */
    '<path d="M4 64c0-14 12-21 28-21s28 7 28 21z" fill="' + shirt + '"/>',
    '<path d="M26 36h12v9c0 3-12 3-12 0z" fill="' + shade + '"/>',
    '<ellipse cx="32" cy="27" rx="12.5" ry="14" fill="url(#s)"/>',
    '<path d="' + hairPath + '" fill="' + hair + '"/>',
    "</svg>",
  ].join("")
  return "data:image/svg+xml," + encodeURIComponent(svg)
}

/* Short crop, long hair, and a beard-and-crop, so three people are told apart
   at 16px by silhouette rather than by reading a name. */
export const HAIR_CROP = "M19 26c0-9 6-14 13-14s13 5 13 14c0-4-3-6-6-7-4-1-9 0-13-1-4-1-6 3-7 8z"
export const HAIR_LONG =
  "M18 30c0-12 6-18 14-18s14 6 14 18c1-3 2-9 1-14-1-6-7-9-15-9s-14 3-15 9c-1 5 0 11 1 14z"
export const HAIR_SHORT =
  "M20 25c1-8 6-12 12-12s11 4 12 12c1-6-1-13-5-15-3-2-11-2-14 0-4 2-6 9-5 15z"

export const FACE_IMRAN = portrait(
  "#eef1fb", "#dfe5f7", "#d9a273", "#c07f4f", "#2b2620", "#3c5bbf", HAIR_CROP,
)
export const FACE_SARA = portrait(
  "#fdeeec", "#f8dcd8", "#eebb95", "#d99a6c", "#4a2b1e", "#c4627b", HAIR_LONG,
)
export const FACE_HASSAN = portrait(
  "#e6f4ea", "#d3ebda", "#b07a45", "#96632f", "#1c1713", "#1f7a3f", HAIR_SHORT,
)

export const VIOLET = "var(--color-folder-violet)"
export const FERN = "var(--color-folder-fern)"
export const TEAL = "var(--color-folder-teal)"

export const FOLDERS = [
  { name: "Wedding", color: VIOLET },
  { name: "Community planning committee", color: FERN },
  { name: "Home", color: TEAL },
  { name: "Inbox", color: "var(--color-graphite-400)" },
]

export const PEOPLE = [
  { initials: "IW", name: "Imran Wafa", image: FACE_IMRAN },
  { initials: "SK", name: "Sara", image: FACE_SARA },
  { initials: "HN", name: "Hassan", image: FACE_HASSAN },
]

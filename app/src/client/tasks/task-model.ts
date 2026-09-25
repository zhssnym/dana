/*
The task, and everything true about one that is not a question of how it looks.

Every surface speaks in this shape, and a shape declared twice is a shape that
will one day disagree with itself: a row and its card that each wrote their own
copy of one fact would say "Weekly" about a task that repeats on weekdays.

**The seam these types cross.** A `ConceptTask` is what a card holds; a
`TaskCard` and a `TaskDetail` are what 7.0 answers. `tasks/task-concept.ts` is
the join and is the only place the two vocabularies meet.
*/
import { todayInBrowserZone } from '../api/tz.js'
import { formatDate, formatDay } from '../lib/dates.js'

import { formatTime, type TimeFormat } from '../lib/time-format.js'

/* ------------------------------------------------------------------ *
 * Days, and the one clock this file is allowed
 * ------------------------------------------------------------------ */

/* The same day as an ISO key, for the callers that bucket by string rather
   than compare Dates. `Date.toISOString` is UTC and would hand back the day
   before for anyone west of Greenwich, which is why this is built by hand. */
export function isoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/* `isoDay`'s inverse. Local, not `new Date("2026-08-10")`, which parses as
   UTC midnight and lands on the previous day for anyone west of Greenwich. */
export function parseIsoDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
}

/**
 * 4.11's today, in the viewer's own zone, as a `Date` for the arithmetic the
 * pickers do with it.
 *
 * A function rather than a module constant, and the difference is not
 * stylistic: a constant is evaluated once at module load, so a browser left
 * open across midnight would go on offering yesterday as "Today" in every
 * picker on the page.
 */
export function today(): Date {
  return parseIsoDate(todayInBrowserZone())
}

export const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
]

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000,
  )
}

/* The next given weekday strictly after `from`, which is what both "this
   weekend" and "next week" mean when you say them out loud. */
export function nextWeekday(from: Date, weekday: number): Date {
  const delta = (weekday - from.getDay() + 7) % 7
  return addDays(from, delta === 0 ? 7 : delta)
}

/*
A row's due label back into a date, so a calendar can highlight the day the row
is already talking about.

The words come from `dueDisplay`, so this is reading back what that function
wrote, and the two agree because the forms it matches are the three 8.10 allows
and no others. A label carrying no year means the current one, which is what
`dueDisplay` means by omitting it.
*/
export function parseDueLabel(label: string): Date | null {
  if (/today/i.test(label)) return today()
  if (/tomorrow/i.test(label)) return addDays(today(), 1)
  if (/yesterday/i.test(label)) return addDays(today(), -1)
  const weekday = DAY_SHORT.findIndex((name) => label === name || label.startsWith(`${name} `))
  if (weekday >= 0) {
    /* `formatDay` writes a weekday only for 2–6 days ahead. */
    const delta = (weekday - today().getDay() + 7) % 7
    return addDays(today(), delta < 2 ? delta + 7 : delta)
  }
  /* "24 Sep 2027", or "Sep 24, 2027" where the locale puts the month first. */
  const dayFirst = label.match(/(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?/)
  const monthFirst = dayFirst ? null : label.match(/([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?/)
  const found = dayFirst
    ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3] }
    : monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3] }
      : null
  if (!found) return null
  const month = MONTH_SHORT.findIndex(
    (name) => name.toLowerCase() === (found.month ?? '').slice(0, 3).toLowerCase(),
  )
  if (month < 0) return null
  const year = found.year === undefined ? today().getFullYear() : Number(found.year)
  return new Date(year, month, Number(found.day))
}

/*
The relative ladder, decided once.

The arithmetic behind "is it late, is it today, is it tomorrow, or is it a date"
in more than one place is more than one chance to disagree about what "tomorrow"
means with nothing in the product to say so.

The *rung* is shared; the *words* are not, and deliberately. A row says "Due
tomorrow" because it is describing one task; a heading says "Tomorrow" because
it is naming a bucket. Sharing the sentence would have forced one of them to
read wrongly, so what is shared is the decision underneath it.
*/
export type DayRung = 'overdue' | 'today' | 'tomorrow' | 'later'

export function dayRung(date: Date): DayRung {
  const days = daysBetween(today(), date)
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return 'later'
}


export interface ConceptStep {
  title: string
  done: boolean
  /* 7.7's id, present on a step the server has answered and absent on one typed
     into the card and not yet written; `tasks/task-acts.ts` moves only the
     former. */
  id?: string
}

/*
Something attached to a task or hung on a comment.

One declaration for a task's attachments and a comment's files, so a `link` kind
cannot be added to one and not the other.

**`link` is a kind, not a file with an address.** A link stored as a file would
land in the file list wearing a paperclip and a row that said **"Download"**,
and be neither downloadable nor openable.

A link has a `url` and is rendered as an anchor. A file does not and is not.

`kind` stays a small closed set rather than a MIME type: a server has to decide
this by sniffing the bytes anyway, because a browser will happily run a script a
client labelled image/png, so the client never sees a type it might be tempted
to trust.

**Nothing fills this today and `tasks/task-concept.ts` says so where it maps.**
Attachments need storage, permissions and a virus story; the type is here so the
card can be built with a third block in it rather than two.
*/
export interface Attachment {
  name: string
  meta: string
  kind: 'image' | 'video' | 'document' | 'file' | 'link'
  /* A thumbnail, where there is something to see. */
  preview?: string
  /*
  Width over height for the picture `preview` points at, so a surface that
  draws it at its own size can hold the space before the bytes land (issue
  #108).

  Absent means the file was never measured, which is every attachment stored
  before migration 0009 and every kind that is not a picture; a surface reads
  it through `lib/page-images.ts`'s `reservedRatio`, which turns absent into
  the same 16 by 9 those surfaces already drew. It is a number rather than the
  pair 4.16 carries because that is what CSS takes and because a ratio is the
  only thing any of these surfaces wants from the pair.
  */
  ratio?: number
  /* Where the link goes. Set only on `kind: "link"`; a file has no address
     that outlives the session. */
  url?: string
  /*
  **The `File` itself, optional.** The conversation posts a real file through
  7.15 and then names its id on the comment (7.14), so the bytes have to survive
  the trip from the picker to `lib/thread.ts`'s `applyThreadChange`. Optional,
  so every surface that never has one still typechecks and still behaves.
  */
  file?: File
}

/*
A comment: who said it, when, and one of three kinds of what, words, a voice
note, or files riding along. Replies are the same shape one level down, and one
level is deliberate: a task's conversation is a short thread, not a forum, and
unbounded nesting is how a card grows a scrollbar inside a scrollbar.

**The conversation is 9.6's**, at `GET /folders/:id/thread` with
`queryKeys.thread()`. `tasks/task-concept.ts` leaves `comments` undefined; the
type is here because `ConceptTask` refers to it.
*/
export interface ConceptComment {
  id: string
  author: { initials: string; name: string; image?: string; id?: string }
  at: string
  body?: string
  /* Reactions: the lightest way a team says "seen and agreed" without a
     message. A small closed set, no picker dependency. */
  reactions?: { emoji: string; count: number; mine?: boolean }[]
  /* Whether the body was changed after posting; drawn as a quiet "(edited)"
     because silent edits are how threads stop being trusted. */
  edited?: boolean
  /* A voice note: how long it runs and the waveform to draw. */
  voice?: { seconds: number; bars: number[]; url?: string }
  files?: Attachment[]
  /* Mine, so a surface knows which comments offer Delete. */
  mine?: boolean
  /*
  **Whether this viewer may delete this comment.**

  7.14 gives a comment's deletion to its author **or** to a member who may
  moderate the folder (`comment.moderate`, Full control's; ownership is custody,
  AC-790), and `routes/conversation.ts` resolves exactly those two. This carries
  that answer per comment rather than per thread, so that the card mount and the
  folder page cannot disagree about the same comment. Absent falls back to
  `mine`, so a surface that has no standing in hand behaves as the lab does.
  */
  deletable?: boolean
  /**
   * Whether this viewer may edit **this** comment (issue #268):
   * `comment.mutate.own` is authorship **and** currently holding Can comment or
   * better, so a member downgraded to Can view keeps their words and loses the
   * pencil. Absent falls back to `mine`, the lab's answer (AC-790).
   */
  editable?: boolean
  /**
   * Whether this viewer may like or unlike at all. #228's Can-comment list
   * carries the pair and Can view leaves no mark on a thread; the lab has no
   * such concept and offered it to everyone. Absent falls back to true
   * (AC-790).
   */
  likeable?: boolean
  /**
   * Whether this viewer may reply to this comment. `comment.create`, Can
   * comment's, the same act as a first comment; the lab offers Reply to
   * everybody. Absent falls back to true (AC-790).
   */
  replyable?: boolean
  replies?: ConceptComment[]
}

/** A Label as a row or the panel draws it (#208). */
export interface ConceptLabel {
  id: string
  name: string
  color: string
  scope: 'personal' | 'folder'
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  /*
  **`id` is optional beside the name and colour.** Dana addresses a folder by id
  (7.4). A card that sets a name and a colour still typechecks and still
  behaves, and a picker written against this client sets the id, which
  `tasks/task-writer.tsx` prefers over the name.

  The same widening, for the same reason, on `assignee` below.
  */
  folder?: { name: string; color: string; id?: string }
  /* A due date is a day, not a moment, so there is no time field here. A task
     that needs a time of day has a reminder, which carries one. */
  due?: { label: string; overdue?: boolean }
  /* The due date's own time ("08:00"), 4.11's due_time; absent for a day. */
  dueTime?: string
  /* The Schedule's start, as 4.11 writes a date ("2026-09-24"); absent when none (#215). */
  start?: string
  reminder?: string
  repeatEvery?: string
  repeatDays?: string[]
  repeatEnds?: string
  /*
  Three values, and the third is the one issue #169 was about.

  A person is a person. **An absent one means nobody is assigned** where this is
  a whole task, and means "this field was not touched" where it is the
  `Partial<ConceptTask>` an edit reports. One `undefined` cannot serve both
  readings, which is why **`null` exists: it is the patch that says "clear the
  assignee"**. `conceptPatchToBody` turns it into 7.6's `assignee_id: null`:
  unassigned is a member of the set, not the absence of one.

  So a reader of a whole task treats the two empties alike, nobody is assigned
  either way, and every reader here already does: each asks
  `task.assignee?.name`, `Boolean(task.assignee)` or `!task.assignee`. A writer
  of a patch has to choose between them.
  */
  assignee?: { initials: string; name: string; image?: string; id?: string } | null
  /* Steps are the items themselves rather than a count, so the count is
     derived and ticking one in an expanded card moves the number in the row
     behind it. A count that cannot be wrong is better than a count. */
  steps?: ConceptStep[]
  attachments?: Attachment[]
  /* The Labels the viewer can see on this task (#226), personal then folder,
     archived ones left out. */
  labels?: ConceptLabel[]
  /* Which unit a recurrence counts in. */
  repeatUnit?: 'day' | 'week' | 'month' | 'year'
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
  /* The conversation about the task, pinned after the content blocks and
     outside their order: commentary is not content. */
  comments?: ConceptComment[]
  /**
   * Whether this viewer may write into that conversation at all
   * (`comment.create`, Can comment's).
   *
   * It rides the task rather than a comment because **a thread with nothing in
   * it still has a composer**, and no per-comment field can answer for one. The
   * card hands it straight to `CommentsThread`, which renders the composer
   * disabled rather than hiding it. Absent falls back to true, the lab's answer
   * (#268; AC-790).
   */
  canComment?: boolean
}

export function stepCount(task: ConceptTask): { done: number; total: number } | null {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

/*
And back out again in the same words, so a date set from the picker reads in the
row exactly like one that was always there.

The words are `lib/dates.ts`'s `formatDay`, the same formatter `dueDisplay`
uses, so a picked date and a fetched one read identically.
*/
export function dueLabelFor(date: Date): { label: string; overdue?: boolean } {
  const label = formatDay(isoDay(date), todayInBrowserZone())
  return dayRung(date) === 'overdue' ? { label, overdue: true } : { label }
}

export function ordinal(day: number): string {
  const rest = day % 100
  if (rest >= 11 && rest <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

export const WEEKDAY_KEYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
export const WORKING_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr']

/* The date a recurrence counts from: the task's own due date when it has one,
   and otherwise today. "Monthly on the 13th" has to name a number, and taking
   it from anywhere else would make the summary disagree with the row. */
export function repeatAnchor(task: ConceptTask): Date {
  return (task.due ? parseDueLabel(task.due.label) : null) ?? today()
}

export function repeatSummary(task: ConceptTask): string {
  if (!task.recurrence) return 'Does not repeat'
  const anchor = repeatAnchor(task)
  const every = Math.max(1, Number(task.repeatEvery ?? '1'))
  const unit = task.repeatUnit ?? 'week'
  const days = task.repeatDays ?? []

  let head: string
  if (unit === 'day') {
    head = every === 1 ? 'Daily' : `Every ${every} days`
  } else if (unit === 'month') {
    head =
      every === 1
        ? `Monthly on the ${ordinal(anchor.getDate())}`
        : `Every ${every} months`
  } else if (unit === 'year') {
    head = `Yearly on ${anchor.getDate()} ${MONTH_SHORT[anchor.getMonth()] ?? ''}`
  } else if (days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) {
    head = 'Every weekday'
  } else if (days.length) {
    /* In week order, and in words: "Weekly on Friday", "Weekly on Mon, Thu". */
    const names = WEEKDAY_KEYS.filter((d) => days.includes(d)).map((d) => {
      const index = (WEEKDAY_KEYS.indexOf(d) + 1) % 7
      return (days.length === 1 ? DAY_LONG[index] : DAY_SHORT[index]) ?? d
    })
    head = `${every === 1 ? 'Weekly' : `Every ${every} weeks`} on ${names.join(', ')}`
  } else {
    head =
      every === 1
        ? `Weekly on ${DAY_LONG[anchor.getDay()] ?? ''}`
        : `Every ${every} weeks`
  }
  return task.repeatEnds
    ? `${head}, until ${formatDate(task.repeatEnds, todayInBrowserZone())}`
    : head
}

const RULE_FREQ = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' } as const

/* The card's repeat as 4.11's rule string, which is what 7.6 stores; null
   where the task does not repeat. `repeatEnds` is a date ("2026-12-31"). */
export function ruleFor(
  task: Pick<ConceptTask, 'recurrence' | 'repeatUnit' | 'repeatEvery' | 'repeatDays' | 'repeatEnds'>,
): string | null {
  if (!task.recurrence) return null
  const unit = task.repeatUnit ?? 'week'
  const parts = [`FREQ=${RULE_FREQ[unit]}`]
  const every = Math.min(99, Math.max(1, Number(task.repeatEvery ?? '1') || 1))
  if (every > 1) parts.push(`INTERVAL=${String(every)}`)
  const days = WEEKDAY_KEYS.filter((d) => task.repeatDays?.includes(d))
  if (unit === 'week' && days.length > 0) {
    parts.push(`BYDAY=${days.map((d) => d.toUpperCase()).join(',')}`)
  }
  if (task.repeatEnds !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(task.repeatEnds)) {
    parts.push(`UNTIL=${task.repeatEnds.replaceAll('-', '')}`)
  }
  return parts.join(';')
}

/* The same rule in one word, for the row, where "Every 2 weeks on Mo, We, Fr"
   would eat the space five other details are sharing. The row says which kind
   of repeat it is and the card it opens says exactly which one.

   Both come from here, which is the point: the row used to carry the literal
   word "Weekly" whatever the rule actually was, so setting "Every weekday" in
   the card left the row two lines above it saying something untrue. */
export function repeatShort(task: ConceptTask): string {
  if (!task.recurrence) return 'Does not repeat'
  /* No unit means nobody told this card the rule; say that it repeats rather
     than guess "Weekly" about a daily task. */
  if (task.repeatUnit === undefined) return 'Repeats'
  const every = Math.max(1, Number(task.repeatEvery ?? '1'))
  const unit = task.repeatUnit ?? 'week'
  const days = task.repeatDays ?? []
  if (unit === 'day') return every === 1 ? 'Daily' : `Every ${every} days`
  if (unit === 'month') return every === 1 ? 'Monthly' : `Every ${every} months`
  if (unit === 'year') return 'Yearly'
  if (days.length === 5 && WORKING_WEEK.every((d) => days.includes(d))) {
    return 'Weekdays'
  }
  return every === 1 ? 'Weekly' : `Every ${every} weeks`
}

/* A reminder is a sentence with a time somewhere inside it rather than a time
   with words around it, so the clock is swapped in place and the rest is left
   exactly as it was written. */
/*
**The chip reads the field, and the field is a clock time.**

9.3's reminder is "one picker, a time on that day", and the day is the due date,
which the chip beside this one already says. So what is left to render is the
time.

**And it is worded on the viewer's clock**, as the due label beside it is: a
row reading "Today 8:00 AM" over a reminder reading "07:30" would be one
screen speaking two notations. AC-170's round trip still holds, the stored
clock time being what is shown, only spelled the way every other time is.
*/
export function reminderChipValue(task: ConceptTask, format: TimeFormat): string {
  if (!task.reminder) return 'No reminder'
  const time = task.reminder.match(/(\d{1,2}:\d{2})$/)?.[1]
  return time === undefined ? task.reminder : (formatTime(time, format) ?? time)
}

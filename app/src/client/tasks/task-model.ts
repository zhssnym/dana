/*
The task, and everything true about one that is not a question of how it looks.

`docs/design/prototype-v2/src/lib/task-model.ts`, read at `7d2064c`, reduced
to its declarations. That prototype is deleted (`a7886df`, 2026-09-01); read
it in git history before that commit. The file arrives here rather than at S23
because `tasks/task-writer.tsx`, `tasks/task-concept.ts` and every surface that
follows them speak in this shape, and a shape declared twice is a shape that
will one day disagree with itself. Its own header says why it exists at all:
the row and its card disagreed twice while each wrote its own copy of one
fact, "the row said Weekly about a task that repeated on weekdays", and both
faults were one fact written down in two places.

**What crossed and what did not, named rather than discovered.** The four
interfaces below and the two counts are the whole of the lift, verbatim. What
stayed behind is the prototype's fixture half, `PEOPLE`, `FACE_*`,
`LAB_TODAY`, `TODAY_ISO` and the tasks themselves, which RFC 0004's close
forbids crossing in any form, and its **wording half**: `dueLabelFor`,
`dueChipValue`, `reminderChipValue`, `repeatShort`, `repeatSummary`,
`parseDueLabel`, `dayStamp` and their neighbours. Those are not withheld, they
are somebody else's row: they turn a field into the words a chip or a row
says, and the surfaces that say them arrive at S23. This client already writes
a due label in `parts/presenters.ts` against 4.11's today and 9.7's clock, so
importing a second set now would be the two-copies fault this file's own
header is about, one release early.

**The seam these types cross.** A `ConceptTask` is what a card holds; a
`TaskCard` and a `TaskDetail` are what 7.0 answers. `tasks/task-concept.ts` is
the join and is the only place the two vocabularies meet.
*/
import { todayInBrowserZone } from '../api/tz.js'

import type { TimeFormat } from '../lib/time-format.js'

export { personTint } from '../parts/person-tint.js'

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
 * A function rather than the prototype's module constant, and the difference
 * is not stylistic: a constant is evaluated once at module load, so a browser
 * left open across midnight would go on offering yesterday as "Today" in every
 * picker on the page. The prototype could afford one because its today was a
 * fixture that never moved.
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
A row's due label back into a date, so a calendar can highlight the day the
row is already talking about.

The prototype needed this because its dates were written as words in a fixture
and "a calendar cannot highlight a string". Here the words come from
`dueDisplay`, so this is reading back what that function wrote, and the two
agree because the forms it matches are the three 8.10 allows and no others.
The year is the seam: the prototype hardcoded 2026, its fixture year, and a
label carrying no year means the current one, which is what `dueDisplay` means
by omitting it.
*/
export function parseDueLabel(label: string): Date | null {
  if (/today/i.test(label)) return today()
  if (/tomorrow/i.test(label)) return addDays(today(), 1)
  const found = label.match(/(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?/)
  if (!found) return null
  const month = MONTH_SHORT.findIndex(
    (name) => name.toLowerCase() === (found[2] ?? '').slice(0, 3).toLowerCase(),
  )
  if (month < 0) return null
  const year = found[3] === undefined ? today().getFullYear() : Number(found[3])
  return new Date(year, month, Number(found[1]))
}

/*
The relative ladder, decided once.

The arithmetic behind "is it late, is it today, is it tomorrow, or is it a
date" had been written out three times in the prototype, and three copies of
one ladder is three chances for two of them to disagree about what "tomorrow"
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
  /* 7.7's id, present on a step the server has answered and absent on one
     typed into the card and not yet written; `tasks/task-acts.ts` moves only
     the former (RFC 0005 change control item 58, C). */
  id?: string
}

/*
Something attached to a task or hung on a comment.

One declaration. It was written out twice, once for a task's attachments and
once for a comment's files, with the same four fields, which is how a `link`
kind can be added to one and not the other.

**`link` is a kind, not a file with an address**, and that distinction is the
whole of the fault Imran found: a pasted link was stored as `kind: "file"`, so
it landed in the file list wearing a paperclip and a row that said
**"Download"**. It was neither downloadable nor openable.

A link has a `url` and is rendered as an anchor. A file does not and is not.

`kind` stays a small closed set rather than a MIME type, for the reason
DES-055 gives: a server has to decide this by sniffing the bytes anyway,
because a browser will happily run a script a client labelled image/png, so
the client never sees a type it might be tempted to trust.

**Nothing fills this today and `tasks/task-concept.ts` says so where it maps.**
Attachments need storage, permissions and the virus story DES-055 has owed
since v1; the type is here so the card can be built with a third block in it
rather than two, which is the prototype's own reason for drawing it.
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
  **The one widening this type makes, added at S26 and a named seam.**

  The prototype's composer turns a chosen file into this record and lets the
  `File` go, which is right for a lab whose store is an object URL. Dana's
  conversation posts a real file through 7.15 and then names its id on the
  comment (7.14), so the bytes have to survive the trip from the picker to
  `lib/thread.ts`'s `applyThreadChange`. Optional, so every lifted surface
  that never had one still typechecks and still behaves.
  */
  file?: File
}

/*
A comment: who said it, when, and one of three kinds of what, words, a voice
note, or files riding along. Replies are the same shape one level down, and
one level is deliberate: a task's conversation is a short thread, not a forum,
and unbounded nesting is how a card grows a scrollbar inside a scrollbar.

**The conversation is 9.6's and this client already serves one**, at
`GET /folders/:id/thread` with `queryKeys.thread()`. Mapping a thread into
this shape is S26's row, where the thread mounts on a task, so
`tasks/task-concept.ts` leaves `comments` undefined and names the row that
fills it. The type is here because `ConceptTask` refers to it.
*/
export interface ConceptComment {
  id: string
  author: { initials: string; name: string; image?: string }
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
  **The second widening this file makes, added at S26 and a named seam.**

  The lab has no permission system, so the prototype offers Edit and Delete
  on `mine` alone. 4.15 gives a comment's deletion to its author **or** the
  folder's owner, and `domain/comments.ts` resolves exactly those two. This
  carries that answer per comment rather than per thread, so that the card
  mount and the folder page cannot disagree about the same comment, which is
  what ledger L-201 asks of one surface drawn twice. Absent falls back to
  `mine`, so a surface that has no role in hand behaves as the lab does.
  */
  deletable?: boolean
  replies?: ConceptComment[]
}

export interface ConceptTask {
  id: string
  title: string
  done?: boolean
  /*
  **The one widening this file makes, and it is a named seam.**

  The prototype's folder is `{name, color}`, because its store is name-keyed
  and a name is the only handle it has. Dana addresses a folder by id (7.4),
  and RFC 0004's close forbids the name-keyed store crossing in any form. So
  `id` is added and left optional: a lifted card that sets a name and a colour
  still typechecks and still behaves, and a picker written against this client
  sets the id, which `tasks/task-writer.tsx` prefers over the name. Optional
  rather than required so `components/task-card.tsx` and
  `components/task-row.tsx` cross verbatim at S23, which is the whole point of
  the exercise.

  The same widening, for the same reason, on `assignee` below.
  */
  folder?: { name: string; color: string; id?: string }
  /* A due date is a day, not a moment. There was a `dueTime` here until
     2026-08-18; Imran ruled the Due picker date-only, and a field nothing
     can set is a field the next person has to work out the fate of. A task
     that needs a time of day has a reminder, which carries one. */
  due?: { label: string; overdue?: boolean }
  reminder?: string
  repeatEvery?: string
  repeatDays?: string[]
  repeatEnds?: string
  /*
  Three values, and the third is the one issue #169 was about.

  A person is a person. **An absent one means nobody is assigned** where this
  is a whole task, and means "this field was not touched" where it is the
  `Partial<ConceptTask>` an edit reports. One `undefined` cannot serve both
  readings, which is why **`null` is added: it is the patch that says "clear
  the assignee"**, the one thing this type could not say before.
  `conceptPatchToBody` turns it into 7.6's `assignee_id: null`, and ledger
  L-094's "unassigned is a member of the set, not the absence of one" is the
  same rule read from the card's side.

  So a reader of a whole task treats the two empties alike, nobody is
  assigned either way, and every reader here already does: each asks
  `task.assignee?.name`, `Boolean(task.assignee)` or `!task.assignee`. A
  writer of a patch has to choose between them, and that choice is the whole
  point of the widening.
  */
  assignee?: { initials: string; name: string; image?: string; id?: string } | null
  /* Steps are the items themselves rather than a count, so the count is
     derived and ticking one in an expanded card moves the number in the row
     behind it. A count that cannot be wrong is better than a count. */
  steps?: ConceptStep[]
  attachments?: Attachment[]
  /* Which unit a recurrence counts in. */
  repeatUnit?: 'day' | 'week' | 'month' | 'year'
  recurrence?: boolean
  pulled?: boolean
  important?: boolean
  abandoned?: boolean
  notes?: string
  /* The conversation about the task, pinned after the content blocks and
     outside their order: commentary is not content. DES-129. */
  comments?: ConceptComment[]
}

export function stepCount(task: ConceptTask): { done: number; total: number } | null {
  if (!task.steps || task.steps.length === 0) return null
  return {
    done: task.steps.filter((s) => s.done).length,
    total: task.steps.length,
  }
}

export function commentCount(comments: ConceptComment[] | undefined): number {
  if (!comments) return 0
  return comments.reduce(
    (sum, comment) => sum + 1 + (comment.replies?.length ?? 0),
    0,
  )
}

/* ------------------------------------------------------------------ *
 * The wording half, which S22 named and left for this row
 * ------------------------------------------------------------------ */
/*
S22's own header said what is below and why it was not there yet: the
prototype's `dueLabelFor`, `dueChipValue`, `reminderChipValue`, `repeatShort`,
`repeatSummary`, `parseDueLabel`, `dayStamp` "and their neighbours ... are not
withheld, they are somebody else's row: they turn a field into the words a
chip or a row says, and the surfaces that say them arrive at S23." This is
S23, and they arrive here rather than beside the surfaces for the reason this
file's own header gives: the row and its card disagreed twice while each wrote
its own copy of one fact, "the row said Weekly about a task that repeated on
weekdays", and both faults were one fact written down in two places.

**What crossed and what did not, named rather than discovered.** Everything
that turns a field into words crossed verbatim. What stayed behind is the
fixture half again, `PEOPLE`, `FACE_*` and the portraits, and three functions
that answer a question this client answers elsewhere:

- **`LAB_TODAY` and `TODAY_ISO` do not cross in any form**, RFC 0004's close
  forbidding a fixture in any form, and `today()` below is their seam. The
  prototype froze a Monday in August 2026 so its screens and its calendar
  would agree with each other; this client's today is 4.11's, evaluated in
  `api/tz.ts`, which its own header records as the only place a date is
  evaluated. So `today()` is a pass-through and never a second clock, exactly
  as `presenterToday()` is one.
- **`firstName` does not cross.** Its own header says why: "a real client
  would compare ids and none of this survives the port", and
  `lib/people-library.ts` already made that the case for `isSamePerson`.
- **`personTint` is re-exported rather than transcribed.** The colour is
  `parts/person-tint.ts`'s, which `components/person-face.tsx` has used since
  S17a, and one person must be one colour on every surface. A second copy of
  the hash here is the fault this whole file exists to prevent.

**And the due label is the one place two answers already existed**, so the
seam is worth stating. `parts/presenters.ts` owns `dueDisplay`, which builds a
label from 4.11's today and 9.7's clock against 8.10's three cases, and
`tasks/task-concept.ts` puts that label on `ConceptTask.due`. `dueLabelFor`
below is the *inverse direction*, a date the person just picked turned back
into the same words, and `parseDueLabel` reads those words back out for a
calendar to highlight. They are the picker's half of one round trip and are
here because that is where every caller of them is. What they must never
become is a second answer to "what does this task's date say", which is
`dueDisplay`'s and reaches a card through the mapper.
*/

/* The short absolute form, "18 Aug", which every chip, heading and range label
   uses. The long form is the Done page's day headings, and the two are the
   only two this product has. */
export function dayStamp(date: Date): string {
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()] ?? ''}`
}

/*
And back out again in the same words, so a date set from the picker reads in
the row exactly like one that was always there.

**The wording is `parts/presenters.ts`'s and is restated rather than
imported**, which is this repository's own discipline for normative copy: that
module is pure and takes a `TaskCard`, and this is called with a bare `Date`
from inside a picker that has no card yet. The three forms are 8.10's three
cases, so there is nothing here for the two to disagree about that a criterion
would not catch, and AC-183 asserts the sentences.
*/
export function dueLabelFor(date: Date): { label: string; overdue?: boolean } {
  const rung = dayRung(date)
  if (rung === 'today') return { label: 'Due today' }
  if (rung === 'tomorrow') return { label: 'Due tomorrow' }
  if (rung === 'overdue') {
    return { label: `Overdue · ${dayStamp(date)}`, overdue: true }
  }
  return { label: `Due ${dayStamp(date)}` }
}

/* "Sat 15 Aug", the hint beside a preset, so "This weekend" says which day it
   actually means before anybody commits to it. */
export function shortDate(date: Date): string {
  return `${DAY_SHORT[date.getDay()] ?? ''} ${date.getDate()} ${MONTH_SHORT[date.getMonth()] ?? ''}`
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
    head = `${every === 1 ? 'Weekly' : `Every ${every} weeks`} on ${days.join(', ')}`
  } else {
    head =
      every === 1
        ? `Weekly on ${DAY_LONG[anchor.getDay()] ?? ''}`
        : `Every ${every} weeks`
  }
  return task.repeatEnds ? `${head}, until ${task.repeatEnds}` : head
}

/* The same rule in one word, for the row, where "Every 2 weeks on Mo, We, Fr"
   would eat the space five other details are sharing. The row says which kind
   of repeat it is and the card it opens says exactly which one.

   Both come from here, which is the point: the row used to carry the literal
   word "Weekly" whatever the rule actually was, so setting "Every weekday" in
   the card left the row two lines above it saying something untrue. */
export function repeatShort(task: ConceptTask): string {
  if (!task.recurrence) return 'Does not repeat'
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

/* The words on a due chip. One function for the same reason the repeat summary
   is one: the row and the card both draw this, and the last time each wrote
   its own, the row spent a day saying "Weekly" about a task that repeated on
   weekdays. No clock here: a due date is a day. */
export function dueChipValue(task: ConceptTask): string {
  return task.due ? task.due.label : 'No date'
}

/* A reminder is a sentence with a time somewhere inside it rather than a time
   with words around it, so the clock is swapped in place and the rest is left
   exactly as it was written. */
/*
**Seam, S23: the chip reads the field, and the field is a clock time.**

The prototype's reminder is a sentence with a time inside it, "Sat 31 Aug
at 09:00", because its reminders are relative and a relative one has to
say which day it lands on. 9.3's v2 row retired that arm: the reminder is
"one picker, a time on that day", and the day is the due date, which the
chip beside this one already says. So what is left to render is the time.

**And it is rendered as stored rather than re-clocked**, which is the one
place this file departs from `lib/time-format.ts`'s reach. AC-170 reads
the chip back after a reload and holds it to the value the picker was
given, "a reload shows what was stored rather than what was typed, which
is the difference between a value that was written and a value that was
held". 4.8 stores a clock time, 7.9 takes one, the picker is a control
that takes one, and a chip that answered in a different notation from all
three would be the only place in the round trip speaking another
language. The viewer's clock still governs every time this client *words*
rather than echoes, which is the due label and the history line.

`format` stays in the signature and is unused, because the prototype's
callers pass it and a lifted file that had to drop an argument is a
lifted file that has left the strategy.
*/
export function reminderChipValue(task: ConceptTask, _format: TimeFormat): string {
  if (!task.reminder) return 'No reminder'
  return task.reminder.match(/(\d{1,2}:\d{2})/)?.[1] ?? task.reminder
}

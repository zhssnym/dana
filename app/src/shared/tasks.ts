/*
The 7.6, 7.7, and 7.8 task surface as code: the request bodies the server
validates with, and the 7.0 TaskCard and TaskDetail objects both sides read.

The body-schema conventions are me.ts's and folders.ts's: z.object so unknown
fields are stripped, never refused (7.0 tolerates them), a camelCase schema
named for method and route, its inferred PascalCase type beside it, and
per-field messages phrased without the field name, because
sendValidationError prefixes the path when it builds the 422 (10.3).

Both write bodies state every field 7.6 gives them, recurrence_rule and
reminder included, and 7.9's PUT body joins them. shared/recurrence.js carries
the 4.11 grammar and the reminder primitives below carry 4.8's two modes.

The response bodies 7.7 and 7.8 leave open are settled at the end of this
file, with the grounds beside the names.
*/
import { z } from 'zod'

import { folderMemberUser, folderName } from './folders.js'
import { taskLabels } from './labels.js'
import { parseRecurrenceRule } from './recurrence.js'

/*
Present-and-not-null, the test every dependency rule below is phrased with.
An absent field and a null field differ everywhere else in this file, and on
those rules they agree: neither sets a value, so neither can demand one.

Written as a type guard rather than a plain predicate so the rules that go on
to read inside the value they tested, which the reminder's two mode rules do,
narrow through it instead of repeating the two comparisons. The call sites
that only ask the question read exactly as they did.
*/
function isSet<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

/* ------------------------------------------------------------------ *
 * Field primitives
 * ------------------------------------------------------------------ */

/*
One definition each, so the write path, the read path, and the client's
convenience validation cannot drift. The lengths are 10.3's rows, and 4.5 and
4.6 back each with a column of the same size.
*/
export const TASK_TITLE_LIMIT = 300
export const TASK_NOTES_LIMIT = 10000

export const taskTitle = z
  .string({ error: 'must be a string' })
  .min(1, { error: `must be 1 to ${String(TASK_TITLE_LIMIT)} characters` })
  .max(TASK_TITLE_LIMIT, {
    error: `must be 1 to ${String(TASK_TITLE_LIMIT)} characters`,
  })

// 10.3 writes task title and step title on one row, so they are one rule.
// The second name exists for the call site, not for a second limit.
export const stepTitle = taskTitle

export const taskNotes = z
  .string({ error: 'must be a string' })
  .max(TASK_NOTES_LIMIT, {
    error: `must be at most ${String(TASK_NOTES_LIMIT)} characters`,
  })

/*
4.11 stores due_date as a floating calendar date, so the wire carries
YYYY-MM-DD and never an instant, which would reintroduce the timezone the
format exists to remove. z.iso.date in the installed zod 4.4.3 is
calendar-aware, refusing 2026-02-30 rather than only checking the shape,
verified against the package per 11.15 rather than recalled.
*/
export const dueDate = z.iso.date({
  error: 'must be a calendar date in YYYY-MM-DD form',
})

/*
4.11 stores due_time as a floating wall-clock time at minute precision. The
write form admits HH:MM, which is what a time input yields, and HH:MM:00,
which is what a client that formats its own seconds field sends. A non-zero
second is refused rather than truncated: the column cannot hold it, and a
silent truncation returns a value the caller never sent. Written out rather
than taken from z.iso.time({ precision: -1 }), which is the minute-precision
form in the installed zod but refuses the trailing zeros.

The domain module renders every time through to_char(..., 'HH24:MI'), so a
body read back from this API is always HH:MM. The tolerance stays anyway:
HH:MM:00 names the same minute, and refusing it would be a rule about spelling
rather than about time.
*/
export const dueTime = z
  .string({ error: 'must be a string' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, {
    error: 'must be a wall-clock time in HH:MM form, at minute precision',
  })

/*
The read side of the same value. Postgres renders TIME as HH:MM:SS, so a
response tolerates the seconds field the write side pins to zero; it is the
same value, which is the acceptance harness's reading of 4.11 too.
*/
export const wallClockTime = z.iso.time({
  error: 'must be a wall-clock time',
})

/*
4.5's three statuses. A response field only: no request body in this file
carries a status, because 7.6 refuses one on PATCH and 8.3 routes every
status write through the four transition endpoints.
*/
export const taskStatus = z.enum(['pending', 'completed', 'abandoned'], {
  error: 'must be pending, completed, or abandoned',
})
export type TaskStatus = z.infer<typeof taskStatus>

/*
4.6 makes position a plain integer sort key with gaps allowed, so the bound
is the column's rather than a rule of its own: z.int32 refuses what an
integer column cannot hold, which is the difference between a 422 naming the
field and a driver error wearing a 500.
*/
export const stepPosition = z.int32({ error: 'must be a 32-bit integer' })

/*
10.3's reminder offset row, matching the 4.8 CHECK. Both a request and a
response field, read from the same place, which is what one definition is for.
*/
export const reminderOffsetMinutes = z
  .int({ error: 'must be an integer' })
  .min(0, { error: 'must be 0 to 10080 minutes' })
  .max(10080, { error: 'must be 0 to 10080 minutes' })

/*
4.8's other mode, a TIME column at minute precision, which is due_time's rule
at a different column: the stepTitle case, a second name for the call site
rather than a second limit. Written as the write form deliberately, so a
reminder is spelled on the wire the way a due_time is; wallClockTime below is
the tolerant read form both sides answer with, and the two are not
interchangeable.
*/
export const reminderTimeOfDay = dueTime

/*
4.8's exclusive-or, "CHECK ((offset_minutes IS NULL) <> (time_of_day IS
NULL))", as one predicate. The request objects and the response object each
state it once by calling this rather than by carrying a copy, because a
constraint written three times is three things that can disagree, and this
one is the whole of what 7.9 means by a mode.

It reads the parsed shape, where an absent key and a null key have already
become one thing, so "carries" means non-null and nothing subtler.
*/
function carriesExactlyOneMode(reminder: {
  offset_minutes: number | null
  time_of_day: string | null
}): boolean {
  return (reminder.offset_minutes === null) !== (reminder.time_of_day === null)
}

/*
The reminder as a request states it: 4.8's two columns, the write forms, with
absent and null meaning the same thing and exactly one of the two carrying a
value.

The nulls are deliberate and are what lets a client echo back what it read.
7.0 answers TaskDetail's reminder with both keys always and one of them null,
so a client that reads a task and sends its reminder
back sends { offset_minutes: 30, time_of_day: null }. A schema admitting only
the one-key spelling would refuse the object this API just handed out. The
rule that decides both spellings is the same 4.8 CHECK: null is not a mode, so
{ offset_minutes: null } carries none and is refused with the empty object
(AC-147), while { offset_minutes: 30, time_of_day: null } carries one.

.default(null) rather than .optional() so the parsed value is always both
keys, which is the 4.8 row and the 7.0 object, and so the domain module reads
one shape whichever spelling arrived. This is not the "absent survives as
absent" rule the PATCH body keeps below: there, absence means leave the column
alone, and here a reminder body states its whole mode, 7.9 upserting the row
rather than patching it.
*/
const reminderShape = {
  offset_minutes: reminderOffsetMinutes.nullable().default(null),
  time_of_day: reminderTimeOfDay.nullable().default(null),
}

const reminderModes = z.object(reminderShape)

/** 4.8's exclusive-or as a caller reads it under a reminder key. The whole
 * sentence 7.9's body answers with is in putTaskReminderBody below: one
 * predicate, two phrasings, and the phrasing follows the position. */
const EXACTLY_ONE_MODE = 'must carry exactly one of offset_minutes and time_of_day'

export const reminderInput = reminderModes.refine(carriesExactlyOneMode, {
  error: EXACTLY_ONE_MODE,
})
export type ReminderInput = z.infer<typeof reminderInput>

/*
The same object under the one key that has to refuse a null, which is the
whole difference between the two and the reason this schema exists rather
than reminderInput being reused with .optional().

The message is the only thing on the wire that tells a client where removal lives (see
patchTaskBody below), and without it the refusal is the validator's own
"expected object, received null", which reads as a complaint about a type to a
caller who was asking for a removal. The shape literal is shared rather than copied,
because 4.8's two columns written twice are two things that can disagree; what
differs is the sentence, which is what the position is about.
*/
const patchReminderInput = z
  .object(reminderShape, {
    error:
      'must be a reminder object; removal is DELETE /tasks/:id/reminder, never a null here',
  })
  .refine(carriesExactlyOneMode, { error: EXACTLY_ONE_MODE })

/*
The 4.11 rule string, and the one definition the write path, the read path and
the client's convenience validation all read.

Two checks, and neither replaces the other. 4.5 bounds the column at 200
characters and 10.3 makes that a server-enforced limit; 4.11 bounds the
grammar and requires the subset revalidated server-side. A rule can be
grammatical and still too long, because BYDAY admits a repeated day list, so a
validator holding either check alone lets one of the two failures through: the
grammar-only one reaches the column and fails there as a 500, and the
length-only one stores free-form input 4.11's last sentence rejects. Both fire
when both are broken, which is 10.3's one-answer rule in errors.ts.

The grammar itself is shared/recurrence.js and deliberately not restated here.
Its refusal reason is written in 4.11's terms for exactly this use, so the
message on the wire says which part of the subset the caller left rather than
naming the subset again; sendValidationError prefixes the field, as it does
for every other 10.3 message in this file.

A wrong-typed value never reaches the grammar: z.string refuses it first with
this file's phrasing, which is 7.0's rule that on a parsed object a wrong type
is a 422 naming the field rather than a 400.

**The rule is stored and answered byte for byte, and nothing here normalizes
it.** The grammar module parses without exporting a formatter, so a
value that is inside the subset rides to the column as the caller spelled it
and rides back the same way. Two things follow, and both are wanted. A client
reading a task it just created sees the string it sent rather than one a
parser chose, which is what 4.11 asks for by calling the column an RRULE value
string rather than a set of parts. And the day the preset builder of 4.11's
last sentence arrives with a serializer beside the parser, normalizing on
write becomes a change to what stored rows say, visible and arguable, instead
of a silent difference between two spellings of one rule. The grammar's own
tolerances are its to state: part order is free, a repeated BYDAY token is
dropped for evaluation while the stored string keeps it, and neither is a
value this file may quietly rewrite.

Also the read side, which is what one definition means. A stored rule is
inside the subset by construction, because this primitive is the only door
into the column that the API of 11.1 offers, so validating a response against
it asserts that and costs nothing.
*/
export const recurrenceRule = z
  .string({ error: 'must be a string' })
  .max(200, { error: 'must be at most 200 characters' })
  .superRefine((value, ctx) => {
    const parsed = parseRecurrenceRule(value)
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: parsed.reason })
    }
  })

// Every id the bodies below carry is a uuid and nothing more: what it points
// at, and whether V may point at it, are questions only the rows answer.
const uuid = z.uuid({ error: 'must be a uuid' })

/* ------------------------------------------------------------------ *
 * 7.6 request bodies
 * ------------------------------------------------------------------ */

/*
POST /tasks, 7.6's body whole.

The three defaults 7.6 names, folder_id to V's Inbox, assignee_id to V, and
important to false, are resolved where V is known rather than here. Two of
the three cannot be written without the caller, and one rule with two homes
is how drift starts.

assignee_id admits null explicitly. 7.6 forces the assignee in a
single-member folder ignoring the input, and the forcing wins over the composite-FK 422 on this endpoint, so a null here
is a value the create repairs rather than a refusal (AC-026).

steps is a list of titles, 7.6's own notation, capped at 10.3's 50. The cap
is a body fact on this endpoint and a row count on 7.7's, which is why both
carry it.

reminder admits null for the reason recurrence_rule and notes do: on a create
there is no prior row, so a null and an absent field both say "no reminder"
and neither can demand a date. Every guard 7.9 and 4.8 put on a reminder is
answered here rather than by the row, which is the whole difference between
this body and the PATCH below: a create states the task's due_date and
due_time itself, so both dependency and mode are relations between fields of
one body. The three refinements below are exactly those, and AC-149 measures
them through this door while AC-090 and AC-147 measure the same rules through
7.9's.

Guards that are state rather than body stay out: membership of the named
folder (404), the assignee's membership (422), and the single-member forcing
all need rows to answer, and 7.11 lists them as server-authoritative there.
*/
export const postTasksBody = z
  .object({
    title: taskTitle,
    folder_id: uuid.optional(),
    notes: taskNotes.nullable().optional(),
    important: z.boolean({ error: 'must be a boolean' }).optional(),
    start_date: dueDate.nullable().optional(),
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    recurrence_rule: recurrenceRule.nullable().optional(),
    assignee_id: uuid.nullable().optional(),
    // 4.5: the section this task sits under on its folder's
    // page; null is the loose block. Membership of the named block in the
    // task's folder is the server's to check (7.11).
    section_block_id: uuid.nullable().optional(),
    reminder: reminderInput.nullable().optional(),
    steps: z
      .array(stepTitle)
      .max(50, { error: 'must be at most 50 steps' })
      .optional(),
  })
  /*
  7.6's dependency check, and the whole of it that a create body can answer:
  INV-6 admits a due_time only beside a due_date, and 4.5 backs it with a
  CHECK. The refusal is here so the answer is a 422 naming the field rather
  than the constraint's 500 (AC-027). The path names due_time because that
  is the field the caller sent.
  */
  .refine((body) => !isSet(body.due_time) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['due_time'],
  })
  /*
  The same check on the other dependent field 7.6 names, and a create body
  answers this one whole too: nothing in it is state, because a create has no
  prior row to carry a date. 4.5's CHECK (recurrence_rule IS NULL OR due_date
  IS NOT NULL) is the same rule at the column, and the refusal is here for the
  same reason the one above it is, so a caller reads a 422 naming the field
  rather than a constraint violation wearing a 500.

  Null is not a rule, which isSet is exactly the test for: a create carrying
  recurrence_rule null and no date sets neither and is the ordinary undated
  create.
  */
  .refine((body) => !isSet(body.recurrence_rule) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['recurrence_rule'],
  })
  /*
  The third field of 7.6's one-breath dependency check, "due_time,
  recurrence_rule, reminder require due_date; 422", and INV-6 again. It is
  the last of the three to be stated here because it is the last to become a
  field of this body at all, and it answers whole for the reason the other
  two do: a create carries no prior row, so the date the reminder needs is
  the one this body sets or none. AC-149 asserts the refusal and asserts that
  the whole create rolls back with it, which a 422 raised before any row is
  written satisfies by construction.
  */
  .refine((body) => !isSet(body.reminder) || isSet(body.due_date), {
    error: 'requires a due_date',
    path: ['reminder'],
  })
  /*
  4.8's cross-table rule, "which mode is legal depends on the task's
  due_time, offset requires it and time_of_day requires its absence", which
  4.8 calls enforced by the API and restated at every write. On this write it
  is a relation between two fields of one body, because the task's due_time
  is whatever this body sets and nothing else, so it is stated here and the
  create path needs no second copy of it; on 7.9's PUT and on the PATCH the
  same rule reads a row and is the domain module's, which is where AC-090's
  first clause and AC-147's converse land.

  Two refinements rather than one so the 422 names the mode the caller sent
  rather than the pair, the way every other message in this file names the
  field that is wrong.
  */
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.offset_minutes === null ||
      isSet(body.due_time),
    {
      error: 'requires a due_time on the task, which this body does not set',
      path: ['reminder', 'offset_minutes'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.time_of_day === null ||
      !isSet(body.due_time),
    {
      error: 'is the mode for a task without a due_time, and this body sets one',
      path: ['reminder', 'time_of_day'],
    },
  )
  /*
  The Schedule's own rule, 4.5's tasks_start_before_due_check said as a 422
  (issue #215). A create body answers it whole for the reason the three
  dependency checks above answer theirs: there is no prior row, so both dates
  are this body's or neither is.

  It is only a rule when both are set. Start alone, due alone and neither are
  the other three valid states, and isSet is what tells a null apart from an
  absence — a create carrying start_date null is the ordinary create, not a
  task starting on the null date.

  The path names start_date rather than the pair, the way every other message
  in this file names one field: of the two it is the one the person just moved
  in the case this refuses, since a due date already earlier than a start is
  what makes the start illegal.
  */
  .refine(
    (body) =>
      !isSet(body.start_date) ||
      !isSet(body.due_date) ||
      body.start_date <= body.due_date,
    {
      error: 'must not be later than due_date',
      path: ['start_date'],
    },
  )
export type PostTasksBody = z.infer<typeof postTasksBody>

/*
PATCH /tasks/:id. Partial by 7.6's own sentence, "only present fields
change", which is 8.3's field-level last write wins: absent must survive
parsing as absent rather than as an undefined value, because a handler that
writes every key it finds blanks the fields nobody sent, and AC-035 races
exactly that.

Nullability is the column's, field by field. notes, due_date, due_time, and
assignee_id are nullable in 4.5 and null clears each; title is NOT NULL and
folder_id is INV-1's, never null, so neither admits it.

A null assignee_id parses here and is refused by the folder rather than by
the body: 7.6 answers 409 for the unassign only in a single-member folder,
which INV-5 calls the unassign guard, and that guard applies to this endpoint
alone. The same null is repaired on create. One value, two answers,
and only the rows can tell them apart (AC-032).

due_date null is the clear-date cascade of 8.4, not merely a null write; the
cascade itself is the domain module's, inside the PATCH transaction.

recurrence_rule carries the same nullability for the same reason, 4.5 making
the column nullable, and 7.6 gives each of its two values a meaning: a rule
sets or replaces the series rule, and null ends the series while the row stays
a normal task. Which of the two happened is the domain module's to act on;
what this schema settles is that both are legal bodies and that the string is
inside the 4.11 subset before either can be.

**reminder is the one field here that admits an object and not a null**, and
the asymmetry is deliberate. Every nullable field above is a column of 4.5
whose null is a value the column holds; a reminder is a row of 4.8, and its
absence is the row not existing, which 7.9 gives an endpoint of its own:
DELETE /tasks/:id/reminder, 204 and idempotent. So a PATCH sets or replaces
the reminder, through the same upsert and the same guards the PUT uses, and
removal keeps its one door rather than gaining a second, unasserted one. A
null here is refused with a 422 naming the field, which is 7.0's answer to a
wrong type on a parsed object, so a client that meant to clear the reminder is
told where to go rather than answered 200 by a route that quietly did nothing.

Why the narrow reading: 7.6 names no clearing semantics for this field, and
8.6's "reminder removal" reads either way. Removal is spelled DELETE
everywhere else in the contract, and 7.9 spells this one that way. The narrow
reading widens later by accepting a body refused today, while the wide one
could only narrow by taking back a body that worked. No criterion asserts a
PATCH removal, so a wide reading would be a delete path nothing measures. And
a second door onto one row is a second place for 8.4's cascade ordering to be
got right. A PATCH that clears a reminder would be a contract change to 7.6
with a criterion of its own, not something to add quietly here.

The asymmetry with the create body, where reminder does admit null, is the
same rule read on two bodies: on a create there is no prior row, so null and
absent both say "no reminder", while on a partial body absent means leave the
row alone and null would have to mean something this contract has not said.

Absent from the shape: status, which 7.6 refuses with 409 rather than 422.
See carriesStatus below. Absent too, the state-dependent half of INV-6: a
due_time sent alone is legal against a dated task and refused against an
undated one, which needs the row and so belongs to the domain module (7.11
lists the date-dependency rules as always revalidated). 7.6's "requires
due_date" on a rule set against a task without one is the same shape of rule
and lands the same way: a rule sent alone is legal against a dated task, and
only the row can say which this is. A reminder sent alone is the third
instance of that shape and the largest: its dependency on a due_date and its
mode against the task's due_time are both the row's to answer here, where the
create body answers both itself.
*/
export const patchTaskBody = z
  .object({
    title: taskTitle.optional(),
    notes: taskNotes.nullable().optional(),
    important: z.boolean({ error: 'must be a boolean' }).optional(),
    start_date: dueDate.nullable().optional(),
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    recurrence_rule: recurrenceRule.nullable().optional(),
    folder_id: uuid.optional(),
    assignee_id: uuid.nullable().optional(),
    section_block_id: uuid.nullable().optional(),
    reminder: patchReminderInput.optional(),
  })
  /*
  The one INV-6 violation a PATCH body states without any help from the row:
  clearing the date while setting the time. 8.4 nulls due_time on that clear,
  so honoring both would silently drop one of the two fields the caller sent.
  */
  .refine((body) => !(body.due_date === null && isSet(body.due_time)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['due_time'],
  })
  /*
  And its twin, for the third field 8.4's cascade nulls. The cascade is what
  makes this a contradiction rather than an ordering: a body that clears the
  date and sets a rule asks for a row 4.5's CHECK forbids, and honoring it in
  either order would drop one of the two fields the caller sent rather than
  telling them so. The rule-and-date pair sent together stays legal, and is
  how 7.6's dependency is satisfied on a task that had no date.
  */
  .refine((body) => !(body.due_date === null && isSet(body.recurrence_rule)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['recurrence_rule'],
  })
  /*
  And the third, for the row 8.4's cascade deletes rather than the columns it
  nulls. A body that clears the date and sets a reminder asks for the two
  halves of one transaction to undo each other: the cascade deletes the
  reminder, and honoring the field would write back a row 4.8 says cannot
  exist beside a null due_date. It is refused for the reason the two above
  are, that either order silently drops one of the two fields the caller
  sent, and INV-6 is the invariant behind all three.
  */
  .refine((body) => !(body.due_date === null && isSet(body.reminder)), {
    error: 'cannot be set in a body that clears due_date',
    path: ['reminder'],
  })
  /*
  4.8's mode rule, in the one direction a PATCH body states without the row.
  The task's due_time after this PATCH is what the body sets when the body
  sets it, whatever the row held, so a body that moves due_time across the
  null boundary decides the legal mode by itself, and 8.4's arms make honoring
  both fields impossible in the same way the two
  refinements above do: setting due_time deletes a time_of_day reminder and
  clearing it deletes an offset one, so the reminder the caller sent in the
  same body is the one the cascade would delete.

  The other direction stays with the row and is the domain module's: a
  reminder sent with no due_time in the body is legal or not according to the
  column the task already carries, and a due_time that moves between two
  non-null values invalidates no mode at all (8.4's closing paragraph, AC-151
  and AC-164's third clause).
  */
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.offset_minutes === null ||
      body.due_time !== null,
    {
      error: 'is the mode for a task with a due_time, and this body clears it',
      path: ['reminder', 'offset_minutes'],
    },
  )
  .refine(
    (body) =>
      !isSet(body.reminder) ||
      body.reminder.time_of_day === null ||
      !isSet(body.due_time),
    {
      error: 'is the mode for a task without a due_time, and this body sets one',
      path: ['reminder', 'time_of_day'],
    },
  )
export type PatchTaskBody = z.infer<typeof patchTaskBody>

/*
7.6: "status is not accepted here (409 if present)". Presence, not value: the
status a task already has is refused too, because 8.3 routes every status
write through the four guarded transition endpoints so recurrence generation
stays exactly-once (AC-034).

It is a predicate beside the schema rather than a field inside it because the
schema's failures are 422s through sendValidationError, and this one is a
409. It is also why patchTaskBody does not mention status: a field the object
does not declare is stripped, and a stripped field would answer 200. The
route asks this first, and answers the 409 itself.

Asked before access resolves, too: a task the caller owns, one they cannot see, and an
id that names nothing all answer the same 409, so a refusal that reads no row
tells a prober nothing about which rows exist. The same ordering already
stands on 7.4, where a malformed body answers 422 ahead of the folder's 404.

A JSON body cannot carry an undefined value, so the key's presence is the
whole test.
*/
export function carriesStatus(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'status' in body
  )
}

/* ------------------------------------------------------------------ *
 * 7.6's order endpoint
 * ------------------------------------------------------------------ */

/*
POST /tasks/:id/order. The two rows the task was dropped between in its
folder's unscheduled list, either null where the drop had no neighbour on
that side.

The body carries no key and no index, and both absences are deliberate. A
key would put this contract's own arithmetic on the client's side of it. An
index would be a claim about a list the client may have read a minute ago,
where two ids are a claim about two rows that either are still peers or are
not, which the server can check and answer 422 about.

Both null is the one-row list, which has one place to be. Nothing further is
validated here: whether the two ids name rows of the same list, and in the
order the body claims, is a question about rows, so it is the domain
module's and answers 422 naming the field it was asked about.
*/
export const postTaskOrderBody = z.object({
  after_id: z.uuid().nullable(),
  before_id: z.uuid().nullable(),
})
export type PostTaskOrderBody = z.infer<typeof postTaskOrderBody>

/* ------------------------------------------------------------------ *
 * 7.7 request bodies
 * ------------------------------------------------------------------ */

// POST /tasks/:id/steps. { title, position optional }, 7.7. The default
// position, max plus 1, is a count of the task's rows, so it is resolved
// where the rows are; the 50 cap is a live row count for the same reason
// (4.6 makes it an API guard rather than a constraint).
export const postTaskStepsBody = z.object({
  title: stepTitle,
  position: stepPosition.optional(),
})
export type PostTaskStepsBody = z.infer<typeof postTaskStepsBody>

// PATCH /steps/:id. { title, done, position } any subset, 7.7, read the way
// every section 7 PATCH is: absent unchanged, every
// present value valid, and the empty body a no-op rather than a refusal.
export const patchStepBody = z.object({
  title: stepTitle.optional(),
  done: z.boolean({ error: 'must be a boolean' }).optional(),
  position: stepPosition.optional(),
})
export type PatchStepBody = z.infer<typeof patchStepBody>

/* ------------------------------------------------------------------ *
 * 7.9 request bodies
 * ------------------------------------------------------------------ */

/*
PUT /tasks/:id/reminder, 7.9: "{ offset_minutes } when the task has
due_time, { time_of_day } when it does not; wrong mode 422; task without
due_date 422 (INV-6)".

The body is the reminder object and nothing else, so this is reminderInput
under the name the route reads it by, with one difference that is presentation
rather than rule. The exclusive-or is the same predicate, and it is the only
half of that sentence a body can answer: which mode is legal depends on the
task's due_time and whether a reminder is legal at all depends on the task's
due_date, and both are the row's, which is why AC-090's first clause and every
case of AC-147 but one are raised by the domain module. The one this schema
answers is the last, an offset outside 10.3's range, which is a property of
the value the caller sent.

The message is a whole sentence here and a fragment inside the two 7.6 bodies,
because it is read in two positions. Nested under a reminder key,
sendValidationError prefixes the field and "reminder: must carry exactly one
of ..." is what a caller reads. Here there is no field to prefix: the rule is
about the body, so it says so itself, and errors.ts answers a body-level rule
with its own words. One predicate, two phrasings, and the phrasing follows the
position rather than the rule.
*/
export const putTaskReminderBody = reminderModes.refine(carriesExactlyOneMode, {
  error: 'Exactly one of offset_minutes and time_of_day is required.',
})
export type PutTaskReminderBody = z.infer<typeof putTaskReminderBody>

/*
What the row answers, written here rather than derived three times.

The reminder's guards fall in two places and this file is one of them, so the
other half is named where a reader of this half will look for it, the way the
domain module already names the halves this file answers for INV-6 and for the
4.11 rule. Every rule below needs a row, which is why no schema states it, and
each answers a 422 through sendFieldValidationError so a caller cannot tell
which validator refused them (10.3, and errors.ts's own reason for having one
formatter).

- **A reminder requires the task's due_date**, INV-6 and 7.9's second 422.
  Both modes are refused on a dateless task rather than only one: with no date
  the offset arm has no due_time INV-6 would permit and the date-only arm has
  no date to attach a time to (AC-147).
- **The mode is legal against the task's due_time**, 4.8's cross-table rule:
  offset requires it, time_of_day requires its absence. AC-090's first clause
  is one direction and AC-147's second case is the other. The field named is
  the mode the caller sent, offset_minutes or time_of_day, which is the name
  this file uses for the same refusals on the create.
- **The task must be accessible**, 404 before any of the above (10.2, and
  AC-147's last case: a 422 about the body would confirm the task exists).
- **The instant and the state are 8.6's**, computed by planReminder in
  src/server/time and never here: fire_at, state and fired_at are written
  together on both arms of the upsert, and 7.9's own reset to scheduled, or to
  skipped when the computed instant is already past, is that module's answer
  rather than a field this body carries.

8.6's trigger list names an arm for the reminder's own value and mode, and it
deliberately has no caller: every write path to this row goes through the
upsert, which asks planReminder what the row should be written as. A
recompute after it would take a second clock reading, so an instant falling
between the two calls would be scheduled by one and skipped by the other.

On the PATCH, one further half: a reminder sent with no due_time in the body
is legal or not by the column the row already holds, and the 8.4 cascade runs
before any recompute, so a body that both invalidates a mode and sets a
reminder is refused above rather than resolved by ordering.

And the thing a schema cannot make anyone do, said once because its failure is
silent rather than loud. Three bodies now carry a reminder and each is a write
path to the one row 4.8 keys by task_id: 7.9's PUT, 7.6's create, and 7.6's
PATCH. A route that parses one of them and does not act on the field answers
its ordinary success with the field dropped, which is indistinguishable on the
wire from a request that never carried a reminder. The PATCH arm has no
criterion at all, so nothing but this sentence will notice it.
*/

/* ------------------------------------------------------------------ *
 * The endpoints that take no request body, which is a decision
 * ------------------------------------------------------------------ */

/*
POST and DELETE /tasks/:id/my-day take no request body in 7.8, and neither
do 7.6's four transition endpoints or its DELETE, nor 7.9's DELETE
/tasks/:id/reminder: the task is the path, and the actor is the session. So no
schema stands here, and the routes must not require one. What those calls
answer is settled at the end of this file. 7.9's DELETE answers 204, which
carries nothing, while the PUT beside it answers a TaskDetail; that is the
contract rather than an oversight.

7.0 answers 422 for a body an endpoint needed and did not receive. An endpoint
that needs no body has nothing to miss, so a bodyless POST is a legal call.
Declaring z.object({}) here would be harmless in what it accepts and wrong in
what it teaches: it would read as an endpoint with a body whose fields are all
unknown.

A second DELETE /tasks/:id answers 404 under 7.0's error envelope; the first
answers 204. Neither needs a shape here.
*/

/* ------------------------------------------------------------------ *
 * The 7.0 response shapes
 * ------------------------------------------------------------------ */

/*
TaskCard and TaskDetail live here for me.ts's reason: app/src/shared is the
one artifact the client, the server, and the tests all import, and a shape
declared beside a handler is a second definition of the same promise. 7.0
enumerates both, so the enumeration below is a transcription and every
departure from it would be a change to section 7 in disguise.

Every view endpoint of 7.10 answers TaskCard rows from this definition rather
than from a per-endpoint variant.
*/

// The folder a card names: 7.0's own three fields, the identity plus what a
// chip renders. It is a projection of the Folder object rather than the
// object, because a card carrying counts and personal fields would answer a
// question the card never asks.
export const taskCardFolder = z.object({
  id: z.uuid(),
  name: folderName,
  is_default: z.boolean(),
})

/*
The reminder TaskDetail carries. 7.0 writes it as "{offset_minutes or
time_of_day} or null", which names 4.8's mode rather than a key list, so the
rendering is this file's to fix: both keys always, exactly one non-null, the
projection of the row. Chosen over a one-key object per mode because the
storage and the wire then cannot drift apart, and a client reads a stable key
set instead of narrowing a union to learn which mode it holds.

The refinement is the 4.8 CHECK restated: exactly one mode, never both and
never neither. It is the predicate the request objects call, not a second copy
of it: the constraint guards a write as well as a read, and a rule stated twice is a rule that can one day disagree
with itself.

The two sides read the same modes through different primitives, and that is
the one place they are deliberately not identical. The write forms hold a
reminder to 4.11's minute precision the way due_time is held; this shape reads
the tolerant wallClockTime, because Postgres renders TIME as HH:MM:SS and a
response reports the column.
*/
export const taskReminder = z
  .object({
    offset_minutes: reminderOffsetMinutes.nullable(),
    time_of_day: wallClockTime.nullable(),
  })
  .refine(carriesExactlyOneMode, {
    error: 'must carry exactly one of offset_minutes and time_of_day',
  })
export type TaskReminder = z.infer<typeof taskReminder>

// A step as TaskDetail carries it (7.0). The order is 4.6's, (position, id),
// and an order is the query's to produce, never the shape's to declare.
export const taskStep = z.object({
  id: z.uuid(),
  title: stepTitle,
  done: z.boolean(),
  position: stepPosition,
})
export type TaskStep = z.infer<typeof taskStep>

/*
TaskCard, field for field as 7.0 gives it.

Each field from its owning section: status is 4.5's CHECK; due_date and
due_time are 4.11's floating values, read tolerantly; the assignee is
folderMemberUser, the person shape 7.4's members element already carries, one
object rather than two that can disagree; is_recurring reports the rule the
row holds, which is why it is a boolean here and the rule itself is
TaskDetail's; steps_done and steps_total are counts of 4.6 rows; pulled is
the viewer's own My Day entry (7.0 says so outright), so one row answers it
differently for two members and it is read from the entry rather than from
the status: an abandoned task keeps the entry, so it keeps pulled true while
8.2 leaves it off the page; pending_invite_email is derived from
invites.task_id; created_at and updated_at are NOT NULL in 4.5 and never null here.

section_block_id is 4.5's column, the 4.17 section block the task sits under
on its folder's page, null for a task under none. It rides the card rather
than a private element of the folder read because GET /folders/:id/tasks
answers arrays of TaskCards, so section on the folder read is section on
TaskCard, and a second element shape for one endpoint is the per-endpoint
variant this file exists to refuse. It moved up out of TaskDetail's extend
below rather than being added twice.

created_by is the person stub assignee already carries, for the reason 7.4's
note gives about the members element: a heading that names a person needs
exactly what a card's person label needs. It is nullable although 4.5 makes
the column NOT NULL, and there is exactly one door to the null, 8.10's scrub
of the creator's account, which is what that section's "renders as Deleted
user" means on the wire.
*/
export const taskCard = z.object({
  id: z.uuid(),
  title: taskTitle,
  status: taskStatus,
  important: z.boolean(),
  /* 4.5 and 7.0 as issue #215 amends them: a task's Schedule is the pair, and
     start_date reads through the same primitive due_date does because it is
     the same floating calendar date in the same column type. */
  start_date: dueDate.nullable(),
  due_date: dueDate.nullable(),
  due_time: wallClockTime.nullable(),
  folder: taskCardFolder,
  assignee: folderMemberUser.nullable(),
  is_recurring: z.boolean(),
  steps_done: z.int().nonnegative(),
  steps_total: z.int().nonnegative(),
  pulled: z.boolean(),
  pending_invite_email: z.string().min(1).nullable(),
  section_block_id: z.uuid().nullable(),
  created_by: folderMemberUser.nullable(),
  /*
  The M1 Label projection (issue #226, parent #208): the viewer's own Personal
  Labels applied to this Task, and the Task's Folder Labels, and never another
  member's Personal ones.

  It rides the card rather than the detail for `section_block_id`'s reason:
  every list endpoint of 7.10 answers arrays of TaskCards, and a Label chip on
  a row is the whole point of the feature, so a Label on the folder read has
  to be a Label on TaskCard. Both arrays are always present and may be empty;
  the shape and its order are `shared/labels.ts`'s.

  Two members reading the same Task get the same `folder` array and different
  `personal` arrays, which is the same per-viewer field `pulled` already is.
  */
  labels: taskLabels,
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})
export type TaskCard = z.infer<typeof taskCard>

/*
TaskDetail, TaskCard plus 7.0's seven. section_block_id and created_by live
on the card and are not restated here, because a key spelled in both places is
a key two shapes can disagree about. Built by extension rather than by
restatement, because 7.0 defines it that way.

recurrence_rule reads the same primitive the request side does, so the two
sides cannot drift.

completed_at and completed_by are INV-8's pair, set exactly when the status
is completed; the invariant is the row's and the shape does not restate it,
because a shape that refused a legal row would fail a truth rather than
report it. completed_by stays a bare id, 7.0's own notation for it, while
created_by is the person stub; the asymmetry is the contract's rather than an
oversight.

**series_id and recurrence_rule are independent, and a row may carry the first
without the second.** 7.6 states one half of this and is silent on the other. The half it states is generation's:
8.5 moves the rule onto the successor, so a completed occurrence reads
recurrence_rule null and series_id set, and it must, since that id is the only
thing linking a finished occurrence to the ones that follow it. The half it
leaves open is the PATCH that ends a series, where 7.6 says the series ends and
the row stays a normal task and says nothing about the id. It stays, which is
the same pair meaning the same thing in both cases: series_id reports which
series a row belongs to, including one that has stopped, and is_recurring
reports whether the row is repeating now. Clearing it on the PATCH arm alone
would make one shape answer two questions depending on how the series ended,
and would erase a link 8.5 spends a column maintaining. A client that wants
"is this task repeating" reads is_recurring, which 7.0 put on the card for
exactly that, and never the presence of an id.
*/
export const taskDetail = taskCard.extend({
  notes: taskNotes.nullable(),
  recurrence_rule: recurrenceRule.nullable(),
  series_id: z.uuid().nullable(),
  reminder: taskReminder.nullable(),
  steps: z.array(taskStep),
  completed_at: z.iso.datetime().nullable(),
  completed_by: z.uuid().nullable(),
})
export type TaskDetail = z.infer<typeof taskDetail>

/*
The transition envelope, which 7.6 writes out for all four endpoints:
"200 { task: TaskDetail, generated_task: TaskCard or null,
deleted_successor_id or null }". One shape for the four, because complete,
uncomplete, abandon, and restore differ in what they fill, never in what they
answer. Generation is 8.5's and G-SERIES is 5.1's.

- **generated_task is 7.0's TaskCard and is the successor's own object**, not
  a card assembled for this response. The domain module derives it from the
  TaskDetail it already read by dropping 7.0's detail keys, so it matches a
  fresh GET of the same row field for field. A second SELECT shaped for this endpoint would be a per-endpoint variant that
  passes every key check while drifting on a value.
- **The two are never both filled.** 5.1 gives generation to complete and
  abandon and G-SERIES to uncomplete and restore. They are one fact read
  twice: the id deleted_successor_id reports removing is the id generated_task
  reported creating.
- **A no-op fills neither**, whatever the row carries. 5.1's no-op writes
  nothing, so there is nothing for either key to report.

8.5 copies the reminder onto the successor, and generated_task is a TaskCard,
which 7.0 gives no reminder key, so a client learns that the successor
acquired one from a GET or not at all. Putting reminder on the card to report
this one effect would change what every view endpoint of 7.10 answers.

Known gap: 8.5's copy writes state = 'scheduled' flatly, discarding the state
8.6's computation returned. Where the successor's instant is already past by
less than six hours, the delivery loop (which selects state = 'scheduled' with
fire_at <= now() and skips only what is more than six hours stale) delivers
it, which is the retroactive fire 8.6 forbids. A daily task with a one-day
lead time completed an hour after its due time reaches it. The fix is for
8.5's arm to keep the computed state, as 7.9's PUT does.
*/
export const taskTransitionResponse = z.object({
  task: taskDetail,
  generated_task: taskCard.nullable(),
  deleted_successor_id: z.uuid().nullable(),
})
export type TaskTransitionResponse = z.infer<typeof taskTransitionResponse>

/* ------------------------------------------------------------------ *
 * What each endpoint answers
 * ------------------------------------------------------------------ */

/*
The surface as a map, one name bound to one shape, the folders.ts idiom. 7.6
writes "201 TaskDetail" on the create, "TaskDetail" on the read, and "200
TaskDetail" on the PATCH; 7.9's PUT answers 200 with the affected TaskDetail.

7.7 gives its endpoints statuses and names no body; 7.8 answers 200 on both of
its calls and names none either. Read against the rest of section 7, that
silence has one answer: a mutation answers what a fresh GET would, as 7.1,
7.2 and 7.4 state outright.

Neither a step, a My Day entry nor a reminder is a resource in this contract:
7.0 gives none a shape of its own and section 7 offers no GET for any. The
only GET whose answer these mutations change is GET /tasks/:id, and they
change more of it than the row they touch: a step mutation moves steps_done
and steps_total, a pull moves pulled. So the TaskDetail is the only object in
the contract that reports what the call did.

Two consequences, both places a reader might expect something else:

- POST /tasks/:id/steps answers 201 with the parent task rather than with the
  step it created, unlike 7.4's POST members, which answers the member element.
  A members element is a shape 7.4 enumerates and the 9.x sharing panel renders
  on its own, while a step is only ever seen inside its task, and the created
  step rides along in the steps array with the id and position the server
  assigned it.
- DELETE /steps/:id answers 204 and no body at all. 7.7 fixes that status, and
  a 204 carrying a body is a protocol violation.

The DELETE endpoints gain no name: they answer 204 and carry nothing.
*/
export const postTasksResponse = taskDetail
export const getTaskResponse = taskDetail
export const patchTaskResponse = taskDetail
export const postTaskStepsResponse = taskDetail
export const patchStepResponse = taskDetail
export const postTaskMyDayResponse = taskDetail
export const deleteTaskMyDayResponse = taskDetail
export const putTaskReminderResponse = taskDetail

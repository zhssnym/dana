/*
The 7.6, 7.7, and 7.8 task surface as code: the request bodies the server
validates with, and the 7.0 TaskCard and TaskDetail objects both sides read.

The body-schema conventions are me.ts's and folders.ts's: z.object so unknown
fields are stripped, never refused (7.0 tolerates them), a camelCase schema
named for method and route, its inferred PascalCase type beside it, and
per-field messages phrased without the field name, because
sendValidationError prefixes the path when it builds the 422 (10.3).

Two arms of frozen 7.6's body are deliberately absent from the request
schemas, by the P3 kickoff ruling the RFC 0001 row records: recurrence_rule
needs the 4.11 subset validator that 4.11 itself requires revalidated
server-side, which P6 delivers, and reminder needs the 8.6 fire instant that
4.8's NOT NULL fire_at demands, which P7 delivers. At P3 both fall to 7.0's
tolerated-unknown rule, so a body carrying either parses and the field is
stripped: a rule accepted here would be an unvalidated rule, and a reminder
accepted here would be a row that cannot be written. The absence is from the
request side only. Both are keys of frozen 7.0's TaskDetail, so the response
shapes below carry them from this package on.

The response bodies frozen 7.7 and 7.8 leave open are settled at the end of
this file, at the P3 endpoint shape review, with the implemented routes in
front of it and with the grounds beside the names. The schemas stopped where
the frozen text stopped until that review, the way folders.ts left the P2
wrapper question to the review that followed it.
*/
import { z } from 'zod'

import { folderMemberUser, folderName } from './folders.js'

/*
Present-and-not-null, the test both dependency rules below are phrased with.
An absent field and a null field differ everywhere else in this file, and on
these two rules they agree: neither sets a value, so neither can demand one.
*/
function isSet(value: unknown): boolean {
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
export const taskTitle = z
  .string({ error: 'must be a string' })
  .min(1, { error: 'must be 1 to 300 characters' })
  .max(300, { error: 'must be 1 to 300 characters' })

// 10.3 writes task title and step title on one row, so they are one rule.
// The second name exists for the call site, not for a second limit.
export const stepTitle = taskTitle

export const taskNotes = z
  .string({ error: 'must be a string' })
  .max(10000, { error: 'must be at most 10000 characters' })

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

Checked again at the P3 shape review, because the tolerance was first written
for an echo the responses no longer produce: the domain module renders every
time through to_char(..., 'HH24:MI'), so a body read back from this API is
always HH:MM and never carries seconds to echo. The tolerance stays anyway,
now on its own footing rather than that one: HH:MM:00 names the same minute,
and refusing it would be a rule about spelling rather than about time.
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
10.3's reminder offset row, matching the 4.8 CHECK. A response field at P3:
7.9's PUT body rides P7 with the computation it needs, and the reminder arm
of 7.6's create body is deferred with it.
*/
export const reminderOffsetMinutes = z
  .int({ error: 'must be an integer' })
  .min(0, { error: 'must be 0 to 10080 minutes' })
  .max(10080, { error: 'must be 0 to 10080 minutes' })

/*
A response field for the same reason: the 4.11 subset is P6's to validate,
and this pins only what 4.5 pins, a string of at most 200 characters. When
P6's validator lands it belongs here, in front of this primitive, so the
write path and the read path keep one definition.
*/
export const recurrenceRule = z
  .string({ error: 'must be a string' })
  .max(200, { error: 'must be at most 200 characters' })

// Every id the bodies below carry is a uuid and nothing more: what it points
// at, and whether V may point at it, are questions only the rows answer.
const uuid = z.uuid({ error: 'must be a uuid' })

/* ------------------------------------------------------------------ *
 * 7.6 request bodies
 * ------------------------------------------------------------------ */

/*
POST /tasks, frozen 7.6's body less the two deferred arms.

The three defaults 7.6 names, folder_id to V's Inbox, assignee_id to V, and
important to false, are resolved where V is known rather than here. Two of
the three cannot be written without the caller, and one rule with two homes
is how drift starts.

assignee_id admits null explicitly. 7.6 forces the assignee in a
single-member folder ignoring the input, and the mid-P3 ruling settles that
the forcing wins over the composite-FK 422 on this endpoint, so a null here
is a value the create repairs rather than a refusal (AC-026).

steps is a list of titles, 7.6's own notation, capped at 10.3's 50. The cap
is a body fact on this endpoint and a row count on 7.7's, which is why both
carry it.

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
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    assignee_id: uuid.nullable().optional(),
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
which INV-5 calls the unassign guard and the mid-P3 ruling scopes to this
endpoint alone. The same null is repaired on create. One value, two answers,
and only the rows can tell them apart (AC-032).

due_date null is the clear-date cascade of 8.4, not merely a null write; the
cascade itself is the domain module's, inside the PATCH transaction.

Absent from the shape: status, which 7.6 refuses with 409 rather than 422.
See carriesStatus below. Absent too, the state-dependent half of INV-6: a
due_time sent alone is legal against a dated task and refused against an
undated one, which needs the row and so belongs to the domain module (7.11
lists the date-dependency rules as always revalidated).
*/
export const patchTaskBody = z
  .object({
    title: taskTitle.optional(),
    notes: taskNotes.nullable().optional(),
    important: z.boolean({ error: 'must be a boolean' }).optional(),
    due_date: dueDate.nullable().optional(),
    due_time: dueTime.nullable().optional(),
    folder_id: uuid.optional(),
    assignee_id: uuid.nullable().optional(),
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

Asked before access resolves, too, which the P3 shape review checked on the
wire rather than assumed: a task the caller owns, one they cannot see, and an
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
// the P2 merge ratified for every section 7 PATCH: absent unchanged, every
// present value valid, and the empty body a no-op rather than a refusal.
export const patchStepBody = z.object({
  title: stepTitle.optional(),
  done: z.boolean({ error: 'must be a boolean' }).optional(),
  position: stepPosition.optional(),
})
export type PatchStepBody = z.infer<typeof patchStepBody>

/* ------------------------------------------------------------------ *
 * The endpoints that take no request body, which is a decision
 * ------------------------------------------------------------------ */

/*
POST and DELETE /tasks/:id/my-day take no request body in frozen 7.8, and
neither do 7.6's four transition endpoints or its DELETE: the task is the
path, and the actor is the session. So no schema stands here, and the routes
must not require one. What those calls answer is a separate question, settled
at the end of this file.

The distinction matters because of the P2 ruling on 7.0's first bullet, which
answers 422 for a body an endpoint needed and did not receive. An endpoint
that needs no body has nothing to miss, so a bodyless POST is a legal call
and answers what the endpoint answers. Declaring z.object({}) here would be
harmless in what it accepts and wrong in what it teaches: it would read as an
endpoint with a body whose fields are all unknown.

The mid-P3 ruling that a second DELETE /tasks/:id answers 404 lands entirely
in the taxonomy rather than in a shape: the first answers 204, which carries
no body, and the second answers 7.0's error envelope under the code the 404
already has. Nothing here changes, and that is worth writing down, because a
ruling that touches no schema is otherwise indistinguishable from one nobody
read.
*/

/* ------------------------------------------------------------------ *
 * The 7.0 response shapes
 * ------------------------------------------------------------------ */

/*
TaskCard and TaskDetail live here for me.ts's reason: app/src/shared is the
one artifact the client, the server, and the tests all import, and a shape
declared beside a handler is a second definition of the same promise. 7.0
enumerates both, and 7.0 is frozen, so the enumeration below is a
transcription and every departure from it would be a change to section 7 in
disguise.

Every view endpoint of 7.10 answers TaskCard rows, and P4 fills them from this
definition rather than from a per-endpoint variant, which is the drift this
role exists to prevent.
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
rendering is this role's to fix: both keys always, exactly one non-null, the
projection of the row. Chosen over a one-key object per mode because the
storage and the wire then cannot drift apart, and a client reads a stable key
set instead of narrowing a union to learn which mode it holds.

The refinement is the 4.8 CHECK restated: exactly one mode, never both and
never neither.
*/
export const taskReminder = z
  .object({
    offset_minutes: reminderOffsetMinutes.nullable(),
    time_of_day: wallClockTime.nullable(),
  })
  .refine(
    (reminder) =>
      (reminder.offset_minutes === null) !== (reminder.time_of_day === null),
    { error: 'must carry exactly one of offset_minutes and time_of_day' },
  )
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
the status, which the mid-P3 ruling makes visible: an abandoned task keeps
the entry, so it keeps pulled true while 8.2 leaves it off the page;
pending_invite_email is derived from
invites.task_id, whose rows arrive with P5, and is null until then;
created_at and updated_at are NOT NULL in 4.5 and never null here.
*/
export const taskCard = z.object({
  id: z.uuid(),
  title: taskTitle,
  status: taskStatus,
  important: z.boolean(),
  due_date: dueDate.nullable(),
  due_time: wallClockTime.nullable(),
  folder: taskCardFolder,
  assignee: folderMemberUser.nullable(),
  is_recurring: z.boolean(),
  steps_done: z.int().nonnegative(),
  steps_total: z.int().nonnegative(),
  pulled: z.boolean(),
  pending_invite_email: z.string().min(1).nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})
export type TaskCard = z.infer<typeof taskCard>

/*
TaskDetail, TaskCard plus 7.0's eight. Built by extension rather than by
restatement, because 7.0 defines it that way and because a card that drifts
from the detail is the per-endpoint variant this role refuses.

recurrence_rule and reminder are here while their request arms are not: the
keys are frozen 7.0's, and a response that omitted them would be a shape the
client cannot rely on. At P3 the rule is null unless a row was seeded, and
the reminder is read from the 4.8 table.

completed_at and completed_by are INV-8's pair, set exactly when the status
is completed; the invariant is the row's and the shape does not restate it,
because a shape that refused a legal row would fail a truth rather than
report it. created_by is NOT NULL in 4.5. Both people are bare ids, 7.0's own
notation: it spells the assignee's person shape out and leaves these plain.
*/
export const taskDetail = taskCard.extend({
  notes: taskNotes.nullable(),
  recurrence_rule: recurrenceRule.nullable(),
  series_id: z.uuid().nullable(),
  reminder: taskReminder.nullable(),
  steps: z.array(taskStep),
  completed_at: z.iso.datetime().nullable(),
  completed_by: z.uuid().nullable(),
  created_by: z.uuid(),
})
export type TaskDetail = z.infer<typeof taskDetail>

/*
The transition envelope, which frozen 7.6 writes out for all four endpoints:
"200 { task: TaskDetail, generated_task: TaskCard or null,
deleted_successor_id or null }". One shape for the four, because complete,
uncomplete, abandon, and restore differ in what they fill, never in what they
answer.

Both companions are null through P3: generation is 8.5's and G-SERIES is
5.1's, and both arrive with P6's engine. The keys are 7.6's from the first
transition that answers.
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
The surface as a map, one name bound to one shape, the folders.ts idiom. Three
of the seven are transcription: 7.6 writes "201 TaskDetail" on the create,
"TaskDetail" on the read, and "200 TaskDetail" on the PATCH. The other four
are what the P3 endpoint shape review settled, and the grounds are here
because this file is where a reader looks for the shape of an answer.

Frozen 7.7 gives its three endpoints statuses and names no body; frozen 7.8
answers 200 on both of its calls and names none either. Read against the rest
of section 7, that silence has one answer: a mutation answers what a fresh
GET would. 7.1 states it outright for PATCH /me, and the owner has since
entered it twice more, in 7.2's closing paragraph and in 7.4's. This is the
same question a fourth time, and answering it differently here would make the
convention a coincidence.

Which fresh GET is not open either. Neither a step nor a My Day entry is a
resource in this contract: 7.7 and 7.8 hang both off a task, 7.0 gives neither
a shape of its own, and section 7 offers no GET for either. The only GET whose
answer either mutation changes is GET /tasks/:id, and both change more of it
than the row they touch. A step mutation moves steps_done and steps_total, the
counts a card renders, as well as the steps array; a pull moves pulled, which
7.0 makes a field of the task and not an entry. So the TaskDetail is not
merely a defensible answer, it is the only object in the contract that reports
what the call did.

Two consequences, both places a reader might expect something else:

- POST /tasks/:id/steps answers 201 with the parent task rather than with the
  step it created, unlike 7.4's POST members, which answers the member element
  by owner ruling. The difference is that a members element is a shape frozen
  7.4 enumerates and the 9.x sharing panel renders on its own, while a step is
  only ever seen inside its task, and the created step rides along in the
  steps array with the id and position the server assigned it.
- DELETE /steps/:id answers 204 and no body at all. Frozen 7.7 fixes that
  status, and a 204 carrying a body is not a shape decision but a protocol
  violation, so the asymmetry with the PATCH beside it is the contract's and
  not this review's.

Recommended to the Steward, and through them to the human owner, as the P2
shape review's four sentences were: one closing paragraph on 7.7 and one on
7.8 recording the settlement in the frozen text. Nothing here waits on that;
the shapes are bound below and the wire is checked against them in
src/server/http/tasks-contract.test.ts.
*/
export const postTasksResponse = taskDetail
export const getTaskResponse = taskDetail
export const patchTaskResponse = taskDetail
export const postTaskStepsResponse = taskDetail
export const patchStepResponse = taskDetail
export const postTaskMyDayResponse = taskDetail
export const deleteTaskMyDayResponse = taskDetail

/*
The P3 domain module: tasks, steps, and My Day membership per spec 7.6, 7.7,
and 7.8, the 5.1 status machine with 8.3's guarded updates, the 8.4
clear-date cascade, and the INV-4 and INV-5 assignment rules. Routes validate
and serialize; every decision that touches rows is here, behind the 10.2 rule
that no query leaves this file without being scoped to the viewer, which for
tasks means the membership join every read below carries.

Results are discriminated unions rather than thrown statuses, the P2 module's
convention, so the route layer owns the mapping onto 7.0's taxonomy and this
file stays testable without HTTP.

Both seams this file opened at P3 are closed now, and both the same way:

- **Generation (8.5) and G-SERIES (5.1)** are wired at P6. Neither is
  implemented here: both are the Scheduling engineer's functions, taken from
  src/server/time as transaction-taking black boxes per the transitions seam
  of docs/team/README.md, and what this file owns is where they are called
  from. Generation runs in the winning branch of the complete and abandon
  updates, inside the same transaction, which is what makes it exactly-once
  under any race (8.3); the guard runs ahead of the uncomplete and restore
  updates, and only on a row still in the status the transition expects,
  because a repeat call on an already-pending row is 5.1's no-op and must
  write nothing. The two companion fields the 7.6 envelope names, null since
  P3, are answered from those two calls.
- **The 8.6 fire instant and its recompute triggers** are wired at P7, on the
  same terms and by the reminders seam of the same file: planReminder answers
  what a row about to be written must carry, recomputeReminders answers what a
  row that already exists must become, and no arithmetic is restated here.
  Four of 8.6's five triggers fire in this file, three inside patchTask
  (due_date, due_time, assignee_id) and one inside the 7.9 upsert; the fifth
  is the assignee's own timezone and fires in the auth module, where frozen
  7.1 puts it. Each call is made after this file's own write and inside the
  same transaction, which is the one thing a caller of that module can get
  wrong silently: called first, it computes from the state the write replaced.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PatchStepBody,
  PatchTaskBody,
  PostTaskStepsBody,
  PostTasksBody,
  PutTaskReminderBody,
  ReminderInput,
  TaskCard,
  TaskDetail,
  TaskStatus,
  TaskStep,
} from '../../shared/tasks.js'
import {
  applySeriesGuard,
  generateSuccessor,
  planReminder,
  recomputeReminders,
  today,
} from '../time/index.js'
import type { ReminderTrigger } from '../time/index.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
import { recordEvent } from './events.js'
import { accessOf } from './folders.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

/** Timestamps leave the drivers as Date on one backend and as a string on
 * the other; the wire format is the ISO instant either way (the P2 module's
 * helper, kept local for the reason db.ts records about its own copies). */
function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/*
Floating dates and times are read through to_char rather than through the
driver. 4.11 fixes both formats, and the two backends disagree about the
raw values: PGlite renders a date as a string while node-postgres parses
OID 1082 into a JS Date, which would serialize as an instant and reintroduce
the timezone the floating format exists to remove. One SQL cast makes the
wire identical on both.
*/
const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

/* ------------------------------------------------------------------ *
 * Access resolution: the 10.2 chokepoint fact for a task
 * ------------------------------------------------------------------ */

export interface TaskAccess {
  id: string
  folderId: string
  /** The name at act time, which 4.13 makes part of every event line. */
  title: string
  status: TaskStatus
  assigneeId: string | null
  dueDate: string | null
  dueTime: string | null
  /** The rule the row holds, which two decisions read: whether a PATCH is
   * setting a rule or changing one, 7.6 minting a series_id for the first and
   * not the second, and whether a transition is one 8.5 generates from, which
   * frozen 7.6 makes the condition of its tz rule. The series_id itself is
   * not here: the guard that needs it reads it under its own lock. */
  recurrenceRule: string | null
}

const TASK_ACCESS_COLUMNS = sql`t.id, t.folder_id, t.title, t.status,
       t.assignee_id, ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
       t.recurrence_rule`

function taskAccessFromRow(row: Record<string, unknown>): TaskAccess {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    assigneeId: nullableString(row.assignee_id),
    dueDate: nullableString(row.due_date),
    dueTime: nullableString(row.due_time),
    recurrenceRule: nullableString(row.recurrence_rule),
  }
}

/** Null means the task does not exist or lives in a folder the viewer is not
 * a member of, which 10.2 makes the same answer: 404, never 403. The
 * membership join is the scope, so no caller can forget it. */
export async function accessibleTask(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT ${TASK_ACCESS_COLUMNS}
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
        WHERE t.id = ${taskId} AND t.deleted_at IS NULL`,
  )
  const row = found[0]
  return row === undefined ? null : taskAccessFromRow(row)
}

/*
The same resolution, holding the row for the rest of the transaction. Two
callers need it, for reasons of one shape:

- A PATCH reads the folder and assignee it is about to reason over, and a
  transition arriving between that read and the write would otherwise decide
  against a state that no longer exists.
- A step add reads a count it is about to act on, and 4.6 puts no constraint
  behind the 50 cap, so the count and the insert have to be one decision or
  the cap is advice rather than a limit.

Decide from a row, then write: the lock is what keeps the decision true at the
write. Only the task row is locked, never the membership row it joins, and
both callers take it as their first statement, so two of them queue rather
than deadlock.
*/
async function lockedTask(
  tx: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT ${TASK_ACCESS_COLUMNS}
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
        WHERE t.id = ${taskId} AND t.deleted_at IS NULL
        FOR UPDATE OF t`,
  )
  const row = found[0]
  return row === undefined ? null : taskAccessFromRow(row)
}

/*
The membership list of one folder, which answers both questions the
assignment rules ask: whether a proposed assignee is a member (INV-4, the
composite FK surfaced as 422 rather than as a constraint error) and how many
members the folder has (INV-5, the forcing and the unassign guard). One query
for both, because two queries are two answers that can disagree under a
concurrent membership change.
*/
/** The name an assignment's event line and detail carry (4.13). */
async function displayNameOf(
  executor: Executor,
  userId: string,
): Promise<string> {
  const found = await rowsOf(
    executor,
    sql`SELECT display_name FROM users WHERE id = ${userId}`,
  )
  const name = found[0]?.display_name
  return name === null || name === undefined ? 'a member' : String(name)
}

async function folderMemberIds(
  executor: Executor,
  folderId: string,
): Promise<string[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT user_id FROM folder_members WHERE folder_id = ${folderId}
        ORDER BY user_id`,
  )
  return found.map((row) => String(row.user_id))
}

/** 7.6's create default: the folder every account is provisioned with (7.1),
 * unique per owner by INV-2's partial index. */
async function inboxOf(executor: Executor, viewerId: string): Promise<string> {
  const found = await rowsOf(
    executor,
    sql`SELECT id FROM folders WHERE owner_id = ${viewerId} AND is_default`,
  )
  const row = found[0]
  if (row === undefined) {
    // INV-2 makes this unreachable for a live account; a missing Inbox is a
    // provisioning failure, not a request the caller can fix.
    throw new Error(`user ${viewerId} has no default folder (INV-2)`)
  }
  return String(row.id)
}

/* ------------------------------------------------------------------ *
 * The 7.0 TaskDetail
 * ------------------------------------------------------------------ */

/*
One read serves every endpoint in this package, because 7.6 answers the
TaskDetail from the create, the read, the PATCH and the four transitions, and
a second projection of the same object is the per-endpoint variant the
contract exists to prevent. The membership join scopes it exactly as the
access resolution does, so serializing is never a way around 10.2.

Field truths, each from its owning section: the folder chip is 7.0's three
fields; the assignee is the person shape 7.4's members element carries;
is_recurring reports the rule the row holds; the two step counts are counts
of 4.6 rows; pulled is the viewer's own My Day entry, so one row answers it
differently for two members; pending_invite_email comes from invites.task_id
(7.0), whose rows P5 writes and this package only reads; the reminder is the
4.8 row projected as both its columns with exactly one non-null.

The creator arrived as a person shape with RFC 0005 unit 12a and is joined
rather than rendered from the column: 4.5 makes created_by NOT NULL, so the
join is on 4.1's row and its one null is the scrub, which is why the ON
clause carries deleted_at rather than the projection carrying a case. The
join is LEFT for that reason alone, never because the column can be null.
*/
export async function taskView(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT t.id, t.title, t.status, t.important, t.notes,
               ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
               t.recurrence_rule, t.series_id,
               t.completed_at, t.completed_by,
               cb.id AS creator_id, cb.display_name AS creator_display_name,
               cb.avatar_url AS creator_avatar_url,
               t.created_at, t.updated_at,
               f.id AS folder_id, f.name AS folder_name,
               f.is_default AS folder_is_default,
               a.id AS assignee_id, a.display_name AS assignee_display_name,
               a.avatar_url AS assignee_avatar_url,
               (SELECT count(*)::int FROM steps s WHERE s.task_id = t.id)
                 AS steps_total,
               (SELECT count(*)::int FROM steps s
                 WHERE s.task_id = t.id AND s.done) AS steps_done,
               EXISTS (SELECT 1 FROM my_day_entries e
                        WHERE e.task_id = t.id AND e.user_id = ${viewerId})
                 AS pulled,
               (SELECT i.email FROM invites i
                 WHERE i.task_id = t.id AND i.status = 'pending'
                 ORDER BY i.created_at DESC, i.id DESC LIMIT 1)
                 AS pending_invite_email,
               r.task_id AS reminder_task_id, r.offset_minutes,
               to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day,
               t.section_block_id
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
        LEFT JOIN users a ON a.id = t.assignee_id
        LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
        LEFT JOIN reminders r ON r.task_id = t.id
        WHERE t.id = ${taskId} AND t.deleted_at IS NULL`,
  )
  const row = found[0]
  if (row === undefined) return null

  return {
    id: String(row.id),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    important: row.important === true,
    due_date: nullableString(row.due_date),
    due_time: nullableString(row.due_time),
    folder: {
      id: String(row.folder_id),
      name: String(row.folder_name),
      is_default: row.folder_is_default === true,
    },
    assignee:
      row.assignee_id === null || row.assignee_id === undefined
        ? null
        : {
            id: String(row.assignee_id),
            display_name: nullableString(row.assignee_display_name),
            avatar_url: nullableString(row.assignee_avatar_url),
          },
    is_recurring: row.recurrence_rule !== null,
    steps_done: Number(row.steps_done),
    steps_total: Number(row.steps_total),
    pulled: row.pulled === true,
    pending_invite_email: nullableString(row.pending_invite_email),
    section_block_id: nullableString(row.section_block_id),
    created_by:
      row.creator_id === null || row.creator_id === undefined
        ? null
        : {
            id: String(row.creator_id),
            display_name: nullableString(row.creator_display_name),
            avatar_url: nullableString(row.creator_avatar_url),
          },
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    notes: nullableString(row.notes),
    recurrence_rule: nullableString(row.recurrence_rule),
    series_id: nullableString(row.series_id),
    reminder:
      row.reminder_task_id === null || row.reminder_task_id === undefined
        ? null
        : {
            offset_minutes:
              row.offset_minutes === null || row.offset_minutes === undefined
                ? null
                : Number(row.offset_minutes),
            time_of_day: nullableString(row.reminder_time_of_day),
          },
    steps: await stepsOf(executor, taskId),
    completed_at: row.completed_at === null ? null : toIso(row.completed_at),
    completed_by: nullableString(row.completed_by),
  }
}

/*
7.0's TaskCard, which is 7.0's TaskDetail less its seven, and the shape frozen
7.6 gives generated_task. It was eight until RFC 0005 unit 12a moved
section_block_id and created_by onto the card, and both therefore come off
this strip list rather than being restated anywhere. It is derived from the detail rather than read by a
second query for the reason the detail's own comment gives: one read serves
every endpoint here, and a card built from its own SELECT is the per-endpoint
variant the contract exists to prevent. The views module answers cards from
list queries, which is a different question (many rows, one statement) and not
one this file can borrow an answer from for a single row it has already read.
*/
function cardOf(detail: TaskDetail): TaskCard {
  const {
    notes: _notes,
    recurrence_rule: _rule,
    series_id: _seriesId,
    reminder: _reminder,
    steps: _steps,
    completed_at: _completedAt,
    completed_by: _completedBy,
    ...card
  } = detail
  return card
}

/** 4.6's order, (position, id), which is the shape's to carry and the
 * query's to produce. */
async function stepsOf(
  executor: Executor,
  taskId: string,
): Promise<TaskStep[]> {
  const found = await rowsOf(
    executor,
    sql`SELECT id, title, done, position FROM steps
        WHERE task_id = ${taskId}
        ORDER BY position ASC, id ASC`,
  )
  return found.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    done: row.done === true,
    position: Number(row.position),
  }))
}

/** The view of a task the caller has already resolved access on. Reaching
 * here with a task that vanished mid-transaction is impossible under the row
 * lock, and answering a degenerate body would be worse than failing. */
async function viewOrFail(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskDetail> {
  const view = await taskView(executor, viewerId, taskId)
  if (view === null) {
    throw new Error(`task ${taskId} vanished between write and read`)
  }
  return view
}

/* ------------------------------------------------------------------ *
 * The 4.8 reminder row: frozen 7.9's two endpoints, and the arm both of
 * 7.6's write bodies carry
 * ------------------------------------------------------------------ */

/*
Three write paths reach the one row 4.8 keys by task_id: frozen 7.9's PUT,
7.6's create body, and 7.6's PATCH body. They are one upsert and one guard
below rather than three of each, for the reason 4.8 gives itself: the mode
rule is "cross-table and enforced by the API, restated at every write", and
restated is exactly where two call sites drift. AC-149's last case measures
the drift by making the same request through two of the three doors and
comparing the stored instants.
*/

/** 4.8's exclusive-or as the three write paths hand it over: exactly one of
 * the two is non-null, which the schemas in src/shared have already checked. */
interface ReminderMode {
  offsetMinutes: number | null
  timeOfDay: string | null
}

function modeOf(reminder: ReminderInput | PutTaskReminderBody): ReminderMode {
  return {
    offsetMinutes: reminder.offset_minutes,
    timeOfDay: reminder.time_of_day,
  }
}

/** A 422 the row answers rather than the body, carried out to the route so
 * it names the field the way sendValidationError would. */
export interface ReminderRefusal {
  field: 'offset_minutes' | 'time_of_day'
  problem: string
}

/*
Frozen 7.9's two 422s, against the task as it will stand after this request's
own writes. Both need a row and neither can be a schema rule: whether a
reminder is legal at all depends on the task's due_date (INV-6, and 7.9's
second refusal), and which mode is legal depends on the task's due_time
(4.8). The create body is the one exception and answers both itself, because
a create states those two columns in the same breath as the reminder.

The field named is the mode the caller sent. Naming the pair instead would
tell a client that something about its reminder is wrong without saying which
half, and every other 10.3 message in this codebase names one field.

The no-date refusal is checked first and covers both modes, not just the
offset one: with no due_date the offset arm has no due_time INV-6 would
permit, and the date-only arm has no date to attach its wall time to (AC-147).
*/
function reminderRefusal(
  dueDate: string | null,
  dueTime: string | null,
  mode: ReminderMode,
): ReminderRefusal | null {
  const field = mode.offsetMinutes !== null ? 'offset_minutes' : 'time_of_day'
  if (dueDate === null) {
    return { field, problem: 'requires a due_date on the task (INV-6)' }
  }
  if (mode.offsetMinutes !== null && dueTime === null) {
    return {
      field,
      problem: 'is the mode for a task with a due_time, and this task has none',
    }
  }
  if (mode.timeOfDay !== null && dueTime !== null) {
    return {
      field,
      problem: 'is the mode for a task without a due_time, and this task has one',
    }
  }
  return null
}

/*
The upsert all three write paths share, and the whole of what 7.9 means by
"upserts the single row, computes fire_at, state resets to scheduled unless
that instant is already past".

The instant, the state and fired_at are planReminder's answer and are written
together on both arms of the conflict. 4.8 makes fire_at NOT NULL, so there
is no half-row to insert and compute after; and an upsert that carried the
new instant across while leaving state and fired_at alone is the failure
AC-148 pins, a row holding exactly the value the user asked for that will
never fire again because it is still terminal from the last time it did.

No recompute follows this call, and that is a decision rather than an
omission. 8.6's reminder trigger and planReminder are two questions about one
row, "what should it become" and "what should it be written as", and this
path knows the second: recomputeReminders here would read back the row this
statement just wrote and compute the identical answer from the identical
columns. It would also take a second clock reading, so a reminder whose
instant fell between the two calls could be scheduled by one and skipped by
the other, which is one decision made twice at the only moment the two
answers differ.

**created_by is rewritten to the caller on the conflict arm**, and the column
is the one thing here that no response reports, so the reason is recorded.
8.6 reads it in exactly one place, as the fallback zone of an unassigned
task, and the loop skips an unassigned task at fire time, so nothing
observable turns on the choice either way; what turns on it is coherence.
7.0 makes PUT idempotent, and rewriting is what makes the stored row a
function of the request and the task alone: keeping the old value would make
DELETE-then-PUT and PUT-over-the-row differ in a column, by history rather
than by anything either caller said. It also keeps the row self-describing,
since the instant above was computed in this caller's zone when the task is
unassigned, and a row naming a different creator than the one its instant was
computed from would be silently moved by the next recompute that touched it.
And where the column is read, the better stand-in for a missing assignee is
the member who just asked for this reminder and passed 10.2 a moment ago,
rather than an earlier creator who may since have left the folder under
R-CLEAN. 8.5's copy onto a generated successor keeps its source's created_by
and is untouched by this: that is one reminder reproduced onto a new row, not
a second actor replacing one.
*/
export async function upsertReminder(
  tx: Executor,
  taskId: string,
  mode: ReminderMode,
  createdBy: string,
): Promise<void> {
  const plan = await planReminder(tx, {
    taskId,
    offsetMinutes: mode.offsetMinutes,
    timeOfDay: mode.timeOfDay,
    createdBy,
  })
  const firedAt = plan.firedAt === null ? null : plan.firedAt.toISOString()
  await tx.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${taskId}::uuid, ${mode.offsetMinutes},
                ${mode.timeOfDay}::time,
                ${plan.fireAt.toISOString()}::timestamptz,
                ${plan.state}, ${firedAt}::timestamptz, ${createdBy}::uuid)
        ON CONFLICT (task_id) DO UPDATE
           SET offset_minutes = EXCLUDED.offset_minutes,
               time_of_day = EXCLUDED.time_of_day,
               fire_at = EXCLUDED.fire_at,
               state = EXCLUDED.state,
               fired_at = EXCLUDED.fired_at,
               created_by = EXCLUDED.created_by`,
  )
}

/* ------------------------------------------------------------------ *
 * POST /tasks
 * ------------------------------------------------------------------ */

export type CreateTaskResult =
  | { kind: 'created'; task: TaskDetail }
  | { kind: 'folder_not_found' }
  | { kind: 'assignee_not_member' }
  | { kind: 'section_not_here' }

/** 4.17: the block exists, it is a section, and its page is this folder's. */
async function sectionInFolder(
  executor: Executor,
  blockId: string,
  folderId: string,
): Promise<boolean> {
  const found = await rowsOf(
    executor,
    sql`SELECT 1 AS present FROM page_blocks
        WHERE id = ${blockId} AND folder_id = ${folderId}
          AND kind = 'section'`,
  )
  return found.length > 0
}

/*
7.6's create, one transaction so a body whose steps are refused leaves no
half-built task behind.

The assignee is the only interesting decision, and it is three rules in
order. A single-member folder forces the assignee to that member ignoring the
input, which the mid-P3 change control settles as winning over the
composite-FK refusal on this endpoint: section 3 names INV-5's enforcement as
create, move, and the unassign guard, so create repairs where only the
guard refuses. Otherwise an absent assignee_id takes 7.6's default of V, and
a present one must be a member, which is the composite FK surfaced as a 422
rather than left to answer as a constraint error (10.2 keeps constraints as
the last line and never the first). An explicit null in a multi-member folder
is an unassigned task, which that folder may hold.

The rule is the P6 arm, and it is two columns rather than one. 7.6 gives a
created rule a fresh series_id, and INV-13 is a CHECK, so a rule written
without one is refused by the database rather than merely wrong. Freshness is
gen_random_uuid() in the statement itself: a series identity minted in this
process would be one more thing to agree with the row, and the create already
lets the column defaults mint every other id here. The rule's dependency on a
due_date is answered by the body alone (4.5 backs it with a CHECK) and the
schema refuses it before this function is reached.
*/
export async function createTask(
  db: Db,
  viewerId: string,
  body: PostTasksBody,
): Promise<CreateTaskResult> {
  return inTransaction(db, async (tx) => {
    const folderId = body.folder_id ?? (await inboxOf(tx, viewerId))
    const access = await accessOf(tx, viewerId, folderId)
    if (access === null) return { kind: 'folder_not_found' }

    const members = await folderMemberIds(tx, folderId)
    const onlyMember = members.length === 1 ? members[0] : undefined
    let assigneeId: string | null
    if (onlyMember !== undefined) {
      assigneeId = onlyMember
    } else if (body.assignee_id === undefined) {
      assigneeId = viewerId
    } else {
      assigneeId = body.assignee_id
      if (assigneeId !== null && !members.includes(assigneeId)) {
        return { kind: 'assignee_not_member' }
      }
    }

    // 4.5 (RFC 0005): a section assignment names a section block of this
    // folder's own page, or it names nothing.
    const sectionId = body.section_block_id ?? null
    if (sectionId !== null && !(await sectionInFolder(tx, sectionId, folderId))) {
      return { kind: 'section_not_here' }
    }

    const rule = body.recurrence_rule ?? null
    const seriesId = rule === null ? sql`NULL` : sql`gen_random_uuid()`
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                             due_time, recurrence_rule, series_id,
                             assignee_id, created_by, section_block_id)
          VALUES (${folderId}::uuid, ${body.title}, ${body.notes ?? null},
                  ${body.important ?? false}, ${body.due_date ?? null}::date,
                  ${body.due_time ?? null}::time, ${rule}, ${seriesId},
                  ${assigneeId}::uuid, ${viewerId}::uuid, ${sectionId})
          RETURNING id`,
    )
    const taskId = String(inserted[0]?.id)

    /*
    7.6's reminder arm, deferred at the P3 kickoff with the 8.6 instant that
    4.8's NOT NULL fire_at demands and delivered here. It is written after the
    task rather than beside it because the computation reads the row: the zone
    is the assignee's, which the INV-5 forcing above may have chosen rather
    than the body, and the dates are the ones just inserted.

    Both of 7.9's guards are already answered, by the create body itself and
    not by this file. A create states the task's due_date and due_time in the
    same breath as the reminder, so the dependency and the mode are relations
    between fields of one body, which is where the schema puts them and where
    AC-149 measures them. Reaching the upsert with a shape 8.6 cannot compute
    would mean that schema had stopped refusing it, and planReminder throws
    rather than inventing an arm, which is the backstop this ordering wants.
    */
    if (body.reminder !== undefined && body.reminder !== null) {
      await upsertReminder(tx, taskId, modeOf(body.reminder), viewerId)
    }

    // 7.6's steps are a list of titles; 4.6's position is a sort key with
    // gaps allowed, so the create numbers them from one in the order sent.
    const titles = body.steps ?? []
    for (const [index, title] of titles.entries()) {
      await tx.execute(
        sql`INSERT INTO steps (task_id, title, position)
            VALUES (${taskId}::uuid, ${title}, ${index + 1})`,
      )
    }

    // One mutation, one event (4.13). An assignment created into being
    // reaches its assignee (4.14); INV-5's forcing counts, a body's explicit
    // choice counts, and the creator defaulting to themselves fans out to
    // nobody because recordEvent drops the actor either way.
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: body.title,
      folderId,
      detail:
        assigneeId !== null && assigneeId !== viewerId
          ? `assigned to ${await displayNameOf(tx, assigneeId)}`
          : undefined,
      recipients: assigneeId === null ? undefined : [assigneeId],
    })

    return { kind: 'created', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/* ------------------------------------------------------------------ *
 * PATCH /tasks/:id
 * ------------------------------------------------------------------ */

export type PatchTaskResult =
  | { kind: 'patched'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'target_not_found' }
  | { kind: 'assignee_not_member' }
  | { kind: 'unassign_single_member' }
  | { kind: 'time_without_date' }
  | { kind: 'rule_without_date' }
  | { kind: 'section_not_here' }
  | { kind: 'reminder_refused'; refusal: ReminderRefusal }

/*
7.6's PATCH, one transaction, and every refusal returns before the first
write: a request is one unit, so a body that fails on any field applies none
of itself.

Only present fields are written (7.6, 8.3): the UPDATE names the columns the
body named, never the whole row, which is what lets two members editing
different fields both win.

Three derived rules ride along:

- **The move.** A folder_id change requires membership of the target, which
  reads as 404 under the leak rule rather than as the 422 the frozen text
  also admits, because an inaccessible folder is indistinguishable from a
  nonexistent one everywhere else in this surface. The assignee then follows
  the target: dropped when they are not a member of it, forced when the
  target holds exactly one member (INV-5).
- **The unassign guard.** An explicit null assignee is refused with 409 in a
  single-member folder (INV-5, which section 3 calls the guard), and a
  present assignee must be a member of the folder the task ends in, which is
  the composite FK read forward rather than waited for.
- **The clear-date cascade (8.4).** due_date set to null nulls due_time and
  recurrence_rule and deletes the reminder row, in this transaction. series_id
  stays: the series ends, its identity is history.
- **The rule (7.6, 8.5).** A rule needs a date, which only the row can answer
  here: a rule sent alone is legal against a dated task and refused against an
  undated one, so the schema refuses the one contradiction a body states
  alone (clearing the date while setting a rule) and this is the other half.
  Which of 7.6's two edits a rule is, is read off the row as well. Set on a
  task without one, it mints a fresh series_id; changed on a current
  occurrence, it replaces the rule and the series is the one the row is
  already in, past rows untouched. "Without one" is read as the row carrying
  no rule now, which is 7.6's own phrasing and 8.5's "setting the rule to null
  ends the series" read forward: a resumed repeat is a new series, and the
  series_id 8.4 and 8.5 leave behind is the ended one's history rather than a
  membership the row can be readmitted to. Setting it null ends the series
  and writes nothing else, the date and the reminder staying, because 8.4's
  cascade runs the other way round only.

The reminder is three more, all P7's and all in this one transaction:

- **The mode cascade (8.4, one size down from the clear-date cascade above).**
  Two PATCH edits move due_time across the line 4.8 draws and each leaves a
  pair 4.8 calls illegal, so both delete the row: clearing due_time deletes an
  offset reminder, and setting one on a date-only task deletes a time_of_day
  reminder. A due_time that moves between two non-null values crosses no line,
  invalidates no mode and deletes nothing; it is the ordinary recompute below,
  and AC-164's third clause is the control that says so. Both deletes carry
  the mode in their predicate as well as in the condition that reached them,
  which costs nothing and makes the statement true on its own terms.
- **The recompute (8.6), once.** Three of 8.6's five triggers are edits this
  endpoint makes, and the answer is a function of the row as it stands after
  the write, so a body moving all three is one call rather than three. Which
  trigger it is named for is the first of due_date, due_time and assignee_id
  that actually moved: the arithmetic cannot tell them apart, and the caller
  that knows which field it wrote is the only party that does.
  **Actually moved**, compared against the row rather than read off the body's
  key set, because a recompute returns a delivered reminder to scheduled and a
  PATCH rewriting due_time with the value it already held would then send the
  same email a second time for an occasion that did not change.
- **The reminder arm of the body (7.6, 7.9).** A reminder sent here is the
  same upsert and the same guards the PUT uses, against the task as it stands
  after this request's own column writes. It runs after the cascade, which 8.4
  requires in those words: the delete precedes any recompute, because after it
  there is no row to recompute and the callable throws on a shape it cannot
  compute. And it stands in for the recompute rather than running beside it,
  the upsert having computed from the same final row a recompute would read.
*/
export async function patchTask(
  db: Db,
  viewerId: string,
  taskId: string,
  patch: PatchTaskBody,
): Promise<PatchTaskResult> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }

    const target =
      patch.folder_id !== undefined && patch.folder_id !== current.folderId
        ? patch.folder_id
        : undefined
    if (
      target !== undefined &&
      (await accessOf(tx, viewerId, target)) === null
    ) {
      return { kind: 'target_not_found' }
    }
    const moving = target !== undefined
    const folderId = target ?? current.folderId
    const members = await folderMemberIds(tx, folderId)
    const onlyMember = members.length === 1 ? members[0] : undefined

    // undefined leaves the column alone; null and a value are both writes.
    let assigneeId: string | null | undefined
    if (patch.assignee_id !== undefined) {
      if (patch.assignee_id === null) {
        if (onlyMember !== undefined) return { kind: 'unassign_single_member' }
        assigneeId = null
      } else {
        if (!members.includes(patch.assignee_id)) {
          return { kind: 'assignee_not_member' }
        }
        assigneeId = patch.assignee_id
      }
    } else if (moving) {
      const survives =
        current.assigneeId !== null && members.includes(current.assigneeId)
      assigneeId = onlyMember ?? (survives ? current.assigneeId : null)
    }

    // 4.5 (RFC 0005): a section names a block of the folder the task ends
    // in; a move that brings no fresh section clears it, because the old
    // page's furniture stays home.
    let sectionId: string | null | undefined
    if (patch.section_block_id !== undefined) {
      if (
        patch.section_block_id !== null &&
        !(await sectionInFolder(tx, patch.section_block_id, folderId))
      ) {
        return { kind: 'section_not_here' }
      }
      sectionId = patch.section_block_id
    } else if (moving) {
      sectionId = null
    }

    const clearing = patch.due_date === null
    const finalDueDate =
      patch.due_date !== undefined ? patch.due_date : current.dueDate
    if (
      !clearing &&
      patch.due_time !== undefined &&
      patch.due_time !== null &&
      finalDueDate === null
    ) {
      // INV-6's row-dependent half, which the body alone cannot answer: the
      // 4.5 CHECK would refuse this write, and 10.2 wants the field named
      // before the constraint speaks.
      return { kind: 'time_without_date' }
    }
    // INV-6's other row-dependent half, the same shape at the other column:
    // 7.6 makes a rule set on a task without a date a 422 naming the field.
    const settingRule =
      patch.recurrence_rule !== undefined && patch.recurrence_rule !== null
    if (!clearing && settingRule && finalDueDate === null) {
      return { kind: 'rule_without_date' }
    }

    /*
    The task's due_time once this body has been applied, which is what both
    the 8.4 cascade and 7.9's mode guard read. 8.4 nulls the column with the
    date, so the clear-date arm decides it before the body's own field does.
    Minutes are compared rather than strings: the write form of 4.11's time
    admits HH:MM:00 for the same minute HH:MM names, and a spelling difference
    is not a change any trigger fires on.
    */
    const finalDueTime = clearing
      ? null
      : patch.due_time !== undefined
        ? minuteOf(patch.due_time)
        : current.dueTime

    // 4.8's mode rule and INV-6, in the direction only the row can answer.
    // Refused before the first write, like every other refusal here: a
    // request is one unit, so a body failing on any field applies none of it.
    const reminder = patch.reminder === undefined ? null : modeOf(patch.reminder)
    if (reminder !== null) {
      const refusal = reminderRefusal(finalDueDate, finalDueTime, reminder)
      if (refusal !== null) return { kind: 'reminder_refused', refusal }
    }

    const sets: SQL[] = []
    if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`)
    if (patch.notes !== undefined) sets.push(sql`notes = ${patch.notes}`)
    if (patch.important !== undefined) {
      sets.push(sql`important = ${patch.important}`)
    }
    if (moving) sets.push(sql`folder_id = ${folderId}::uuid`)
    if (assigneeId !== undefined) {
      sets.push(sql`assignee_id = ${assigneeId}::uuid`)
    }
    if (sectionId !== undefined) {
      sets.push(sql`section_block_id = ${sectionId}`)
    }
    if (clearing) {
      sets.push(sql`due_date = NULL`)
      sets.push(sql`due_time = NULL`)
      sets.push(sql`recurrence_rule = NULL`)
    } else {
      if (patch.due_date !== undefined) {
        sets.push(sql`due_date = ${patch.due_date}::date`)
      }
      if (patch.due_time !== undefined) {
        sets.push(sql`due_time = ${patch.due_time}::time`)
      }
      if (patch.recurrence_rule !== undefined) {
        sets.push(sql`recurrence_rule = ${patch.recurrence_rule}`)
        if (settingRule && current.recurrenceRule === null) {
          sets.push(sql`series_id = gen_random_uuid()`)
        }
      }
    }

    if (sets.length > 0) {
      // 4.5: updated_at is touched on every mutation, and it is the
      // last-write-wins evidence 8.3 relies on. An empty body writes nothing
      // and therefore touches nothing.
      sets.push(sql`updated_at = now()`)
      await tx.execute(
        sql`UPDATE tasks SET ${sql.join(sets, sql`, `)}
            WHERE id = ${taskId}::uuid`,
      )
    }
    if (clearing) {
      await tx.execute(
        sql`DELETE FROM reminders WHERE task_id = ${taskId}::uuid`,
      )
    } else if (patch.due_time !== undefined && finalDueTime !== current.dueTime) {
      // 8.4's smaller sibling, both arms. Only a move across the null
      // boundary invalidates a mode, so a time that moves from one value to
      // another falls through to the recompute below (AC-164's third clause).
      if (finalDueTime === null) {
        await tx.execute(
          sql`DELETE FROM reminders
               WHERE task_id = ${taskId}::uuid AND offset_minutes IS NOT NULL`,
        )
      } else if (current.dueTime === null) {
        await tx.execute(
          sql`DELETE FROM reminders
               WHERE task_id = ${taskId}::uuid AND time_of_day IS NOT NULL`,
        )
      }
    }

    if (reminder !== null) {
      await upsertReminder(tx, taskId, reminder, viewerId)
    } else {
      const trigger = movedTrigger(taskId, patch, current, {
        clearing,
        finalDueTime,
        finalAssigneeId:
          assigneeId === undefined ? current.assigneeId : assigneeId,
      })
      if (trigger !== null) await recomputeReminders(tx, trigger)
    }

    // One mutation, one event (4.13). The verb is the act's largest word:
    // a move outranks a rename outranks the everything-else 'edited'. A
    // reassignment reaches the person it now concerns (4.14), and only a
    // real change of hands fans out, because an assignee rewritten with the
    // value it already held concerns nobody newly.
    if (sets.length > 0 || reminder !== null) {
      const newAssignee =
        assigneeId !== undefined &&
        assigneeId !== null &&
        assigneeId !== current.assigneeId
          ? assigneeId
          : null
      await recordEvent(tx, {
        actorId: viewerId,
        verb: moving
          ? 'moved'
          : patch.title !== undefined && patch.title !== current.title
            ? 'renamed'
            : 'edited',
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: patch.title ?? current.title,
        folderId,
        detail:
          newAssignee !== null
            ? `assigned to ${await displayNameOf(tx, newAssignee)}`
            : reminder !== null && sets.length === 0
              ? 'set a reminder'
              : undefined,
        recipients: newAssignee === null ? undefined : [newAssignee],
      })
    }

    return { kind: 'patched', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/** HH:MM, the form to_char reads a 4.11 time column back in. The write form
 * admits a zero seconds field for the same minute, and a comparison against
 * the stored value has to see one value there. */
function minuteOf(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

/**
 * Which of 8.6's task-scoped triggers this PATCH fired, or null for a body
 * that moved none of them.
 *
 * One trigger for a body that moved several: recomputeReminders reads the row
 * as it now stands, so the answer is the same whichever of them is named, and
 * naming a second would compute the same instant twice.
 *
 * Two edits deliberately answer null. Clearing due_date is 8.4's cascade,
 * which deleted the row a moment ago and leaves nothing to recompute; and a
 * field rewritten with the value it already carried moved no deadline, no
 * lead time and no recipient, so it is not one of the changes 8.6's trigger
 * list names. That second one has teeth: the four task-scoped triggers revive
 * a delivered reminder by design, so a recompute fired by a no-op write is a
 * second copy of an email about an occasion nobody changed.
 */
function movedTrigger(
  taskId: string,
  patch: PatchTaskBody,
  current: TaskAccess,
  applied: {
    clearing: boolean
    finalDueTime: string | null
    finalAssigneeId: string | null
  },
): ReminderTrigger | null {
  if (
    !applied.clearing &&
    patch.due_date !== undefined &&
    patch.due_date !== current.dueDate
  ) {
    return { kind: 'due_date', taskId }
  }
  if (
    !applied.clearing &&
    patch.due_time !== undefined &&
    applied.finalDueTime !== current.dueTime
  ) {
    return { kind: 'due_time', taskId }
  }
  if (applied.finalAssigneeId !== current.assigneeId) {
    return { kind: 'assignee_id', taskId }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * DELETE /tasks/:id
 * ------------------------------------------------------------------ */

/** 5.1's delete row: the task goes and the database cascades its steps, My
 * Day entries and reminder, while invites.task_id is set null by 4.9 because
 * an invite is a message to a person and outlives the task it carried. A
 * second delete finds nothing accessible and answers 404, the mid-P3 ruling:
 * 204 for a row that existed beside 404 for one that never did is an
 * existence oracle. */
/** RFC 0005 (7.13): the delete marks rather than removes, so the row and its
 * parts wait 30 days for any member's restore; the 11.7 pass is the only
 * thing that ever deletes it. The resolution above already refuses a row
 * that is trashed, which is what makes the second delete 8.3's 404. */
export async function deleteTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const current = await accessibleTask(tx, viewerId, taskId)
    if (current === null) {
      return 'not_found'
    }
    await tx.execute(
      sql`UPDATE tasks SET deleted_at = now(), updated_at = now()
          WHERE id = ${taskId}::uuid`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: current.title,
      folderId: current.folderId,
      detail: 'moved to Trash for 30 days',
    })
    return 'deleted'
  })
}

/* ------------------------------------------------------------------ *
 * The 5.1 transitions
 * ------------------------------------------------------------------ */

export type TransitionEvent = 'complete' | 'uncomplete' | 'abandon' | 'restore'

export type TransitionResult =
  | {
      kind: 'transitioned'
      task: TaskDetail
      /** 7.6's generated_task: what 8.5 inserted, or null where nothing was
       * generated, which includes an exhausted series and every row that
       * carries no rule. */
      generatedTask: TaskCard | null
      /** 7.6's deleted_successor_id: the row G-SERIES removed, or null. */
      deletedSuccessorId: string | null
    }
  | { kind: 'noop'; task: TaskDetail }
  | { kind: 'conflict'; message: string }
  | { kind: 'not_found' }
  /** Frozen 7.6 as ruled on 2026-08-10: the transition would run generation
   * and the request named no zone. Nothing is written, so the same call
   * retried with one gets the transition it asked for. */
  | { kind: 'tz_required' }

interface TransitionRule {
  /** The status the guarded update requires (8.3's expected-status
   * predicate). */
  from: TaskStatus
  /** The status that means the work is already done, which 5.1 lists as a
   * no-op returning 200 without side effects. */
  settled: TaskStatus
  /** 5.1's copy where it gives one, phrased to tell the caller what to do
   * instead. */
  conflict: string
  /** 5.1: complete and abandon run generation (8.5) when the row carries a
   * rule, which is also the pair frozen 7.6 gives the tz parameter. */
  generates: boolean
  /** 5.1: uncomplete and restore apply G-SERIES, and they alone. */
  guarded: boolean
  /** The side effects 5.1 lists for this row, the actor being the only one
   * they need from outside the table. */
  set: (actorId: string) => SQL
}

/*
The 5.1 table as a table. Every transition not listed there is forbidden, so
the three outcomes below are exhaustive: the guarded update wins, the row is
already settled, or the row is in the third state and the answer is 409 with
the copy 5.1 gives it.
*/
const TRANSITIONS: Record<TransitionEvent, TransitionRule> = {
  complete: {
    from: 'pending',
    settled: 'completed',
    conflict: 'Restore the task first.',
    generates: true,
    guarded: false,
    set: (actorId) => sql`status = 'completed', completed_at = now(),
             completed_by = ${actorId}::uuid, updated_at = now()`,
  },
  uncomplete: {
    from: 'completed',
    settled: 'pending',
    conflict: 'An abandoned task returns to pending through restore.',
    generates: false,
    guarded: true,
    set: () => sql`status = 'pending', completed_at = NULL,
             completed_by = NULL, updated_at = now()`,
  },
  abandon: {
    from: 'pending',
    settled: 'abandoned',
    conflict: 'Complete tasks cannot be abandoned; un-complete first.',
    generates: true,
    guarded: false,
    set: () => sql`status = 'abandoned', updated_at = now()`,
  },
  restore: {
    from: 'abandoned',
    settled: 'pending',
    conflict: 'A completed task returns to pending through uncomplete.',
    generates: false,
    guarded: true,
    set: () => sql`status = 'pending', updated_at = now()`,
  },
}

/** 5.1's four transitions under 4.13's verbs: the past participle of what
 * the person did, 'uncomplete' being the one whose act has its own word. */
const TRANSITION_VERBS: Record<
  TransitionEvent,
  'completed' | 'reopened' | 'abandoned' | 'restored'
> = {
  complete: 'completed',
  uncomplete: 'reopened',
  abandon: 'abandoned',
  restore: 'restored',
}

/*
8.3's guarded single-row update, which is what makes a repeat a no-op and a
lost race detectable: the UPDATE carries the expected status in its WHERE, so
zero rows means this caller did not perform the transition, and the row is
re-read to classify. A no-op writes nothing at all, which is what "200
without side effects" means for updated_at as much as for the status.

P6 fills the two seams this function was left with, and both are calls into
the Scheduling engineer's module rather than anything computed here.

**The resolution takes the row lock now.** It has to, because two of the
three things this function decides are read before the update rather than
after it, and a decision read outside the lock is a decision a concurrent
transition can invalidate between the read and the write. Under the lock,
"the guarded update is about to win" is knowable from the status the read
returned, which is what lets a refusal happen before anything moves. The
guarded update stays the authority on what actually happened: it is still the
UPDATE's own row count that classifies the outcome, so the shape 8.3
specifies is untouched and a lost race still reads as a no-op.

**Generation (8.5), in the winning branch of complete and abandon.** It runs
after the status write and inside this transaction, which is what makes it
exactly-once under any race: only the caller whose guarded update changed a
row reaches it. The row is re-read for the response afterwards, because
generation moves the rule onto the successor and the envelope's task must say
so.

**The zone, per frozen 7.6 as ruled on 2026-08-10.** It arrives as a
parameter, never from users.timezone, which 8.1 reserves for reminder fire
instants, and the route validates a present one before this function is
reached. An absent one is refused here, and only here: the condition is the
ruling's own, the winning guarded update landing on a pending row that carries
a rule, which is exactly the call that would evaluate a calendar date. The
refusal returns before the update, so the transaction changes nothing, which
is the ruling's second sentence and not an implementation detail.

**G-SERIES (5.1), ahead of the uncomplete and restore updates.** It runs only
when the row is still in the status the transition expects: a repeat call on
an already-pending row is 5.1's no-op, which writes nothing at all, and a
guard that ran there would delete a successor for a call that is meant to have
no side effects. The guard changes no status itself, so the update below is
still the one door onto that column.
*/
export async function transitionTask(
  db: Db,
  viewerId: string,
  taskId: string,
  event: TransitionEvent,
  tz?: string,
): Promise<TransitionResult> {
  const rule = TRANSITIONS[event]
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }

    // 8.3's expected-status predicate, read once under the lock: the update
    // below carries it too, and these two cannot disagree while the lock is
    // held.
    const winning = current.status === rule.from
    const generating =
      winning && rule.generates && current.recurrenceRule !== null
    if (generating && tz === undefined) return { kind: 'tz_required' }

    let deletedSuccessorId: string | null = null
    if (winning && rule.guarded) {
      const guard = await applySeriesGuard(tx, taskId)
      if (guard.kind === 'refused') {
        return { kind: 'conflict', message: guard.message }
      }
      if (guard.kind === 'reclaimed') {
        deletedSuccessorId = guard.deletedSuccessorId
      }
    }

    const updated = await rowsOf(
      tx,
      sql`UPDATE tasks SET ${rule.set(viewerId)}
          WHERE id = ${taskId}::uuid AND status = ${rule.from}
          RETURNING id`,
    )
    if (updated.length === 1) {
      let generatedTask: TaskCard | null = null
      // The second half of the condition is true wherever the first is, the
      // refusal above being the only other way out of a generating call; it
      // is written out because that is what makes the zone a string here.
      if (generating && tz !== undefined) {
        const outcome = await generateSuccessor(tx, { taskId, tz })
        if (outcome.kind === 'generated') {
          generatedTask = cardOf(
            await viewOrFail(tx, viewerId, outcome.successorId),
          )
        }
      }
      // One event in the winning branch only (4.13): a no-op writes nothing
      // and records nothing, which is what "without side effects" means for
      // the history too.
      await recordEvent(tx, {
        actorId: viewerId,
        verb: TRANSITION_VERBS[event],
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: current.title,
        folderId: current.folderId,
      })
      return {
        kind: 'transitioned',
        task: await viewOrFail(tx, viewerId, taskId),
        generatedTask,
        deletedSuccessorId,
      }
    }

    const after = await accessibleTask(tx, viewerId, taskId)
    if (after === null) return { kind: 'not_found' }
    if (after.status === rule.settled) {
      return { kind: 'noop', task: await viewOrFail(tx, viewerId, taskId) }
    }
    return { kind: 'conflict', message: rule.conflict }
  })
}

/* ------------------------------------------------------------------ *
 * 7.7 steps
 * ------------------------------------------------------------------ */

export type AddStepResult =
  | { kind: 'added'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'step_cap' }

/*
7.7's create. The cap is a live count of rows rather than a high-water mark,
because 4.6 makes it an API guard and a task whose steps have come and gone
over a year must still admit its fiftieth.

That same sentence of 4.6, no constraint behind the cap, is why the access
read here takes the row lock rather than the plain resolution its siblings
use. Nothing under this function catches a miscount: two adds arriving
together on a task holding 49 steps would both read 49, both pass the guard,
and both insert, leaving 51 against a number 10.3 calls server-enforced. The
lock makes the count and the insert one decision, so the second add reads 50
and is refused. Found at the P3 shape review, which is also where the
identical shape at the 25-member cap was found; PGlite is single-connection
(11.15), so no run of this suite can ever show either.
*/
export async function addStep(
  db: Db,
  viewerId: string,
  taskId: string,
  body: PostTaskStepsBody,
): Promise<AddStepResult> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) {
      return { kind: 'not_found' }
    }
    const counted = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n, coalesce(max(position), 0) AS top
          FROM steps WHERE task_id = ${taskId}`,
    )
    const row = counted[0]
    if (Number(row?.n ?? 0) >= 50) return { kind: 'step_cap' }

    // 7.7: position defaults to max plus 1, which is a fact about the rows
    // and so is resolved here.
    const position = body.position ?? Number(row?.top ?? 0) + 1
    await tx.execute(
      sql`INSERT INTO steps (task_id, title, position)
          VALUES (${taskId}::uuid, ${body.title}, ${position})`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: current.title,
      folderId: current.folderId,
      detail: 'added a step',
    })
    return { kind: 'added', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

export type StepResult =
  | { kind: 'ok'; task: TaskDetail }
  | { kind: 'not_found' }

/** A step is reachable exactly when its parent task's folder is (7.7: 404
 * otherwise), so the resolution carries the same membership join the task
 * reads do. */
async function accessibleStep(
  executor: Executor,
  viewerId: string,
  stepId: string,
): Promise<{
  stepId: string
  taskId: string
  taskTitle: string
  folderId: string
} | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT s.id, s.task_id, t.title, t.folder_id
        FROM steps s
        JOIN tasks t ON t.id = s.task_id AND t.deleted_at IS NULL
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders fo ON fo.id = t.folder_id AND fo.deleted_at IS NULL
        WHERE s.id = ${stepId}`,
  )
  const row = found[0]
  return row === undefined
    ? null
    : {
        stepId: String(row.id),
        taskId: String(row.task_id),
        taskTitle: String(row.title),
        folderId: String(row.folder_id),
      }
}

/** 7.7's PATCH: any subset, and never any effect on the task's status. */
export async function patchStep(
  db: Db,
  viewerId: string,
  stepId: string,
  patch: PatchStepBody,
): Promise<StepResult> {
  return inTransaction(db, async (tx) => {
    const step = await accessibleStep(tx, viewerId, stepId)
    if (step === null) return { kind: 'not_found' }

    const sets: SQL[] = []
    if (patch.title !== undefined) sets.push(sql`title = ${patch.title}`)
    if (patch.done !== undefined) sets.push(sql`done = ${patch.done}`)
    if (patch.position !== undefined) {
      sets.push(sql`position = ${patch.position}`)
    }
    if (sets.length > 0) {
      await tx.execute(
        sql`UPDATE steps SET ${sql.join(sets, sql`, `)}
            WHERE id = ${stepId}::uuid`,
      )
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'edited',
        subjectKind: 'task',
        subjectId: step.taskId,
        subjectName: step.taskTitle,
        folderId: step.folderId,
        detail: 'edited a step',
      })
    }
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, step.taskId) }
  })
}

export async function deleteStep(
  db: Db,
  viewerId: string,
  stepId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const step = await accessibleStep(tx, viewerId, stepId)
    if (step === null) return 'not_found'
    await tx.execute(sql`DELETE FROM steps WHERE id = ${stepId}::uuid`)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'task',
      subjectId: step.taskId,
      subjectName: step.taskTitle,
      folderId: step.folderId,
      detail: 'removed a step',
    })
    return 'deleted'
  })
}

export type PromoteStepResult =
  | { kind: 'promoted'; task: TaskDetail }
  | { kind: 'not_found' }

/*
POST /tasks/:id/steps/:stepId/promote (RFC 0005 change control item 58, B9's
one-way move given its endpoint).

A step becomes a task of its own in the parent's folder and under the
parent's section, and the step is gone from the parent in the same
transaction: one act from the person's side, one transaction from the
wire's. The new task starts pending whatever the step's box said, because a
promotion is a person deciding this is work of its own rather than a
finished line, and it is assigned to nobody. Membership of the parent's
folder is the access rule (7.7), and a step named under a task it does not
belong to is 404 rather than 422: the pair is an address, not a body.
*/
export async function promoteStep(
  db: Db,
  viewerId: string,
  taskId: string,
  stepId: string,
): Promise<PromoteStepResult> {
  return inTransaction(db, async (tx) => {
    const step = await accessibleStep(tx, viewerId, stepId)
    if (step === null || step.taskId !== taskId) return { kind: 'not_found' }
    const parent = (
      await rowsOf(
        tx,
        sql`SELECT t.section_block_id, s.title AS step_title
            FROM tasks t JOIN steps s ON s.task_id = t.id
            WHERE t.id = ${taskId}::uuid AND s.id = ${stepId}::uuid
            FOR UPDATE OF t`,
      )
    )[0]
    if (parent === undefined) return { kind: 'not_found' }
    const sectionId =
      parent.section_block_id === null || parent.section_block_id === undefined
        ? null
        : String(parent.section_block_id)
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks (folder_id, title, created_by, section_block_id)
          VALUES (${step.folderId}::uuid, ${String(parent.step_title)},
                  ${viewerId}::uuid, ${sectionId})
          RETURNING id`,
    )
    const newId = String(inserted[0]?.id)
    await tx.execute(sql`DELETE FROM steps WHERE id = ${stepId}::uuid`)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'task',
      subjectId: newId,
      subjectName: String(parent.step_title),
      folderId: step.folderId,
      detail: `from a step of ${step.taskTitle}`,
    })
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: step.taskTitle,
      folderId: step.folderId,
      detail: 'promoted a step to a task',
    })
    return { kind: 'promoted', task: await viewOrFail(tx, viewerId, newId) }
  })
}

/* ------------------------------------------------------------------ *
 * 7.8 My Day membership
 * ------------------------------------------------------------------ */

/*
The pull, insert-or-nothing rather than an upsert: 7.8 keeps the original
added_on on a repeat, and 8.2 reads that date as the qualify date deciding
Carried against Today, so an upsert would quietly move a task pulled last
week into today's group. ON CONFLICT DO NOTHING is INV-12's primary key doing
the work.

added_on is today(V), which 7.8 names outright and which the tz query
parameter is what supplies, by owner ruling on 2026-08-08.

This statement used to read (now() AT TIME ZONE u.timezone)::date, the
account's stored zone, because the endpoint carried no tz and that was the
only zone in reach. It was wrong in a way nothing local could show. 8.1
reserves users.timezone for reminder fire instants, and Q1 computes today(V)
from the request's tz, so the date this row was stamped with and the date the
My Day view compared it against were two different civil dates for a large
part of every UTC day. A task pulled in the afternoon in one zone landed in
Carried rather than Today, and the failure moved with the clock: four
sessions carried it as non-determinism before the zones were named.

The repair is not merely to read tz but to date the row with the same
function the view reads it with. today() from src/server/time is what Q1
calls, so the two civil dates are now one computation with one input rather
than two agreeing by luck.
*/
export async function pullIntoMyDay(
  db: Db,
  viewerId: string,
  taskId: string,
  tz: string,
): Promise<StepResult> {
  return inTransaction(db, async (tx) => {
    if ((await accessibleTask(tx, viewerId, taskId)) === null) {
      return { kind: 'not_found' }
    }
    await tx.execute(
      sql`INSERT INTO my_day_entries (task_id, user_id, added_on)
          VALUES (${taskId}::uuid, ${viewerId}::uuid, ${today(tz)}::date)
          ON CONFLICT DO NOTHING`,
    )
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/** 7.8's drop: the viewer's own entry alone, and 200 even when there was
 * none. The task stays in My Day when it still qualifies automatically,
 * which is 8.2's business and not this statement's. */
export async function dropFromMyDay(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<StepResult> {
  return inTransaction(db, async (tx) => {
    if ((await accessibleTask(tx, viewerId, taskId)) === null) {
      return { kind: 'not_found' }
    }
    await tx.execute(
      sql`DELETE FROM my_day_entries
          WHERE task_id = ${taskId}::uuid AND user_id = ${viewerId}::uuid`,
    )
    return { kind: 'ok', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/* ------------------------------------------------------------------ *
 * PUT and DELETE /tasks/:id/reminder
 * ------------------------------------------------------------------ */

export type PutReminderResult =
  | { kind: 'written'; task: TaskDetail }
  | { kind: 'not_found' }
  | { kind: 'refused'; refusal: ReminderRefusal }

/**
 * Frozen 7.9's PUT: the whole reminder, upserted, answering the affected
 * TaskDetail by the owner's ruling of 2026-08-10.
 *
 * The row is locked before it is read, the reason patchTask locks: this
 * decides from the task's due_date and due_time and then writes against them,
 * and a PATCH arriving between the two would leave a reminder whose mode 4.8
 * calls illegal, written by a guard that was true when it ran.
 *
 * Order is 10.2's and not this endpoint's preference: access first, so a
 * caller outside the folder is answered 404 without learning whether their
 * body would have been valid (AC-147's last case).
 */
export async function putTaskReminder(
  db: Db,
  viewerId: string,
  taskId: string,
  body: PutTaskReminderBody,
): Promise<PutReminderResult> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }

    const mode = modeOf(body)
    const refusal = reminderRefusal(current.dueDate, current.dueTime, mode)
    if (refusal !== null) return { kind: 'refused', refusal }

    await upsertReminder(tx, taskId, mode, viewerId)
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'edited',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: current.title,
      folderId: current.folderId,
      detail: 'set a reminder',
    })
    return { kind: 'written', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/**
 * Frozen 7.9's DELETE: 204, idempotent, and nothing else touched.
 *
 * Idempotent means the row's absence is not an error, so the resource this
 * URL addresses is the task and the 404 is the task's alone: a second call,
 * and a call against a task that never carried a reminder, both answer 204
 * (AC-146). This is 7.8's DELETE shape rather than 7.6's, where a second
 * delete of a task answers 404 because there the row named in the path is the
 * one that went.
 *
 * It is emphatically not 8.4's cascade, which sits one line from it in 8.6's
 * list of what removes a reminder: that one deletes the row because the date
 * went, and this one leaves due_date, due_time and any rule exactly where
 * they are.
 */
export async function deleteTaskReminder(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const current = await accessibleTask(tx, viewerId, taskId)
    if (current === null) {
      return 'not_found'
    }
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM reminders WHERE task_id = ${taskId}::uuid
          RETURNING task_id`,
    )
    // The idempotent repeat removed nothing and so did nothing worth a line
    // in anyone's history (4.13's one-event rule is about mutations, and a
    // no-op is not one).
    if (removed.length > 0) {
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'edited',
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: current.title,
        folderId: current.folderId,
        detail: 'removed the reminder',
      })
    }
    return 'deleted'
  })
}

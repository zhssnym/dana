/*
The domain module for tasks and My Day membership per spec 7.6 and 7.8 (a
task's subtasks are checklist items in its body since 0060), the 5.1 status machine with 8.3's guarded updates, the 8.4
clear-date cascade, and the INV-4 and INV-5 assignment rules. Routes validate
and serialize; every decision that touches rows is here, behind the 10.2 rule
that no query leaves this file without being scoped to the viewer, which for
tasks means the membership join every read below carries.

Results are discriminated unions rather than thrown statuses, the folders
module's convention, so the route layer owns the mapping onto 7.0's taxonomy and this
file stays testable without HTTP.

Two seams, both wired the same way:

- **Generation (8.5) and G-SERIES (5.1).** Neither is implemented here: both
  are functions taken from
  src/server/time as transaction-taking black boxes across the transitions
  seam, and what this file owns is where they are called
  from. Generation runs in the winning branch of the complete and abandon
  updates, inside the same transaction, which is what makes it exactly-once
  under any race (8.3); the guard runs ahead of the uncomplete and restore
  updates, and only on a row still in the status the transition expects,
  because a repeat call on an already-pending row is 5.1's no-op and must
  write nothing. The two companion fields the 7.6 envelope names are
  answered from those two calls.
- **The 8.6 fire instant and its recompute triggers**, on the same terms and by the reminders seam of the same file: planReminder answers
  what a row about to be written must carry, recomputeReminders answers what a
  row that already exists must become, and no arithmetic is restated here.
  Four of 8.6's five triggers fire in this file, three inside patchTask
  (due_date, due_time, assignee_id) and one inside the 7.9 upsert; the fifth
  is the assignee's own timezone and fires in the auth module, where 7.1
  puts it. Each call is made after this file's own write and inside the
  same transaction, which is the one thing a caller of that module can get
  wrong silently: called first, it computes from the state the write replaced.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PatchTaskBody,
  PostTasksBody,
  PutTaskReminderBody,
  ReminderInput,
  TaskCard,
  TaskDetail,
  TaskStatus,
} from '../../shared/tasks.js'
import {
  applySeriesGuard,
  generateSuccessor,
  planReminder,
  recomputeReminders,
  today,
} from '../time/index.js'
import type { ReminderTrigger } from '../time/index.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { carryTaskFilesOnMove } from './files.js'
import {
  accessOf,
  joinVisibleFolder,
  mayPerform,
  resolveScoped,
} from './folder-access.js'
import type { Scoped } from './folder-access.js'
import type {
  FolderAction,
  FolderActionDecision,
  FolderActorFacts,
} from './folder-access.js'
import { dropFolderLabelsOnMove, taskLabelsOf } from './labels.js'
import { taskDependencyCountsOf } from './task-dependency-counts.js'
import { positionAfter, positionAtSectionEnd, seededItems } from './page-order.js'
import {
  TaskDocumentRefusal,
  appendChecklist,
  applyTaskDocumentLocked,
  checklistTicks,
  legacyNotesWrite,
  materializeNotesLocked,
  needsMaterializing,
  taskChecklist,
  taskDocumentViewIn,
} from './task-document.js'
import type { DocumentTransaction, PageView } from '../../shared/pages.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

/** Timestamps leave the drivers as Date on one backend and as a string on
 * the other; the wire format is the ISO instant either way (the folders
 * module's helper, kept local for the reason db.ts records about its own copies). */
function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * A thread "Discuss" made on a task that nobody has written in yet (M5): no
 * post, no input round, no context, no decision, and made after its task (a
 * thread turned into a task is older than the task, so it never matches). The list and the
 * task page's link skip it, and the next "Discuss" reuses it, so looking
 * without talking leaves nothing behind. Reads `d`.
 *
 * Here rather than in consultation.ts because the task page reads it too, and
 * tasks sit below threads: threads import it from tasks, never the reverse.
 */
export const UNSTARTED_TASK_THREAD = sql`(
  d.task_id IS NOT NULL AND d.context IS NULL AND d.current_outcome_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM comments uc WHERE uc.discussion_id = d.id)
  AND NOT EXISTS (SELECT 1 FROM discussion_input_rounds ur
                   WHERE ur.discussion_id = d.id)
  AND EXISTS (SELECT 1 FROM tasks ut
               WHERE ut.id = d.task_id AND ut.created_at <= d.created_at))`

/*
Floating dates and times are read through to_char rather than through the
driver. 4.11 fixes both formats, and the two backends disagree about the
raw values: PGlite renders a date as a string while node-postgres parses
OID 1082 into a JS Date, which would serialize as an instant and reintroduce
the timezone the floating format exists to remove. One SQL cast makes the
wire identical on both.
*/
const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
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
   * 7.6 makes the condition of its tz rule. The series_id itself is
   * not here: the guard that needs it reads it under its own lock. */
  recurrenceRule: string | null
  sectionBlockId: string | null
  /* Read for one reason: 4.5's start-before-due CHECK is a relation between
     two columns, so a PATCH setting one of them has to be checked against
     whichever the row already holds (issue #215). */
  startDate: string | null
  /**
   * The actor's durable Folder facts, carried by the same membership join
   * that scoped this read (issue #228).
   *
   * It rides here rather than being fetched beside each call because of what
   * #228's Assigned-work rule asks for: the Access preset, the owner
   * fact and the Task's current assignee must be one consistent picture, read
   * in the transaction that is about to write. `lockedTask` takes the task
   * row `FOR UPDATE OF t` and returns this with `assigneeId` beside it, so a
   * reassignment that commits between somebody's screen and their request is
   * seen by the gate rather than by nobody.
   */
  facts: FolderActorFacts
}

/* The actor's Folder facts ride the same statement as these columns
   (`resolveScoped`), so there is no window in which the preset could be read
   from a different snapshot than the assignee. */
const TASK_ACCESS_COLUMNS = sql`t.id, t.folder_id, t.title, t.status,
       t.assignee_id, ${START_DATE} AS start_date,
       ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
       t.recurrence_rule, t.section_block_id`

function taskAccessFrom(scoped: Scoped | null): TaskAccess | null {
  if (scoped === null) return null
  const { row, facts } = scoped
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
    title: String(row.title),
    status: String(row.status) as TaskStatus,
    assigneeId: nullableString(row.assignee_id),
    dueDate: nullableString(row.due_date),
    dueTime: nullableString(row.due_time),
    recurrenceRule: nullableString(row.recurrence_rule),
    sectionBlockId: nullableString(row.section_block_id),
    startDate: nullableString(row.start_date),
    facts,
  }
}

/**
 * The whole authorization answer for an act on one Task, with the assignee
 * taken from the row the caller read -- under a lock, where the caller is
 * about to write.
 *
 * This is the only place in this file that decides anything about authority.
 * `mayPerform` holds the rules; this carries the target fact #228 requires be
 * evaluated in the mutation's own snapshot, and nothing else.
 */
export function mayActOnTask(
  task: TaskAccess,
  action: FolderAction,
): FolderActionDecision {
  return mayPerform(task.facts, action, { assigneeId: task.assigneeId })
}

/** Null means the task does not exist or lives in a folder the viewer is not
 * a member of, which 10.2 makes the same answer: 404, never 403. The
 * membership join is the scope, so no caller can forget it. */
export async function accessibleTask(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  return taskAccessFrom(
    await resolveScoped(executor, 'task', taskId, viewerId, {
      columns: TASK_ACCESS_COLUMNS,
    }),
  )
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
write. The ordinary PATCH and step callers take the task as their first lock.
A PATCH that changes folder/Section placement first joins #184's shared folder
lock, as its own implementation records, then takes this task lock; page
actions use that same folder-before-task order.
*/
async function lockedTask(
  tx: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskAccess | null> {
  return taskAccessFrom(
    await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: TASK_ACCESS_COLUMNS,
      lock: true,
    }),
  )
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
(7.0), whose rows the invites module writes and this file only reads; the reminder is the
4.8 row projected as both its columns with exactly one non-null.

The creator is a person shape and is joined rather than rendered from the column: 4.5 makes created_by NOT NULL, so the
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
               ${START_DATE} AS start_date,
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
               (SELECT count(*)::int FROM page_blocks ck
                 WHERE ck.task_id = t.id AND ck.kind = 'checklist')
                 AS steps_total,
               (SELECT count(*)::int FROM page_blocks ck
                 WHERE ck.task_id = t.id AND ck.kind = 'checklist' AND ck.checked)
                 AS steps_done,
               EXISTS (SELECT 1 FROM my_day_entries e
                        WHERE e.task_id = t.id AND e.user_id = ${viewerId})
                 AS pulled,
               (SELECT i.email FROM invites i
                 WHERE i.task_id = t.id AND i.status = 'pending'
                 ORDER BY i.created_at DESC, i.id DESC LIMIT 1)
                 AS pending_invite_email,
               r.task_id AS reminder_task_id, r.offset_minutes,
               to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day,
               t.section_block_id,
               (SELECT d.id FROM discussions d
                 WHERE d.task_id = t.id AND d.folder_id = t.folder_id
                   AND d.trashed_at IS NULL
                   AND NOT ${UNSTARTED_TASK_THREAD}) AS discussion_id
        FROM tasks t
        ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
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
    start_date: nullableString(row.start_date),
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
    recurrence_rule: nullableString(row.recurrence_rule),
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
    /* The M1 Label projection (issue #226). Read through the same batch
       function `readCards` uses, with a list of one, rather than by a second
       query of its own: two producers of this object already exist and a third
       reader of the Label tables that could scope itself differently would be
       one too many. */
    labels: await taskLabelsOf(executor, viewerId, taskId),
    /* Issue #225's row counts, through the batch `readCards` uses with a
       list of one, so a row replaced by a write's response counts the same. */
    ...(await taskDependencyCountsOf(executor, viewerId, taskId)),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    notes: nullableString(row.notes),
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
    steps: await taskChecklist(executor, taskId),
    completed_at: row.completed_at === null ? null : toIso(row.completed_at),
    completed_by: nullableString(row.completed_by),
    discussion_id: nullableString(row.discussion_id),
  }
}

/*
7.0's TaskCard, which is 7.0's TaskDetail less its six, and the shape 7.6
gives generated_task. It is derived from the detail rather than read by a
second query for the reason the detail's own comment gives: one read serves
every endpoint here, and a card built from its own SELECT is the per-endpoint
variant the contract exists to prevent. The views module answers cards from
list queries, which is a different question (many rows, one statement) and not
one this file can borrow an answer from for a single row it has already read.
*/
function cardOf(detail: TaskDetail): TaskCard {
  const {
    notes: _notes,
    series_id: _seriesId,
    reminder: _reminder,
    steps: _steps,
    completed_at: _completedAt,
    completed_by: _completedBy,
    discussion_id: _discussionId,
    ...card
  } = detail
  return card
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
 * The 4.8 reminder row: 7.9's two endpoints, and the arm both of
 * 7.6's write bodies carry
 * ------------------------------------------------------------------ */

/*
Three write paths reach the one row 4.8 keys by task_id: 7.9's PUT,
7.6's create body, and 7.6's PATCH body. They are one upsert and one guard
below rather than three of each, for the reason 4.8 gives itself: the mode
rule is "cross-table and enforced by the API, restated at every write", and
restated is exactly where two call sites drift. The same request through any
two of the three doors must store the same instant.
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
7.9's two 422s, against the task as it will stand after this request's
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
permit, and the date-only arm has no date to attach its wall time to.
*/
function reminderRefusal(
  dueDate: string | null,
  dueTime: string | null,
  mode: ReminderMode,
): ReminderRefusal | null {
  const field = mode.offsetMinutes !== null ? 'offset_minutes' : 'time_of_day'
  if (dueDate === null) {
    return { field, problem: 'requires a due_date on the task' }
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
new instant across while leaving state and fired_at alone would leave a row
holding exactly the value the user asked for that will
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
  /** The folder is visible to the actor and the act is not theirs to perform
   * (issue #228). 403 with the resolver's own sentence, never 404: 10.2 keeps
   * 404 for what the caller cannot see, and they can see this. */
  | { kind: 'forbidden'; reason: string }

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
input, which wins over the composite-FK refusal on this endpoint: section 3 names INV-5's enforcement as
create, move, and the unassign guard, so create repairs where only the
guard refuses. Otherwise an absent assignee_id takes 7.6's default of V, and
a present one must be a member, which is the composite FK surfaced as a 422
rather than left to answer as a constraint error (10.2 keeps constraints as
the last line and never the first). An explicit null in a multi-member folder
is an unassigned task, which that folder may hold.

The rule is two columns rather than one. 7.6 gives a
created rule a fresh series_id, and INV-13 is a CHECK, so a rule written
without one is refused by the database rather than merely wrong. Freshness is
gen_random_uuid() in the statement itself: a series identity minted in this
process would be one more thing to agree with the row, and the create already
lets the column defaults mint every other id here. The rule's dependency on a
due_date is answered by the body alone (4.5 backs it with a CHECK) and the
schema refuses it before this function is reached.
*/
export async function createTaskIn(
  tx: Executor,
  viewerId: string,
  body: PostTasksBody,
  options: { readonly pagePosition?: string; readonly id?: string } = {},
): Promise<CreateTaskResult> {
    const folderId = body.folder_id ?? (await inboxOf(tx, viewerId))
    const access = await accessOf(tx, viewerId, folderId)
    if (access === null) return { kind: 'folder_not_found' }
    /* R8A: originating new Task work in a Folder is Can contribute's and
       above. The initial assignee the body names is part of that origination
       act and is *not* a separate `task.assign` -- R8 says so in terms -- so
       it is deliberately not checked here; what a contributor does not get is
       edit authority over the Task afterwards, which `patchTask`'s own gate
       resolves from the assignee rather than from who created it. */
    const admitted = mayPerform(access, 'task.create')
    if (!admitted.allowed) {
      return { kind: 'forbidden', reason: admitted.reason }
    }

    /* #184 gives every folder one mixed ordering domain. Lock it before
       validating a Section or choosing an append position, so a concurrent
       page action cannot delete/move that boundary between the read and the
       task insert. Re-taking this lock from an enclosing page action is safe
       inside the same transaction. */
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
    )

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

    // 4.5: a section assignment names a section block of this
    // folder's own page, or it names nothing.
    const sectionId = body.section_block_id ?? null
    if (sectionId !== null && !(await sectionInFolder(tx, sectionId, folderId))) {
      return { kind: 'section_not_here' }
    }

    /* #184: every newly created task joins the folder's composed page. A
       page action supplies the exact key it computed between its validated
       neighbours. Existing create surfaces append at the foot, which leaves
       all non-document task-list orders unchanged because they do not read
       this column. The folder lock serializes two concurrent appends. */
    let pagePosition = options.pagePosition
    if (pagePosition === undefined) {
      const items = await seededItems(tx, folderId)
      pagePosition = positionAtSectionEnd(items, null, sectionId) ?? undefined
      if (pagePosition === undefined) return {kind:'section_not_here'}
    }

    const rule = body.recurrence_rule ?? null
    const seriesId = rule === null ? sql`NULL` : sql`gen_random_uuid()`
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks (id, folder_id, title, notes, important,
                             start_date, due_date,
                             due_time, recurrence_rule, series_id,
                             assignee_id, created_by, section_block_id,
                             page_position)
          VALUES (${options.id === undefined ? sql`gen_random_uuid()` : sql`${options.id}::uuid`}, ${folderId}::uuid, ${body.title}, ${body.notes ?? null},
                  ${body.important ?? false},
                  ${body.start_date ?? null}::date,
                  ${body.due_date ?? null}::date,
                  ${body.due_time ?? null}::time, ${rule}, ${seriesId},
                  ${assigneeId}::uuid, ${viewerId}::uuid, ${sectionId},
                  ${pagePosition})
          RETURNING id`,
    )
    const taskId = String(inserted[0]?.id)

    /*
    7.6's reminder arm, with the 8.6 instant that 4.8's NOT NULL fire_at
    demands. It is written after the
    task rather than beside it because the computation reads the row: the zone
    is the assignee's, which the INV-5 forcing above may have chosen rather
    than the body, and the dates are the ones just inserted.

    Both of 7.9's guards are already answered, by the create body itself and
    not by this file. A create states the task's due_date and due_time in the
    same breath as the reminder, so the dependency and the mode are relations
    between fields of one body, which is where the schema puts them. Reaching the upsert with a shape 8.6 cannot compute
    would mean that schema had stopped refusing it, and planReminder throws
    rather than inventing an arm, which is the backstop this ordering wants.
    */
    if (body.reminder !== undefined && body.reminder !== null) {
      await upsertReminder(tx, taskId, modeOf(body.reminder), viewerId)
    }

    // 7.6's steps are a list of titles. They become checklist items at the
    // end of the task's body, after any notes (migration 0060).
    await appendChecklist(tx, taskId, (body.steps ?? []).map((title) => ({ title })))

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
}

export async function createTask(
  db: Db,
  viewerId: string,
  body: PostTasksBody,
): Promise<CreateTaskResult> {
  return inTransaction(db, (tx) => createTaskIn(tx, viewerId, body))
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
  | { kind: 'start_after_due'; field: 'start_date' | 'due_date' }
  | { kind: 'section_not_here' }
  | { kind: 'reminder_refused'; refusal: ReminderRefusal }
  | { kind: 'forbidden'; reason: string }
  /** #221: a move that had to copy a shared file into the new Folder and
   * would take the mover past their storage quota. Nothing is written. */
  | { kind: 'quota_exceeded' }

/** Thrown inside the PATCH transaction so the whole move rolls back. */
class MoveQuotaRefusal extends Error {}

/*
7.6's PATCH, one transaction, and every refusal returns before the first
write: a request is one unit, so a body that fails on any field applies none
of itself.

Only present fields are written (7.6, 8.3): the UPDATE names the columns the
body named, never the whole row, which is what lets two members editing
different fields both win.

Three derived rules ride along:

- **The move.** A folder_id change requires membership of the target, which
  reads as 404 under the leak rule rather than as the 422 the spec text
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

The reminder is three more, all in this one transaction:

- **The mode cascade (8.4, one size down from the clear-date cascade above).**
  Two PATCH edits move due_time across the line 4.8 draws and each leaves a
  pair 4.8 calls illegal, so both delete the row: clearing due_time deletes an
  offset reminder, and setting one on a date-only task deletes a time_of_day
  reminder. A due_time that moves between two non-null values crosses no line,
  invalidates no mode and deletes nothing; it is the ordinary recompute below. Both deletes carry
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
  store?: ObjectStore,
): Promise<PatchTaskResult> {
  /* Objects a move's file copies wrote; removed if the transaction does not
     commit, so a rolled-back move leaves no unattached bytes (#128). */
  const copiedObjects: string[] = []
  try {
    return await patchTaskIn(db, viewerId, taskId, patch, store, copiedObjects)
  } catch (error: unknown) {
    if (store !== undefined) {
      for (const id of copiedObjects) {
        try {
          await store.remove(id)
        } catch {
          // Preserve the original error.
        }
      }
    }
    if (error instanceof MoveQuotaRefusal) return { kind: 'quota_exceeded' }
    throw error
  }
}

async function patchTaskIn(
  db: Db,
  viewerId: string,
  taskId: string,
  patch: PatchTaskBody,
  store: ObjectStore | undefined,
  copiedObjects: string[],
): Promise<PatchTaskResult> {
  return inTransaction(db, async (tx) => {
    /*
    A PATCH participates in #184's folder ordering domain. Resolve only enough
    to acquire every affected folder row first, in a stable order, then lock
    and re-read the task. Page actions use the same folder-before-task order,
    so a board drop and a canvas drag queue rather than deadlock while
    deciding one mixed position.

    **The folder lock used to be taken only for a folder or Section move, and
    that was a lock-order inversion that deadlocked under load**: a
    reassigning PATCH racing a completing transition on one Task read a 500
    on a contended run and never on a quiet one, which is what a deadlock
    does.

    The mechanism, because it is not obvious and the fix looks like a
    pessimisation without it. `transitionTask` takes the folder row
    `FOR UPDATE` and then the task row. A non-structural PATCH took the task
    row and never asked for the folder -- until `recordEvent`, which inserts
    an `events` row carrying `folder_id`, and **an insert against a foreign key
    takes `FOR KEY SHARE` on the referenced row**, which `FOR UPDATE` blocks.
    So the transition held the folder and waited for the task while the PATCH
    held the task and waited for the folder, and Postgres broke the cycle with
    40P01. Every path in this file already took folder-then-task except this
    one, so the fix is to stop making it the exception rather than to weaken
    anything.

    The cost is that two PATCHes on Tasks in one folder now queue where they
    used to interleave. That is the price of one lock order, it is the price
    `transitionTask`, `deleteTask`, `placeTaskInOrder` and the page actions
    already pay, and a deadlocked request is a 500 in somebody's face.
    */
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) return { kind: 'not_found' }
    {
      const folderIds = [
        ...new Set([
          preview.folderId,
          ...(patch.folder_id === undefined ? [] : [patch.folder_id]),
        ]),
      ].sort()
      for (const lockedFolderId of folderIds) {
        await tx.execute(sql`SELECT 1 FROM folders
                              WHERE id = ${lockedFolderId}::uuid FOR UPDATE`)
      }
    }
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }
    if (preview !== null && current.folderId !== preview.folderId) {
      return { kind: 'not_found' }
    }

    /*
    The Access gate (issue #228), and the reason it sits exactly here.

    `lockedTask` has just taken this row `FOR UPDATE OF t` and returned the
    assignee it holds *now*, in this transaction's snapshot. That is #228's
    same-transaction assignee rule met literally: a Can-contribute or an
    Assigned-work member whose standing over this Task comes from being its assignee is
    measured against the row the write is about to touch, so a reassignment
    that commits between somebody's screen and their request is seen. A gate
    placed before the lock would be a projection, and a projection must never
    authorize.

    One PATCH can be three different acts, and each is checked separately
    rather than collapsed into the widest of them -- a body that renames a
    Task *and* reassigns it must satisfy both `task.edit` and `task.assign`,
    and a member who may do only the first is refused the whole request rather
    than having half of it applied. Every other refusal in this function has
    the same all-or-nothing shape.
    */
    const acts: FolderAction[] = []
    if (
      patch.title !== undefined ||
      patch.notes !== undefined ||
      patch.important !== undefined ||
      patch.start_date !== undefined ||
      patch.due_date !== undefined ||
      patch.due_time !== undefined ||
      patch.recurrence_rule !== undefined
    ) {
      acts.push('task.edit')
    }
    if (patch.assignee_id !== undefined) acts.push('task.assign')
    if (patch.folder_id !== undefined || patch.section_block_id !== undefined) {
      acts.push('task.move')
    }
    if (patch.reminder !== undefined) acts.push('task.reminder.manage')
    for (const act of acts) {
      const decision = mayActOnTask(current, act)
      if (!decision.allowed) {
        return { kind: 'forbidden', reason: decision.reason }
      }
    }

    const target =
      patch.folder_id !== undefined && patch.folder_id !== current.folderId
        ? patch.folder_id
        : undefined
    if (target !== undefined) {
      const into = await accessOf(tx, viewerId, target)
      if (into === null) return { kind: 'target_not_found' }
      /* Authority in the folder the Task is moving *into*, asked with no
         assignee target on purpose: #228 puts "create/edit/move/order" of
         Tasks with Can edit and lets Can contribute move only their own
         current Task "among existing Sections", so the current-assignee
         clause that lets Can contribute rearrange their own work inside one Folder must
         not fire across the boundary between two. Without this the gate above
         would let a Can-contribute member push their Task into a Folder where
         they may only contribute, or a Can-edit member push one into a Folder
         where they may only comment. */
      const admitted = mayPerform(into, 'task.move')
      if (!admitted.allowed) {
        return { kind: 'forbidden', reason: admitted.reason }
      }
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

    // 4.5: a section names a block of the folder the task ends
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

    const effectiveSectionId = sectionId === undefined ? current.sectionBlockId : sectionId
    const repositioning = moving || effectiveSectionId !== current.sectionBlockId
    let pagePosition: string | undefined
    if (repositioning) {
      const pageItems = await seededItems(tx, folderId)
      const placed = positionAtSectionEnd(
        pageItems,
        moving ? null : { kind: 'task', id: taskId },
        effectiveSectionId,
      )
      if (placed === null) return { kind: 'section_not_here' }
      pagePosition = placed
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
    The Schedule's own rule, 4.5's tasks_start_before_due_check, in the
    direction only the row can answer (issue #215).

    The create body answers this whole because it carries both dates or
    neither. A PATCH does not: a body setting only start_date has to be read
    against whatever due_date the row already holds, and a body setting only
    due_date against the stored start_date. So it is the merged state that is
    checked, exactly as the two checks above check theirs, and before the
    first write for the same reason.

    Nothing here is needed for clearing. 8.4's cascade takes due_time and the
    rule with the date and deliberately leaves start_date alone, so a cleared
    due_date makes finalDueDate null and the rule vacuous — which is the
    start-only state, one of the four the issue accepts.

    The 422 names the field the body actually sent, because that is the one
    the person just moved; where it sent both, it names start_date, which is
    what the shared schema's refinement on the create body also names.
    */
    const finalStartDate =
      patch.start_date !== undefined ? patch.start_date : current.startDate
    if (
      finalStartDate !== null &&
      finalDueDate !== null &&
      finalStartDate > finalDueDate
    ) {
      return {
        kind: 'start_after_due',
        field: patch.start_date !== undefined ? 'start_date' : 'due_date',
      }
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
    /* #221: a legacy `notes` write keeps the Task's document in step, under
       the Task row lock `lockedTask` took above; it answers the value the
       column is to hold (`domain/task-document.ts` has the rule). */
    if (patch.notes !== undefined) {
      sets.push(sql`notes = ${await legacyNotesWrite(tx, taskId, patch.notes)}`)
    }
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
    if (pagePosition !== undefined) {
      sets.push(sql`page_position = ${pagePosition}`)
    }
    /*
    Outside the clearing branch on purpose (issue #215). 8.4's cascade is
    scoped to what a due date carries — its time, its rule, its reminder — and
    a start date is none of those. Clearing due_date on a task that has a
    start leaves a start-only task, which the issue lists among the four valid
    states; taking the start with it would make the two dates one field.
    */
    if (patch.start_date !== undefined) {
      sets.push(sql`start_date = ${patch.start_date}::date`)
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
      if (moving) {
        // M5: the task's Discussions (4.31 `task_id`, live or trashed) move
        // with it, and their comments with them. 4.15's pair FK holds a
        // comment's scope to its Discussion's folder, so its check is
        // deferred to the commit because neither UPDATE can satisfy it
        // while the other has not run (migration 0059, as 0007 did for the
        // task pair).
        await tx.execute(sql`SET CONSTRAINTS comments_discussion_scope_fkey DEFERRED`)
        /* The Folder Labels go, and they go rather than moving because they
           belong to the folder the task is leaving (issue #226, #208 R6A:
           "Personal Labels remain, source Folder Labels are removed, no
           destination name matching"). It is a DELETE before the UPDATE
           rather than a deferred pair like the comments above, because there
           is no destination row to point them at: migration 0022's
           task_scope_fkey would refuse them either way, and deferring would
           only move the refusal to the commit. The viewer's Personal
           assignments are untouched, which is the same sentence read the
           other way: they were never the folder's. */
        await dropFolderLabelsOnMove(tx, taskId)
        /* #221: the files the Task's document and comments name follow it,
           or the new Folder's members could not open them and the old
           Folder's purge would take them (`domain/files.ts` has the rule). */
        const carried = await carryTaskFilesOnMove(
          tx,
          store,
          viewerId,
          taskId,
          current.folderId,
          folderId,
          copiedObjects,
        )
        if (carried === 'quota_exceeded') throw new MoveQuotaRefusal()
      }
      await tx.execute(
        sql`UPDATE tasks SET ${sql.join(sets, sql`, `)}
            WHERE id = ${taskId}::uuid`,
      )
      if (moving) {
        await tx.execute(
          sql`UPDATE discussions SET folder_id = ${folderId}::uuid
              WHERE task_id = ${taskId}::uuid`,
        )
        await tx.execute(
          sql`UPDATE comments SET folder_id = ${folderId}::uuid
              WHERE discussion_id IN (SELECT id FROM discussions
                                       WHERE task_id = ${taskId}::uuid)`,
        )
      }
    }
    if (clearing) {
      await tx.execute(
        sql`DELETE FROM reminders WHERE task_id = ${taskId}::uuid`,
      )
    } else if (patch.due_time !== undefined && finalDueTime !== current.dueTime) {
      // 8.4's smaller sibling, both arms. Only a move across the null
      // boundary invalidates a mode, so a time that moves from one value to
      // another falls through to the recompute below.
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
      const verb = moving
        ? 'moved'
        : patch.title !== undefined && patch.title !== current.title
          ? 'renamed'
          : 'edited'
      await recordEvent(tx, {
        actorId: viewerId,
        verb,
        subjectKind: 'task',
        subjectId: taskId,
        subjectName: patch.title ?? current.title,
        folderId,
        detail:
          newAssignee !== null
            ? `assigned to ${await displayNameOf(tx, newAssignee)}`
            : reminder !== null && sets.length === 0
              ? 'set a reminder'
              : // Only a plain edit takes a detail: on a move or a rename a
                // lowercase detail would outrank the verb in the history
                // sheet (sentenceOf) and the move or rename would vanish.
                verb === 'edited'
                ? await plainEditDetail(tx, patch, current, assigneeId)
                : undefined,
        recipients: newAssignee === null ? undefined : [newAssignee],
      })
    }

    return { kind: 'patched', task: await viewOrFail(tx, viewerId, taskId) }
  })
}

/*
The half a verb cannot carry for a PATCH with no assignment or reminder in it
(m3 issue page): the issue timeline says "unassigned Sara" or "set the due
date to 2026-10-20" rather than nothing, and "edited the description" is the
one detail that marks the body as edited. The first change that applies names
the act; anything else stays undescribed, as before.
*/
async function plainEditDetail(
  tx: Executor,
  patch: { readonly notes?: string | null; readonly due_date?: string | null; readonly start_date?: string | null },
  current: { readonly assigneeId: string | null; readonly dueDate: string | null; readonly startDate: string | null },
  assigneeId: string | null | undefined,
): Promise<string | undefined> {
  if (assigneeId === null && current.assigneeId !== null) {
    return `unassigned ${await displayNameOf(tx, current.assigneeId)}`
  }
  if (patch.notes !== undefined) return 'edited the description'
  if (patch.due_date !== undefined && patch.due_date !== current.dueDate) {
    return patch.due_date === null ? 'removed the due date' : `set the due date to ${patch.due_date}`
  }
  if (patch.start_date !== undefined && patch.start_date !== current.startDate) {
    return patch.start_date === null ? 'removed the start date' : `set the start date to ${patch.start_date}`
  }
  return undefined
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
 * second delete finds nothing accessible and answers 404, because
 * 204 for a row that existed beside 404 for one that never did is an
 * existence oracle. */
/** 7.13: the delete marks rather than removes, so the row and its
 * parts wait 30 days for any member's restore; the 11.7 pass is the only
 * thing that ever deletes it. The resolution above already refuses a row
 * that is trashed, which is what makes the second delete 8.3's 404. */
export async function deleteTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx,viewerId,taskId)
    if(preview===null)return 'not_found'
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${preview.folderId}::uuid FOR UPDATE`)
    const current = await accessibleTask(tx, viewerId, taskId)
    if (current === null) {
      return 'not_found'
    }
    /* R8, in terms: Can contribute may not trash shared Tasks, their own
       included. This gate is therefore asked with no assignment escape --
       `task.trash` names no `whenAssignedToActor` presets, so the assignee
       the read carries changes nothing here, and passing it costs nothing and
       keeps every task gate in this file one shape. */
    const decision = mayActOnTask(current, 'task.trash')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
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
  | { kind: 'forbidden'; reason: string }
  /** 7.6: the transition would run generation
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
   * rule, which is also the pair 7.6 gives the tz parameter. */
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

Two seams, both calls into the time module rather than anything computed
here.

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

**The zone, per 7.6.** It arrives as a
parameter, never from users.timezone, which 8.1 reserves for reminder fire
instants, and the route validates a present one before this function is
reached. An absent one is refused here, and only here: the condition is 7.6's
own, the winning guarded update landing on a pending row that carries
a rule, which is exactly the call that would evaluate a calendar date. The
refusal returns before the update, so the transaction changes nothing, which
7.6 requires and is not an implementation detail.

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
    const preview = await accessibleTask(tx,viewerId,taskId)
    if(preview===null)return {kind:'not_found'}
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${preview.folderId}::uuid FOR UPDATE`)
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) return { kind: 'not_found' }

    /*
    The Access gate, and this is the one the whole race-safety argument is
    about (issue #228; accepted R8A's Assigned work).

    Assigned work means: execute the plan for Tasks *currently* assigned to
    you. `lockedTask` a line above took this row `FOR UPDATE OF t`, so the
    assignee it returned is the assignee the guarded UPDATE below will act on,
    and no concurrent reassignment can slip between them. A gate that read the
    assignee outside this lock -- or, worse, trusted the client's copy --
    would let somebody complete a Task that had just been taken off them.

    Complete and uncomplete are execution and belong to the assignee; abandon
    and restore are not, which #228's Assigned-work list states outright, so
    they carry the different action and Assigned work is refused them.
    */
    const decision = mayActOnTask(
      current,
      event === 'complete' || event === 'uncomplete'
        ? 'task.status.complete'
        : 'task.status.abandon',
    )
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }

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
          /* The next occurrence stands directly after the one just done, so
             the Work thread's next step is the row below the tick; after an
             uncomplete, the recreated one takes the reclaimed one's place. */
          const items = await seededItems(tx, current.folderId)
          const successor = { kind: 'task', id: outcome.successorId } as const
          const position = positionAfter(items, successor, { kind: 'task', id: taskId })
            ?? positionAtSectionEnd(items, successor, current.sectionBlockId)
          await tx.execute(sql`UPDATE tasks SET page_position=${position},section_block_id=${current.sectionBlockId}::uuid WHERE id=${outcome.successorId}::uuid`)
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
 * 7.8 My Day membership
 * ------------------------------------------------------------------ */

/*
The pull, insert-or-nothing rather than an upsert: 7.8 keeps the original
added_on on a repeat, and 8.2 reads that date as the qualify date deciding
Carried against Today, so an upsert would quietly move a task pulled last
week into today's group. ON CONFLICT DO NOTHING is INV-12's primary key doing
the work.

added_on is today(V), which 7.8 names outright and which the tz query
parameter supplies.

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
/**
 * My Day's two results.
 *
 * It was `StepResult` until issue #228 gave that union a `forbidden` arm, and
 * My Day has no such arm and must not grow one: #228's personal-actions rule
 * puts personal state outside Folder Access, so every member who can *see* the Task may put
 * it on their own day, Can view included. A type that admitted a refusal here
 * would be an invitation to add one.
 */
export type MyDayResult =
  | { kind: 'ok'; task: TaskDetail }
  | { kind: 'not_found' }

export async function pullIntoMyDay(
  db: Db,
  viewerId: string,
  taskId: string,
  tz: string,
): Promise<MyDayResult> {
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
): Promise<MyDayResult> {
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
  | { kind: 'forbidden'; reason: string }

/**
 * 7.9's PUT: the whole reminder, upserted, answering the affected
 * TaskDetail.
 *
 * The row is locked before it is read, the reason patchTask locks: this
 * decides from the task's due_date and due_time and then writes against them,
 * and a PATCH arriving between the two would leave a reminder whose mode 4.8
 * calls illegal, written by a guard that was true when it ran.
 *
 * Order is 10.2's and not this endpoint's preference: access first, so a
 * caller outside the folder is answered 404 without learning whether their
 * body would have been valid.
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
    /* #228's Assigned-work list puts the assignee-delivered reminder with the
       assignee, and the reason is 8.6: Dana delivers it to whoever the Task
       is assigned to, so the person
       who will be woken by it is the person who sets it. Can edit and above
       may set it on anybody's Task; Assigned work and Can contribute may set
       it on the one currently assigned to them, which the locked row decides.

       Order is 10.2's and unchanged: access first, then the body's own
       refusals, so a caller outside the folder never learns whether their
       body would have been valid. */
    const decision = mayActOnTask(current, 'task.reminder.manage')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }

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
 * 7.9's DELETE: 204, idempotent, and nothing else touched.
 *
 * Idempotent means the row's absence is not an error, so the resource this
 * URL addresses is the task and the 404 is the task's alone: a second call,
 * and a call against a task that never carried a reminder, both answer 204
 * This is 7.8's DELETE shape rather than 7.6's, where a second
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
): Promise<'deleted' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null) {
      return 'not_found'
    }
    // The same rule as the PUT: whoever may set it may clear it. The read is
    // the locked one so the assignee this decides on is the assignee the
    // DELETE below acts against (issue #228).
    const decision = mayActOnTask(current, 'task.reminder.manage')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
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

/* ------------------------------------------------------------------ *
 * The Task document (issue #221)
 * ------------------------------------------------------------------ */

/**
 * `GET /tasks/:id/document`: any member who can see the Task reads it (the
 * `taskView` scope), and a non-member is 404 (10.2). A Task that has notes and
 * no document yet is given one here, under the Task row's lock.
 */
export async function taskDocument(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<PageView | null> {
  return inTransaction(db, async (tx) => {
    const access = await accessibleTask(tx, viewerId, taskId)
    if (access === null) return null
    if (await needsMaterializing(tx, taskId)) {
      await tx.execute(sql`SELECT 1 FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`)
      await materializeNotesLocked(tx, taskId)
    }
    return taskDocumentViewIn(tx, taskId)
  })
}

/** A checklist item named inside 4.13's 200-character detail: whole when
 * short, cut with an ellipsis when not, so a long item never makes the event
 * refuse. */
function itemWord(text: string): string {
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}

/**
 * `PUT /tasks/:id/document`: 7.16's document transaction over the Task's
 * blocks, gated on `task.edit` exactly as a `notes` PATCH is, and in the same
 * lock order (folder, then the Task row) so the gate reads the row the write
 * touches. Refusals leave as `TaskDocumentRefusal`.
 */
export async function writeTaskDocument(
  db: Db,
  viewerId: string,
  taskId: string,
  body: DocumentTransaction,
): Promise<PageView> {
  return inTransaction(db, async (tx) => {
    const preview = await accessibleTask(tx, viewerId, taskId)
    if (preview === null) throw new TaskDocumentRefusal('not_found', 'Not found.')
    await tx.execute(sql`SELECT 1 FROM folders WHERE id = ${preview.folderId}::uuid FOR UPDATE`)
    const current = await lockedTask(tx, viewerId, taskId)
    if (current === null || current.folderId !== preview.folderId) {
      throw new TaskDocumentRefusal('not_found', 'Not found.')
    }
    /* Assigned work may tick its own task's checklist (`step.toggle`) but
       not edit the task (`task.edit`): a transaction that only ticks or
       unticks existing items is admitted under the first, anything else
       needs the second. */
    const decision = mayActOnTask(current, 'task.edit')
    const ticks = await checklistTicks(tx, taskId, body)
    if (!decision.allowed && !(mayActOnTask(current, 'step.toggle').allowed && ticks !== null)) {
      throw new TaskDocumentRefusal('forbidden', decision.reason)
    }
    const result = await applyTaskDocumentLocked(tx, viewerId, current.folderId, taskId, body)
    if (result.changed) {
      /* A tick is not a description edit: each ticked or unticked item is
         named, in the words a step's tick used before 0060, which the
         timeline draws as "completed the subtask …". */
      const details =
        ticks !== null
          ? ticks.map((tick) => `${tick.checked ? 'completed' : 'reopened'} the step '${itemWord(tick.text)}'`)
          : ['edited the description']
      for (const detail of details) {
        await recordEvent(tx, {
          actorId: viewerId,
          verb: 'edited',
          subjectKind: 'task',
          subjectId: taskId,
          subjectName: current.title,
          folderId: current.folderId,
          detail,
        })
      }
    }
    return result.view
  })
}

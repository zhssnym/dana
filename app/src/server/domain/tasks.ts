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

One of the two seams this file opened at P3 is closed here, and one is not:

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
- **fire_at recomputation (8.6)** follows a due_date or assignee change.
  P7 delivers the computation, 4.8's NOT NULL fire_at means no row can be
  written without it, and at P3 a reminder row exists only where a test
  seeded one. The clear-date cascade still deletes the row, because 8.4
  deletes rather than computes.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  PatchStepBody,
  PatchTaskBody,
  PostTaskStepsBody,
  PostTasksBody,
  TaskCard,
  TaskDetail,
  TaskStatus,
  TaskStep,
} from '../../shared/tasks.js'
import { applySeriesGuard, generateSuccessor, today } from '../time/index.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
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

const TASK_ACCESS_COLUMNS = sql`t.id, t.folder_id, t.status, t.assignee_id,
       ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
       t.recurrence_rule`

function taskAccessFromRow(row: Record<string, unknown>): TaskAccess {
  return {
    id: String(row.id),
    folderId: String(row.folder_id),
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
        WHERE t.id = ${taskId}`,
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
        WHERE t.id = ${taskId}
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
               t.completed_at, t.completed_by, t.created_by,
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
               to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id
        LEFT JOIN users a ON a.id = t.assignee_id
        LEFT JOIN reminders r ON r.task_id = t.id
        WHERE t.id = ${taskId}`,
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
    created_by: String(row.created_by),
  }
}

/*
7.0's TaskCard, which is 7.0's TaskDetail less its eight, and the shape frozen
7.6 gives generated_task. It is derived from the detail rather than read by a
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
    created_by: _createdBy,
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
 * POST /tasks
 * ------------------------------------------------------------------ */

export type CreateTaskResult =
  | { kind: 'created'; task: TaskDetail }
  | { kind: 'folder_not_found' }
  | { kind: 'assignee_not_member' }

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

    const rule = body.recurrence_rule ?? null
    const seriesId = rule === null ? sql`NULL` : sql`gen_random_uuid()`
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO tasks (folder_id, title, notes, important, due_date,
                             due_time, recurrence_rule, series_id,
                             assignee_id, created_by)
          VALUES (${folderId}::uuid, ${body.title}, ${body.notes ?? null},
                  ${body.important ?? false}, ${body.due_date ?? null}::date,
                  ${body.due_time ?? null}::time, ${rule}, ${seriesId},
                  ${assigneeId}::uuid, ${viewerId}::uuid)
          RETURNING id`,
    )
    const taskId = String(inserted[0]?.id)

    // 7.6's steps are a list of titles; 4.6's position is a sort key with
    // gaps allowed, so the create numbers them from one in the order sent.
    const titles = body.steps ?? []
    for (const [index, title] of titles.entries()) {
      await tx.execute(
        sql`INSERT INTO steps (task_id, title, position)
            VALUES (${taskId}::uuid, ${title}, ${index + 1})`,
      )
    }

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
    }

    return { kind: 'patched', task: await viewOrFail(tx, viewerId, taskId) }
  })
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
export async function deleteTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    if ((await accessibleTask(tx, viewerId, taskId)) === null) {
      return 'not_found'
    }
    await tx.execute(sql`DELETE FROM tasks WHERE id = ${taskId}::uuid`)
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
    if ((await lockedTask(tx, viewerId, taskId)) === null) {
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
): Promise<{ stepId: string; taskId: string } | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT s.id, s.task_id
        FROM steps s
        JOIN tasks t ON t.id = s.task_id
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        WHERE s.id = ${stepId}`,
  )
  const row = found[0]
  return row === undefined
    ? null
    : { stepId: String(row.id), taskId: String(row.task_id) }
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
    return 'deleted'
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

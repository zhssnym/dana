/*
8.6's five recompute triggers, as one callable its consumers invoke.

**Why this is a function rather than a rule other sessions follow.** The
reminders seam of docs/team/README.md states the tiebreaker in the words this
file exists to satisfy: this role owns all five triggers as a callable, never
as arithmetic the callers restate, and every caller invokes it inside its own
transaction. Four of the five fire inside the Collaboration engineer's paths
(due_date, due_time and assignee_id through PATCH /tasks/:id, and the
reminder's own value and mode through PUT /tasks/:id/reminder), and the fifth
fires inside the Security engineer's auth module, at the login sync and at
PATCH /me, which frozen 7.1 charges with the recompute in its own text. Five
call sites restating one computation is five chances to disagree about a
timezone, and the two that disagreed would differ by an hour twice a year.

**The caller owns the transaction, and calls after its own write.** Nothing
here opens a transaction, the shape of P5's deleteAccountData(tx, userId) and
of this directory's own generateSuccessor. Every function below reads the
current row rather than taking values on trust, so it must run after the write
that triggered it and inside the same transaction: called before, it computes
from the state the trigger just replaced. That ordering is the whole contract
and it is the one thing a caller can get wrong silently.

**Two behaviors, not five.** 8.6's ruling of 2026-08-10 draws the line for us:

- The four task-scoped triggers change the occasion the reminder is about, its
  deadline, its lead time or the person owed it, and a new occasion deserves a
  delivery of its own. They recompute the row whatever state it is in, and
  where they return one to scheduled from either terminal state they clear
  fired_at with it, so 4.8's note that fired_at is set when state leaves
  scheduled stays true of every row rather than of most of them.
- The timezone trigger re-expresses an unchanged occasion on a different wall
  clock. It touches rows in state scheduled and no others, which is frozen
  7.1's own scope, so a delivered reminder is never revived into a second copy
  of the same email and a skipped row stays skipped.

**One invariant covers fired_at everywhere below**: it is null exactly when
state is scheduled, and otherwise carries the moment the row reached its
current terminal state. 4.8's note is satisfied in both directions by that,
and it is what the ruling above asks for without a special case per trigger.
*/
import { sql } from 'drizzle-orm'

import type { CalendarDate } from './calendarDate.js'
import { rowsOf } from './executor.js'
import type { Executor } from './executor.js'
import { resolveFireAt } from './reminderTime.js'
import type { LocalTimeKind } from './reminderTime.js'

/** 4.8's three states. */
export type ReminderState = 'scheduled' | 'sent' | 'skipped'

/** The state a freshly computed instant lands in. 8.6: scheduled when the
 * instant is in the future, skipped when it is already past, never fired
 * retroactively. Frozen 7.9 carries the same qualifier for the PUT. */
export type ComputedState = 'scheduled' | 'skipped'

/**
 * Which of 8.6's five recompute triggers fired.
 *
 * Named individually although four of them share a behavior, because the
 * caller that knows which field it just wrote is the only party that knows,
 * and a trigger that has to be inferred here from what changed would be
 * inferred from the row after the change, where the evidence is gone. It also
 * makes each call site answerable for the trigger it owns: the four taskId
 * arms are the Collaboration engineer's and the userId arm is the Security
 * engineer's.
 */
export type ReminderTrigger =
  /** PATCH /tasks/:id moved due_date to a non-null date (7.6). Clearing it is
   * 8.4's cascade instead, which deletes the row and needs nothing here. */
  | { readonly kind: 'due_date'; readonly taskId: string }
  /** PATCH /tasks/:id moved due_time. */
  | { readonly kind: 'due_time'; readonly taskId: string }
  /** PUT /tasks/:id/reminder changed the reminder's own value or mode, on a
   * row that already existed. A first write uses planReminder below, the row
   * having no instant to recompute yet. */
  | { readonly kind: 'reminder'; readonly taskId: string }
  /** PATCH /tasks/:id moved assignee_id, in either direction. This is the one
   * trigger that changes the zone rather than a local time inside one. */
  | { readonly kind: 'assignee_id'; readonly taskId: string }
  /** users.timezone of an assignee changed: the login sync of 7.1 or PATCH
   * /me. The userId is the user whose column moved. */
  | { readonly kind: 'assignee_timezone'; readonly userId: string }

export interface RecomputedReminder {
  readonly taskId: string
  readonly fireAt: Date
  readonly state: ComputedState
  /** Which of 8.6's cases the local time landed in, for a caller that wants to
   * log that a DST rule fired. */
  readonly kind: LocalTimeKind
}

/** A scheduled row the timezone trigger met and could not compute. See the
 * comment at recomputeReminders for why this is reported rather than thrown. */
export interface UnresolvedReminder {
  readonly taskId: string
  readonly reason: string
}

export interface RecomputeOutcome {
  /** The rows this call wrote. Empty when the task carries no reminder, which
   * is the ordinary case and not a condition a caller needs to check first. */
  readonly recomputed: readonly RecomputedReminder[]
  /** Always empty for the four task-scoped triggers, which throw instead. */
  readonly unresolved: readonly UnresolvedReminder[]
}

/** What a write path must be told before a reminder row can exist, since 4.8
 * makes fire_at NOT NULL and there is no half of the row to write without it. */
export interface ReminderPlan {
  readonly fireAt: Date
  readonly state: ComputedState
  /** Null when scheduled; the evaluation instant when skipped. */
  readonly firedAt: Date | null
  readonly kind: LocalTimeKind
}

export interface ReminderPlanRequest {
  readonly taskId: string
  /** Exactly one of these two is non-null (4.8). */
  readonly offsetMinutes: number | null
  readonly timeOfDay: string | null
  /** The reminders.created_by the caller is about to write, or the one the
   * existing row already holds. It is read only as 8.6's fallback zone source
   * and only when the task is unassigned; the column itself stays the caller's
   * to write. */
  readonly createdBy: string
  /** The moment "already past" is measured against. Defaulted rather than
   * captured, the reason today() states: 8.1 leaves the process clock and the
   * database clock both open, and a helper calling new Date() out of sight
   * would settle that by accident. */
  readonly at?: Date
}

/** The columns 8.6 computes from, however they were reached. */
interface ComputationSource {
  readonly dueDate: CalendarDate | null
  readonly dueTime: string | null
  readonly zone: string
  readonly offsetMinutes: number | null
  readonly timeOfDay: string | null
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function integer(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/*
The one read every recompute makes, written once so the two behaviors cannot
drift apart on which columns 8.6 computes from. The trailing WHERE is open on
purpose: each caller appends its own predicate, which is the difference
between the two and the only difference between them.

Dates and times come through to_char because the two drivers disagree about
DATE and TIME columns, the reason generation.ts and the domain modules give;
an instant here would be the defect 4.11's floating storage exists to prevent.
The zone comes from COALESCE(assignee_id, created_by), which is 8.6's first
line: the assignee's zone, or the reminder creator's when the task is
unassigned. The creator is a fallback for the computation and not a sixth
trigger, ruled at the P7 kickoff and recorded in 8.6 with its reasoning, so a
creator who travels moves nothing and no query here watches that column.
*/
const reminderComputationColumns = sql`
  SELECT r.task_id,
         r.offset_minutes,
         to_char(r.time_of_day, 'HH24:MI') AS time_of_day,
         to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
         to_char(t.due_time, 'HH24:MI') AS due_time,
         u.timezone
    FROM reminders r
    JOIN tasks t ON t.id = r.task_id
    LEFT JOIN users u ON u.id = COALESCE(t.assignee_id, r.created_by)
   WHERE true`

function sourceOf(row: Record<string, unknown>, taskId: string): ComputationSource {
  const zone = text(row.timezone)
  if (zone === null) {
    // 4.1 makes users.timezone NOT NULL and both candidates are foreign keys,
    // so a null here is a created_by pointing at no user rather than a zone
    // that was never set.
    throw new TypeError(
      `no timezone could be read for the reminder on task ${taskId}; 8.6 computes in the assignee's zone, or the reminder creator's when unassigned`,
    )
  }
  return {
    dueDate: text(row.due_date),
    dueTime: text(row.due_time),
    zone,
    offsetMinutes: integer(row.offset_minutes),
    timeOfDay: text(row.time_of_day),
  }
}

/** The UPDATE both behaviors write, differing only in whether the row must
 * still be scheduled for the write to land. */
function writeComputed(
  tx: Executor,
  taskId: string,
  plan: ReminderPlan,
  scheduledOnly: boolean,
): Promise<unknown> {
  const firedAt = plan.firedAt === null ? null : plan.firedAt.toISOString()
  return tx.execute(
    sql`UPDATE reminders
           SET fire_at = ${plan.fireAt.toISOString()}::timestamptz,
               state = ${plan.state},
               fired_at = ${firedAt}::timestamptz
         WHERE task_id = ${taskId}::uuid
           ${scheduledOnly ? sql`AND state = 'scheduled'` : sql``}`,
  )
}

/**
 * 8.6's computation over one row's columns, plus the state its instant earns.
 *
 * The zone arrives already resolved because the two arms of 8.6's first line,
 * the assignee's zone and the creator's fallback, are decided by the SQL
 * below: COALESCE(assignee_id, created_by) is that sentence, and reading it in
 * the statement keeps the two arms from being re-derived per call site.
 */
function planFrom(source: ComputationSource, at: Date): ReminderPlan {
  if (source.dueDate === null) {
    // 4.8 records that a reminder on a dateless task is impossible via 8.4's
    // cascade, which deletes the row with the date. Reaching here means the
    // cascade did not run, and both of 8.6's arms need this column.
    throw new TypeError(
      'a reminder exists on a task with no due_date, which 8.4 deletes and 4.8 calls impossible',
    )
  }
  const resolved = resolveFireAt({
    zone: source.zone,
    dueDate: source.dueDate,
    dueTime: source.dueTime,
    offsetMinutes: source.offsetMinutes,
    timeOfDay: source.timeOfDay,
  })
  // 8.6: state is scheduled when the new instant is in the future, and skipped
  // when it is already past, never fired retroactively. Equality counts as
  // past, matching the loop's own poll of fire_at <= now().
  const future = resolved.instant.getTime() > at.getTime()
  return {
    fireAt: resolved.instant,
    state: future ? 'scheduled' : 'skipped',
    firedAt: future ? null : at,
    kind: resolved.kind,
  }
}

/**
 * The instant and state a reminder about to be written should carry.
 *
 * For the three paths that create a row rather than recompute one: frozen
 * 7.9's PUT, the reminder arm of frozen 7.6's create body, and 8.5's copy onto
 * a generated successor, which this module performs itself below. 4.8 makes
 * fire_at NOT NULL, so the row cannot be inserted first and computed after,
 * and the caller writing values this function returned is not restating any
 * arithmetic: it is writing the answer, in the statement it owns.
 *
 * The caller is expected to have raised frozen 7.9's two 422s already, for a
 * task with no due_date and for a body carrying the wrong mode. Those are
 * validation, they answer a status code, and this function throws rather than
 * reporting them because reaching it with either means the guard is missing.
 */
export async function planReminder(
  tx: Executor,
  request: ReminderPlanRequest,
): Promise<ReminderPlan> {
  const found = await rowsOf(
    tx,
    sql`SELECT to_char(t.due_date, 'YYYY-MM-DD') AS due_date,
               to_char(t.due_time, 'HH24:MI') AS due_time,
               u.timezone
          FROM tasks t
          LEFT JOIN users u
                 ON u.id = COALESCE(t.assignee_id, ${request.createdBy}::uuid)
         WHERE t.id = ${request.taskId}::uuid`,
  )
  const row = found[0]
  if (row === undefined) {
    throw new TypeError(
      `planReminder was given a task that does not exist: ${request.taskId}`,
    )
  }
  const zone = text(row.timezone)
  if (zone === null) {
    // 4.1 makes users.timezone NOT NULL and both candidates are foreign keys,
    // so a null here is a created_by pointing at no user rather than a zone
    // that was never set.
    throw new TypeError(
      `no timezone could be read for task ${request.taskId}; 8.6 computes in the assignee's zone, or the reminder creator's when unassigned`,
    )
  }
  return planFrom(
    {
      dueDate: text(row.due_date),
      dueTime: text(row.due_time),
      zone,
      offsetMinutes: request.offsetMinutes,
      timeOfDay: request.timeOfDay,
    },
    request.at ?? new Date(),
  )
}

/**
 * 8.6's recompute, for whichever of the five triggers fired.
 *
 * Call it inside the transaction that wrote the change, after the write. It
 * reads the current row, so a task carrying no reminder is a no-op and a
 * caller need not check for one first, and a PATCH that moved due_date,
 * due_time and assignee_id together may call once: the answer is a function of
 * the row as it now stands, so the call is idempotent and naming a second
 * trigger would compute the same instant twice.
 */
export async function recomputeReminders(
  tx: Executor,
  trigger: ReminderTrigger,
  at: Date = new Date(),
): Promise<RecomputeOutcome> {
  return trigger.kind === 'assignee_timezone'
    ? recomputeForZoneChange(tx, trigger.userId, at)
    : recomputeForTask(tx, trigger.taskId, at)
}

/**
 * The four task-scoped triggers: one row, recomputed from any state.
 *
 * No state predicate, deliberately. 8.6's reset names no state it resets from
 * and frozen 7.6's due_date bullet scopes its recompute to none either,
 * because a user who pushes a deadline out by a week and then hears nothing
 * has lost the reminder they can still see configured on the task.
 */
async function recomputeForTask(
  tx: Executor,
  taskId: string,
  at: Date,
): Promise<RecomputeOutcome> {
  const found = await rowsOf(tx, sql`${reminderComputationColumns} AND r.task_id = ${taskId}::uuid`)
  const row = found[0]
  if (row === undefined) return { recomputed: [], unresolved: [] }

  const plan = planFrom(sourceOf(row, taskId), at)
  await writeComputed(tx, taskId, plan, false)
  return {
    recomputed: [{ taskId, fireAt: plan.fireAt, state: plan.state, kind: plan.kind }],
    unresolved: [],
  }
}

/**
 * The timezone trigger: every scheduled reminder on a task assigned to this
 * user, and nothing else.
 *
 * The zone is read through the join rather than taken as a parameter, so the
 * caller cannot hand over the value it just replaced, and the UPDATE repeats
 * the state predicate the SELECT used so a delivery landing between the two
 * wins rather than being overwritten back to scheduled.
 *
 * A row this trigger cannot compute is reported rather than thrown. The other
 * four fire on the very write that produced the shape, so a throw there points
 * straight at the defect and costs one refused task edit; this one fires
 * inside sign-in, which frozen 7.1 already refuses to fail over a zone problem
 * (it treats an unrecognized tz as absent rather than answering 422), and one
 * unwritable reminder row taking down every login for that account is a worse
 * outcome than a stale instant on a row that was already wrong.
 */
async function recomputeForZoneChange(
  tx: Executor,
  userId: string,
  at: Date,
): Promise<RecomputeOutcome> {
  const found = await rowsOf(
    tx,
    sql`${reminderComputationColumns}
          AND t.assignee_id = ${userId}::uuid
          AND r.state = 'scheduled'`,
  )

  const recomputed: RecomputedReminder[] = []
  const unresolved: UnresolvedReminder[] = []
  for (const row of found) {
    const taskId = String(row.task_id)
    let plan: ReminderPlan
    try {
      plan = planFrom(sourceOf(row, taskId), at)
    } catch (error) {
      unresolved.push({
        taskId,
        reason: error instanceof Error ? error.message : String(error),
      })
      continue
    }
    await writeComputed(tx, taskId, plan, true)
    recomputed.push({ taskId, fireAt: plan.fireAt, state: plan.state, kind: plan.kind })
  }
  return { recomputed, unresolved }
}

/**
 * 8.5's reminder arm, closed here rather than in generation.ts because every
 * line of it except the INSERT is this file's: the successor's instant is a
 * fresh 8.6 computation over the successor's own due date, which is exactly
 * what the arm was waiting for.
 *
 * 8.5 writes state='scheduled' flatly and this follows it rather than 8.6's
 * past-instant rule, which governs the five triggers and does not list
 * generation among them. The two only disagree where a successor's instant is
 * already past, which needs an offset measured in days against a rule whose
 * next instance is tomorrow; there the loop's own six-hour staleness rule
 * settles it on the first pass, which is the same answer one tick later.
 */
export async function copyReminderToSuccessor(
  tx: Executor,
  sourceTaskId: string,
  successorTaskId: string,
): Promise<ReminderPlan | null> {
  const found = await rowsOf(
    tx,
    sql`SELECT r.offset_minutes,
               to_char(r.time_of_day, 'HH24:MI') AS time_of_day,
               r.created_by
          FROM reminders r
         WHERE r.task_id = ${sourceTaskId}::uuid`,
  )
  const source = found[0]
  if (source === undefined) return null

  const createdBy = String(source.created_by)
  const plan = await planReminder(tx, {
    taskId: successorTaskId,
    offsetMinutes: integer(source.offset_minutes),
    timeOfDay: text(source.time_of_day),
    createdBy,
  })
  await tx.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${successorTaskId}::uuid, ${integer(source.offset_minutes)},
                ${text(source.time_of_day)}::time,
                ${plan.fireAt.toISOString()}::timestamptz,
                'scheduled', NULL, ${createdBy}::uuid)`,
  )
  return { ...plan, state: 'scheduled', firedAt: null }
}

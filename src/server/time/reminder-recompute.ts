// 8.6's reminder recompute triggers. Callers run it inside their own transaction, after their write:
// it reads the current row, so calling it before the write computes from stale state.
// Task-scoped triggers recompute from any state; the timezone trigger touches scheduled rows only.
import { sql } from 'drizzle-orm'

import type { CalendarDate } from './calendar-date.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { resolveFireAt } from './reminder-time.js'
import type { LocalTimeKind } from './reminder-time.js'

export type ReminderState = 'scheduled' | 'sent' | 'skipped'

/** 8.6: scheduled when the instant is in the future, skipped when already past. Never fired retroactively. */
export type ComputedState = 'scheduled' | 'skipped'

/** Which recompute trigger fired. Only the caller knows which field it wrote. */
export type ReminderTrigger =
  /** due_date moved to a non-null date. Clearing it deletes the reminder by cascade (8.4). */
  | { readonly kind: 'due_date'; readonly taskId: string }
  | { readonly kind: 'due_time'; readonly taskId: string }
  /** The reminder's own value or mode changed. No caller uses it: reminder writes store planReminder's answer. */
  | { readonly kind: 'reminder'; readonly taskId: string }
  /** assignee_id moved, in either direction: this changes the zone. */
  | { readonly kind: 'assignee_id'; readonly taskId: string }
  /** users.timezone changed (login sync or PATCH /me) for this user. */
  | { readonly kind: 'assignee_timezone'; readonly userId: string }

export interface RecomputedReminder {
  readonly taskId: string
  readonly fireAt: Date
  readonly state: ComputedState
  readonly kind: LocalTimeKind
}

/** A scheduled row the timezone trigger could not compute (reported, not thrown). */
export interface UnresolvedReminder {
  readonly taskId: string
  readonly reason: string
}

export interface RecomputeOutcome {
  /** Empty when the task has no reminder. */
  readonly recomputed: readonly RecomputedReminder[]
  /** Always empty for task-scoped triggers, which throw instead. */
  readonly unresolved: readonly UnresolvedReminder[]
}

/** What a write path needs before inserting a reminder: fire_at is NOT NULL (4.8). */
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
  /** The reminder's created_by: the fallback zone source when the task is unassigned. */
  readonly createdBy: string
  /** The moment "already past" is measured against. */
  readonly at?: Date
}

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

// The shared recompute read; each caller appends its own WHERE predicate.
// to_char because the drivers disagree on DATE and TIME. Zone is COALESCE(assignee, creator) (8.6).
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
    // users.timezone is NOT NULL, so null means created_by points at no user.
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

/** The UPDATE both behaviors write; `scheduledOnly` decides whether the row must still be scheduled. */
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

/** 8.6's computation over one row's columns, plus the state its instant earns. */
function planFrom(source: ComputationSource, at: Date): ReminderPlan {
  if (source.dueDate === null) {
    // The 8.4 cascade deletes a reminder with its due date, so reaching here means it did not run.
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
  // Equality counts as past, matching the loop's poll of fire_at <= now().
  const future = resolved.instant.getTime() > at.getTime()
  return {
    fireAt: resolved.instant,
    state: future ? 'scheduled' : 'skipped',
    firedAt: future ? null : at,
    kind: resolved.kind,
  }
}

/**
 * The instant and state for a reminder about to be written (7.9 PUT, 7.6 create, 8.5 successor copy).
 * Write all three of fireAt, state and firedAt on insert and on conflict, or a fired row never fires again.
 * The caller must already have raised 7.9's 422s; this throws if they were missed.
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
    // users.timezone is NOT NULL, so null means created_by points at no user.
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
 * 8.6's recompute, inside the transaction that wrote the change, after the write.
 * Idempotent: a PATCH that moved several fields may call once.
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

/** Task-scoped triggers: one row, recomputed from any state, so a moved deadline gets a new delivery. */
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
 * The timezone trigger: every scheduled reminder on tasks assigned to this user.
 * The UPDATE repeats the scheduled predicate so a delivery landing in between wins.
 * Uncomputable rows are reported, not thrown, because this runs inside sign-in.
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
 * 8.5's reminder arm: the successor gets a fresh 8.6 instant and the state it earns.
 * Never write 'scheduled' flatly: a past instant would mail a reminder on the next tick.
 */
export async function copyReminderToSuccessor(
  tx: Executor,
  sourceTaskId: string,
  successorTaskId: string,
  at?: Date,
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
    at,
  })
  const firedAt = plan.firedAt === null ? null : plan.firedAt.toISOString()
  await tx.execute(
    sql`INSERT INTO reminders (task_id, offset_minutes, time_of_day, fire_at,
                               state, fired_at, created_by)
        VALUES (${successorTaskId}::uuid, ${integer(source.offset_minutes)},
                ${text(source.time_of_day)}::time,
                ${plan.fireAt.toISOString()}::timestamptz,
                ${plan.state}, ${firedAt}::timestamptz, ${createdBy}::uuid)`,
  )
  return plan
}

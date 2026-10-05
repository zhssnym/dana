/*
The TaskCard projection and the SQL fragments the section 6 queries share.
taskView in domain/tasks.ts is a second producer of the same shape; the shared
taskCard schema keeps them aligned. The scope predicates are written once
because 6.1's partition proof depends on the queries sharing them textually.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { LabelRef, TaskLabels } from '../../shared/labels.js'
import type { TaskCard } from '../../shared/tasks.js'
import { LIST_ROW_CAP } from '../../shared/views.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { joinVisibleFolder } from '../domain/folder-access.js'
import { taskLabelsFor } from '../domain/labels.js'
import { taskDependencyCountsFor } from '../domain/task-dependency-counts.js'
import type { TaskDependencyCounts } from '../domain/task-dependency-counts.js'

/** Exported so calendar ghosts read the same values the same way. */
export function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/*
Floating dates go through to_char: node-postgres parses a date into a JS Date,
which would serialize as an instant and add a timezone.
*/
export const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
export const START_TIME = sql`to_char(t.start_time, 'HH24:MI')`
export const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
export const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

/**
 * UTC at full microsecond precision. Keyset cursors need every digit, or rows
 * inside one millisecond are skipped or repeated at a page boundary.
 */
export function utcInstant(column: SQL): SQL {
  return sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

/** 7.0's wire format: millisecond ISO. */
function toIso(value: unknown): string {
  return new Date(String(value)).toISOString()
}

/** status_rank (section 6): pending 0, abandoned 1, completed 2. The only CASE for it. */
export function statusRank(status: SQL): SQL {
  return sql`CASE ${status} WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END`
}

export const STATUS_RANK = statusRank(sql`t.status`)

/** The scope Q2, Q3 and Q5 share; 6.1's proof needs it textually identical. */
export const OPEN_SCOPE = sql`t.status IN ('pending', 'abandoned')`

/** Scheduled: a Task with a Start Date or a Due Date (#216). */
export const SCHEDULED = sql`(t.start_date IS NOT NULL OR t.due_date IS NOT NULL)`

/** Anytime: written as NOT SCHEDULED so the partition cannot drift. */
export const ANYTIME = sql`NOT ${SCHEDULED}`

/**
 * Where a Scheduled row is placed: by Due Date, else Start Date. NULL exactly
 * when ANYTIME.
 */
export const SCHEDULE_DATE = sql`coalesce(t.due_date, t.start_date)`

/** When a Schedule begins: Start Date, else Due Date (#217). */
export const ACTIVATION_DATE = sql`coalesce(t.start_date, t.due_date)`

/**
 * Where a row stands against the viewer's today. The client has its own copies
 * (`rungForTask` and others); guard-rung-parity.test.ts keeps them in step.
 * A null date fails its comparison and falls through, so the order matters.
 */
export function rungOf(todayLocal: string): SQL {
  const day = sql`${todayLocal}::date`
  return sql`CASE
      WHEN t.due_date < ${day} THEN 'overdue'
      WHEN t.status = 'pending' AND t.start_date <= ${day} THEN 'started'
      WHEN ${SCHEDULE_DATE} IS NULL THEN 'undated'
      WHEN ${SCHEDULE_DATE} < ${day} THEN 'overdue'
      WHEN ${SCHEDULE_DATE} = ${day} THEN 'today'
      ELSE 'future' END`
}

/*
TaskCard's columns, matching what taskView produces. `pulled` is the viewer's
own My Day entry. A null creator is 8.10's scrub (the join's deleted_at clause).
*/
const CARD_COLUMNS = sql`
    t.id, t.title, t.status, t.important,
    ${START_DATE} AS start_date, ${START_TIME} AS start_time,
    ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
    /* A tab is labelled with its project (step 7). */
    f.id AS folder_id,
    CASE WHEN f.tab_position IS NOT NULL AND f.project_id <> f.id
                 THEN (SELECT pr.name FROM folders pr WHERE pr.id = f.project_id)
                 ELSE f.name END AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
    (SELECT coalesce(json_agg(json_build_object(
              'id', au.id, 'display_name', au.display_name,
              'avatar_url', au.avatar_url) ORDER BY ids.ord), '[]'::json)
       FROM unnest(t.assignee_ids) WITH ORDINALITY AS ids(user_id, ord)
       JOIN users au ON au.id = ids.user_id) AS assignees,
    (t.recurrence_rule IS NOT NULL) AS is_recurring, t.recurrence_rule,
    c.steps_total, c.steps_done,
    (e.task_id IS NOT NULL) AS pulled,
    (SELECT i.email FROM invites i
      WHERE i.task_id = t.id AND i.status = 'pending'
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1) AS pending_invite_email,
    t.section_block_id,
    cb.id AS creator_id, cb.display_name AS creator_display_name,
    cb.avatar_url AS creator_avatar_url,
    t.created_at, t.updated_at`

/**
 * ACCESSIBLE(V) as a FROM clause, so a query cannot forget the 10.2 scope.
 * Separate from cardSource for queries that need no card joins.
 */
export function accessibleTasks(viewerId: string): SQL {
  // The folders join is part of the scope: tasks in trashed folders are excluded.
  return sql`
    FROM tasks t
    ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
     AND t.deleted_at IS NULL`
}

/**
 * The FROM clause of every card query. My Day is joined (not EXISTS) because it
 * supplies both `pulled` and Q1's added_on.
 */
export function cardSource(viewerId: string): SQL {
  // accessibleTasks already joins folders as `f`.
  return sql`${accessibleTasks(viewerId)}
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = ${viewerId}
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.checked THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM page_blocks st WHERE st.task_id = t.id AND st.kind = 'checklist'
    ) c ON true`
}

function cardFromRow(
  row: Record<string, unknown>,
  labels: TaskLabels,
  counts: TaskDependencyCounts,
): TaskCard {
  return {
    id: String(row.id),
    title: String(row.title),
    status: String(row.status) as TaskCard['status'],
    important: row.important === true,
    start_date: nullableString(row.start_date),
    start_time: nullableString(row.start_time),
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
    assignees: Array.isArray(row.assignees) ? row.assignees as TaskCard['assignees'] : [],
    is_recurring: row.is_recurring === true,
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
    labels,
    blocked_by_count: counts.blocked_by_count,
    blocks_count: counts.blocks_count,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  }
}

/** A card and its raw row, for columns the card does not carry. */
export interface CardRow {
  card: TaskCard
  raw: Record<string, unknown>
}

export interface CardQuery {
  viewerId: string
  /** The predicate over `t`; the folder scope comes from the join. */
  where: SQL
  order: SQL
  /** Absent means no limit; only the calendar wants that. */
  limit?: number
  extra?: SQL
}

/**
 * Every 7.10 list reads rows through here. Labels and dependency counts are
 * fetched in one batch each, not joined, so the LIMIT counts tasks rather than
 * label rows. The statement count must not grow with the row count.
 */
export async function readCards(
  executor: Executor,
  query: CardQuery,
): Promise<CardRow[]> {
  const extra = query.extra === undefined ? sql`` : sql`, ${query.extra}`
  const limit = query.limit === undefined ? sql`` : sql` LIMIT ${query.limit}`
  const found = await rowsOf(
    executor,
    sql`SELECT ${CARD_COLUMNS}${extra}
        ${cardSource(query.viewerId)}
        WHERE ${query.where}
        ORDER BY ${query.order}${limit}`,
  )
  const ids = found.map((row) => String(row.id))
  const labels = await taskLabelsFor(executor, query.viewerId, ids)
  const counts = await taskDependencyCountsFor(executor, query.viewerId, ids)
  return found.map((row) => ({
    card: cardFromRow(
      row,
      labels.get(String(row.id)) ?? EMPTY_LABELS,
      counts.get(String(row.id)) ?? NO_DEPENDENCIES,
    ),
    raw: row,
  }))
}

/**
 * Defaults for a row the batch missed. Frozen so a caller that mutates one
 * card's labels cannot leak them onto every other card.
 */
const noLabels = (): LabelRef[] => Object.freeze([] as LabelRef[]) as LabelRef[]
const NO_DEPENDENCIES: TaskDependencyCounts = Object.freeze({
  blocked_by_count: 0,
  blocks_count: 0,
})
const EMPTY_LABELS: TaskLabels = Object.freeze({
  personal: noLabels(),
  folder: noLabels(),
})

/** One row more than the cap, so a full section proves the response was truncated. */
export const CAP_PROBE = LIST_ROW_CAP + 1

/** Keyset page sizes; pages are read one over to know whether to offer a cursor. */
export const DONE_PAGE_SIZE = 50
export const SEARCH_PAGE_SIZE = 20

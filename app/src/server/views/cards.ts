/*
The one row projection every 7.10 body is made of, and the fragments the
eight queries of section 6 share.

taskView in domain/tasks.ts produces a card's fields one task at a time, and
no list endpoint can call it per row, so this file is necessarily a second
producer of one shape. That is why the projection is here once rather than in
each query file: two producers is an accepted cost, three would be drift. The
guard against drift is the shared taskCard schema.

Three fragments live here for a sharper reason than reuse.

- **The scope predicate is written once.** 6.1's proof of the partition
  depends on Q2, Q3 and Q5 sharing the scope textually, and no test checks
  it: this fragment is what holds it. A copy per query is a copy that can drift, so
  OPEN_SCOPE below is the sentence and the three queries add their own
  conjunct to it. Since issue #216 the two conjuncts are written here as
  well, SCHEDULED and ANYTIME, the second as the negation of the first: what
  Scheduled means stopped being a single column's nullness that a reader can
  check by eye, so the proof is carried by a NOT rather than by two sentences
  agreeing.
- **The membership join is the 10.2 chokepoint**, and it is part of the FROM
  clause every query in this package builds on, so no query can be written
  here that forgets it.
- **status_rank is one CASE**, over all three statuses, as section 6's
  preamble defines it.

Everything else about a query, its predicate and its order, belongs to the
query, because those are the sentences a reviewer compares to section 6 by
eye (11.5).
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { LabelRef, TaskLabels } from '../../shared/labels.js'
import type { TaskCard } from '../../shared/tasks.js'
import { LIST_ROW_CAP } from '../../shared/views.js'
import { rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { taskLabelsFor } from '../domain/labels.js'
import { taskDependencyCountsFor } from '../domain/task-dependency-counts.js'
import type { TaskDependencyCounts } from '../domain/task-dependency-counts.js'

/* ------------------------------------------------------------------ *
 * Serialization
 * ------------------------------------------------------------------ */

/** A nullable text column as 7.0 puts it on the wire. Exported because Q3C's
 * ghosts carry three of the same values a card carries and must read them the
 * same way; a second copy is a second answer for an empty string. */
export function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/*
Floating dates and times are read through to_char rather than through the
driver, for the reason domain/tasks.ts records: PGlite renders a date as a
string while node-postgres parses OID 1082 into a JS Date, which would
serialize as an instant and reintroduce the timezone 4.11's floating format
exists to remove.
*/
export const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
export const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
export const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

/**
 * An instant rendered in UTC at the precision Postgres stores it, which is
 * microseconds.
 *
 * Two uses, and both need every digit. A keyset cursor names a position by
 * the value of the column it sorts on, so a cursor built from a
 * millisecond-truncated instant resumes at a rounded position and re-emits or
 * skips the rows inside that millisecond, on a page boundary, which is the
 * least observable place a lost row can hide. And the day a completion falls
 * on is read from this string rather than from the driver's own value, so
 * both backends hand the same instant to the zone math.
 */
export function utcInstant(column: SQL): SQL {
  return sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

/** The 7.0 wire format for a timestamp, millisecond ISO, which is what
 * TaskCard's created_at and updated_at carry. */
function toIso(value: unknown): string {
  return new Date(String(value)).toISOString()
}

/* ------------------------------------------------------------------ *
 * The shared predicates
 * ------------------------------------------------------------------ */

/**
 * status_rank, section 6's preamble: pending = 0, abandoned = 1,
 * completed = 2.
 *
 * One definition serves every query. Queries whose predicate admits only the open statuses never reach it, and
 * this expression is still the one they use, because a second CASE with two
 * arms is a second definition.
 */
export function statusRank(status: SQL): SQL {
  return sql`CASE ${status} WHEN 'pending' THEN 0 WHEN 'abandoned' THEN 1 ELSE 2 END`
}

/** status_rank over the row under consideration. */
export const STATUS_RANK = statusRank(sql`t.status`)

/**
 * The scope predicate Q2, Q3 and Q5 share, minus the folder scope, which is
 * the membership join of CARD_SOURCE below.
 *
 * 6.1: "The proof depends only on the three scopes staying textually
 * identical". They are one sentence here, so they cannot stop being.
 */
export const OPEN_SCOPE = sql`t.status IN ('pending', 'abandoned')`

/* ------------------------------------------------------------------ *
 * The Schedule, as the three sentences section 6 reads it by
 * ------------------------------------------------------------------ */

/**
 * Scheduled membership since issue #216: "a Task belongs to Scheduled when it
 * has either a Start Date or a Due Date."
 *
 * It was `t.due_date IS NOT NULL` until 2026-09-20, which is what Scheduled
 * meant while a due date was the only date a task had.
 */
export const SCHEDULED = sql`(t.start_date IS NOT NULL OR t.due_date IS NOT NULL)`

/**
 * Anytime: "only when it has neither."
 *
 * Written as the negation of the sentence above rather than as
 * `start_date IS NULL AND due_date IS NULL`, and that is the whole point of
 * it. 6.1's proof of the partition used to rest on two conjuncts being read
 * as exact complements of one another by a person; here it rests on one
 * sentence and a NOT, so the two cannot drift apart. `IS NOT NULL` yields a
 * real boolean for every row, never UNKNOWN, so the negation is total and
 * this is not the three-valued trap docs/troubleshooting.md records about
 * CHECKs over nullable columns.
 */
export const ANYTIME = sql`NOT ${SCHEDULED}`

/**
 * Where a Scheduled row is placed: "if Due Date exists, place/group/order the
 * Task by Due Date; otherwise, for a Start-only Task, place/group/order it by
 * Start Date" (issue #216).
 *
 * `SCHEDULE_DATE IS NULL` is exactly ANYTIME, which is what lets Q4 split its
 * two blocks on this one expression instead of on a second spelling of the
 * membership sentence.
 *
 * Under `tasks_start_before_due_check` this is `greatest(start_date,
 * due_date)`, that function ignoring nulls; it is spelled as the coalesce
 * because the coalesce is section 6's own sentence and the equality is a
 * consequence of a constraint rather than the rule (11.5).
 */
export const SCHEDULE_DATE = sql`coalesce(t.due_date, t.start_date)`

/**
 * When a Schedule begins: the Start Date where there is one, and the Due Date
 * otherwise (issue #217).
 *
 * The opposite coalesce from SCHEDULE_DATE, and deliberately: a Schedule is a
 * span with two ends, Today asks when it opened and the Scheduled list asks
 * when it closes. Under the same CHECK this is `least(start_date, due_date)`,
 * so for a task carrying both the two expressions are the two ends of its own
 * span and neither is ever outside it.
 */
export const ACTIVATION_DATE = sql`coalesce(t.start_date, t.due_date)`

/* ------------------------------------------------------------------ *
 * The row
 * ------------------------------------------------------------------ */

/*
TaskCard's fields, each from its owning section, and identical in meaning to
the ones taskView produces one at a time: the folder chip is 7.0's three
fields, the assignee is the person shape 7.4's members element carries,
is_recurring reports the rule the row holds, the two step counts are counts
of 4.6 rows, pulled is the viewer's own My Day entry so one row answers it
differently for two members, and pending_invite_email comes from
invites.task_id, whose rows the invites module writes and this one only
reads.

section_block_id is read
straight off 4.5's column, which is what makes the field the task's rather
than the endpoint's: this projection serves the folder read and all eight
section 6 queries alike, so a task placed under a section names it wherever
it is read, and a task under none is null everywhere. The creator is the
sixth join of cardSource below and is the person shape assignee carries; its
one null is 8.10's scrub, which the join's own deleted_at clause is, and
never a missing column.
*/
const CARD_COLUMNS = sql`
    t.id, t.title, t.status, t.important,
    ${START_DATE} AS start_date,
    ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
    f.id AS folder_id, f.name AS folder_name,
    f.is_default AS folder_is_default,
    a.id AS assignee_id, a.display_name AS assignee_display_name,
    a.avatar_url AS assignee_avatar_url,
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
 * ACCESSIBLE(V) as a FROM clause, and the 10.2 chokepoint of this package.
 *
 * It is not a condition a query adds but the table it reads through, so a
 * query written here cannot forget it. domain/folders.ts's accessOf answers
 * the same question for one folder, and the folder page asks it there.
 *
 * Separate from cardSource below because Q3C's projection fetch reads the
 * same accessible rows and needs none of the card's five joins: it wants six
 * columns of `tasks` for 8.5 to evaluate, and paying for a lateral step count
 * per series to throw it away would be a cost with no reader. Written once so
 * the second query cannot scope itself differently from the first.
 */
export function accessibleTasks(viewerId: string): SQL {
  // The folders join is part of the scope, not merely a name source: section 6's implicit guard excludes trashed rows from every
  // query, and a task in a trashed folder is unreachable while its folder
  // is (4.5). Written here once so no view can scope itself differently.
  return sql`
    FROM tasks t
    JOIN folder_members m
      ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
    JOIN folders f
      ON f.id = t.folder_id
     AND f.deleted_at IS NULL
     AND t.deleted_at IS NULL`
}

/**
 * The FROM clause of every card query in this package, the chokepoint above
 * plus the five joins a 7.0 card is assembled from.
 *
 * The My Day entry is joined rather than probed by EXISTS because two things
 * need it: pulled, which 7.0 makes a field of the card, and added_on, which
 * 8.2 makes half of Q1's qualify_date. One join answers both, and INV-12's
 * primary key makes it at most one row.
 *
 * The creator's join is LEFT for one reason only: 4.5 makes
 * created_by NOT NULL, so the row it points at always exists, and the null
 * this join can produce is 8.10's scrub, spelled here as the deleted_at
 * clause rather than as a case in the projection. It is a second join on the
 * users table's primary key per row, which is the same cost the assignee
 * already pays.
 */
export function cardSource(viewerId: string): SQL {
  // accessibleTasks carries the folders join (alias f) since the guard
  // moved into the scope; a second join here would read the same row twice.
  return sql`${accessibleTasks(viewerId)}
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users cb ON cb.id = t.created_by AND cb.deleted_at IS NULL
    LEFT JOIN my_day_entries e
      ON e.task_id = t.id AND e.user_id = ${viewerId}
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS steps_total,
             coalesce(sum(CASE WHEN st.done THEN 1 ELSE 0 END), 0)::int
               AS steps_done
        FROM steps st WHERE st.task_id = t.id
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

/** A card and the row it was read from, so a query that needs a column the
 * card does not carry (Q1's qualify date, a keyset cursor's own value) reads
 * it without a second trip. */
export interface CardRow {
  card: TaskCard
  raw: Record<string, unknown>
}

export interface CardQuery {
  viewerId: string
  /** The predicate, over `t`, with the folder scope already supplied by the
   * membership join. */
  where: SQL
  /** The ORDER BY of the section 6 query, written so it can be compared to
   * the spec text by eye (11.5). */
  order: SQL
  /** Absent means every matching row, which only the calendar wants: it is
   * bounded by its 62 days rather than by a row count. */
  limit?: number
  /** Columns beyond the card, read back through CardRow.raw. */
  extra?: SQL
}

/**
 * One statement, one shape: every list endpoint of 7.10 reads its rows
 * through here, so the projection cannot vary between them.
 *
 * **Two statements since issue #226, three since issue #225, and the count
 * never moves with the row count.** The Label
 * projection cannot ride the card query: a Task carries many Labels of two
 * kinds, so joining them in would multiply the rows the LIMIT above is
 * counting, and the cap would then truncate a page by how many Labels its
 * tasks happen to wear. So the ids the first statement produced are handed to
 * `taskLabelsFor` in one batch and the projections are attached in memory.
 *
 * That is the seam #226 asks for by name — "avoid N+1 reads across list/view
 * endpoints, extend the existing batch assembly so all Task lists remain
 * bounded-query operations" — and it is here rather than in each of the eight
 * section 6 queries because this is the one place all of them pass through.
 * The statement count must not move with the row count.
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
  /* Issue #225's row counts, the third statement and the same seam: one
     batch keyed by the page's ids, attached in memory. */
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
 * The projection a row gets when the batch has nothing for it, which cannot
 * happen — every id handed over comes back with an entry — and is spelled
 * rather than asserted because a card with no `labels` key would fail the
 * shared schema at the client rather than here.
 *
 * **Frozen, object and arrays, because one shared mutable default handed to
 * every card that misses the batch is a defect waiting for the day the
 * comment above stops being true.** The comment is the only thing keeping
 * these arrays empty; a caller that pushed into a card's `labels.folder`
 * would be writing into the default that every other missing row is about to
 * be given. Freezing makes that a TypeError at the write rather than a label
 * appearing on unrelated cards.
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

/* ------------------------------------------------------------------ *
 * The caps
 * ------------------------------------------------------------------ */

/**
 * One row more than a response may carry.
 *
 * Every capped section is read at this limit, so a section that comes back
 * full is known to have had something behind it without a second count. The
 * allocation itself is takeCapped in src/shared/views.ts, and the extra row
 * is what makes its truncated flag true in that case: a section holding
 * LIST_ROW_CAP + 1 rows cannot fit inside a cap of LIST_ROW_CAP however the
 * sections before it were filled.
 */
export const CAP_PROBE = LIST_ROW_CAP + 1

/** The page sizes of the two keyset orders, and the same reason for the
 * extra row: a page read one over its size knows whether to offer a cursor
 * without counting the rest of the list. */
export const DONE_PAGE_SIZE = 50
export const SEARCH_PAGE_SIZE = 20

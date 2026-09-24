/*
The 7.22 data export: one person's own Dana data assembled into the single
JSON document `src/shared/export.ts` describes.

**Every statement here is scoped to the viewer in its own FROM clause**,
which is 10.2's structural half and is the whole of this module's
authorization. The request carries no id — no path parameter, no query
string, no body — so there is nothing for a caller to substitute and no
`accessOf(...)` gate to write: the only identifier that reaches SQL is the
session's user id. That is a deliberate property of the endpoint rather than
an accident of its shape, and it is why a read this wide can be safe. **A
statement added here must keep it.** The test to apply is 10.2's own: if the
join that scopes it were deleted, would it return somebody else's rows, or
none?

**The document is built whole in memory and sent whole.** 10.3's 1000-row cap
is applied per collection: in SQL where the collection is nested, as a window
function per parent, and as a LIMIT where it is flat. **And every child
statement is handed the ids of the parents that survived their own cap**, so
what is fetched is what is sent. That last clause is the correction of
2026-09-04: the first version of this module scoped each child by repeating
its parent's predicate, which is sound but reads every task in every owned
folder and every step of every one of them, then discards whatever the caps
cut. A collection that hit a cap is named in `truncated`, unchanged.

**The honest ceiling, because "bounded" above is per collection and not per
document.** Nothing here bounds the whole answer: the caps multiply, and an
account sitting at all of them at once — 10.3's 200 custom folders, a thousand
tasks in each, ten thousand characters of notes on every task — would build
something on the order of a gigabyte of JSON inside the single production
process (11.1), where it is the memory every other request is also using. No
real account is anywhere near that, and the caps make it a ceiling rather than
a surprise, but a ceiling is not a bound. **If an account ever approaches it
the answer is a streamed or paged export**, which is a format change and a
`version` bump rather than an adjustment here. 7.22 carries the same sentence,
so the decision is not buried in a source file.

**No statement below reads an email address but the viewer's own.** Other
people enter the document as `display_name` and nothing else: members of a
folder, a task's creator, a task's assignee. `invites` and `connections` are
not read at all, which is the same rule stated as an absence.

**No statement is per row.** Tasks, steps, reminders, blocks, members and
comment attachments each arrive as one statement across every parent, grouped
in memory afterwards, rather than as one statement per folder or per comment.
The parent ids ride as **one** bind parameter, a jsonb array unnested in the
statement, rather than as an IN list: a list would put up to two hundred
thousand parameters on the wire for an account at 10.3's folder cap, which is
past what the protocol carries at all. `idSet` in `server/database.ts` is that
spelling, and it
was measured on both legs rather than assumed — drizzle expands a JavaScript
array into `($1, $2, …)` rather than binding one array, so `= ANY(${ids})`
does not do what it reads as and fails on both backends with "cannot cast type
record to uuid[]".

**The ids are handed over and the scope predicate stays anyway.** Every child
statement below still carries the join or the WHERE clause that scopes it to
the viewer, even though the ids it is given already came from a scoped read.
That is 10.2's rule applied to a statement whose caller happens to be
trustworthy: delete the id list and the statement returns the viewer's rows,
delete the scope and it returns nothing. Neither alone is the authorization.
*/
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import {
  EXPORT_FORMAT,
  EXPORT_ROW_CAP,
  EXPORT_VERSION,
} from '../../shared/export.js'
import type {
  ExportBlock,
  ExportCollection,
  ExportComment,
  ExportDocument,
  ExportFacet,
  ExportFile,
  ExportFolder,
  ExportForeignTask,
  ExportLabel,
  ExportReminder,
  ExportShelf,
  ExportStep,
  ExportTask,
} from '../../shared/export.js'
import type { FacetKind } from '../../shared/facets.js'
import { idSet, rowsOf } from '../database.js'
import { listViews, readBundle } from './bundle.js'
import { resolveFacetName } from './facets.js'
import { listPlaceCovers } from './covers.js'
import { listPlaceDescriptions } from './place-descriptions.js'

/* ------------------------------------------------------------------ *
 * Serialization, the conventions the rest of this directory keeps
 * ------------------------------------------------------------------ */

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableIso(value: unknown): string | null {
  return value === null || value === undefined ? null : toIso(value)
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function nullableInt(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined
}

/*
Floating dates and times ride to_char, never the driver, for the reason
`domain/tasks.ts` records at its own copy: node-postgres parses OID 1082 into
a JS Date while PGlite hands back a string, so only a SQL cast makes the two
legs put the same bytes on the wire. 4.11 fixes both formats.
*/
const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

/* ------------------------------------------------------------------ *
 * The cap (10.3), applied rather than announced
 * ------------------------------------------------------------------ */

/**
 * One more row than the cap, so a list that reached it is distinguishable
 * from one that exactly filled it. The extra row is dropped and the
 * collection is named in `truncated`.
 */
const FETCH = EXPORT_ROW_CAP + 1

/** Collects the collections that were cut, so the document can say so. */
class Truncation {
  private readonly cut = new Set<ExportCollection>()

  /** Cuts one list to the cap, recording the collection if it had to. */
  apply<T>(collection: ExportCollection, list: T[]): T[] {
    if (list.length <= EXPORT_ROW_CAP) return list
    this.cut.add(collection)
    return list.slice(0, EXPORT_ROW_CAP)
  }

  /** In `EXPORT_COLLECTIONS` order would be prettier and would cost a second
   * list to keep in step; insertion order is stable enough for a field whose
   * only job is to name what was cut. */
  names(): ExportCollection[] {
    return [...this.cut]
  }
}

/**
 * A per-parent cap in SQL: at most `FETCH` children of any one parent are
 * materialized, whatever the account holds. `columns` is the select list,
 * `source` is the FROM clause and its joins, and the scope lives in `source`
 * like every other statement here.
 */
function cappedPerParent(
  columns: SQL,
  source: SQL,
  partition: SQL,
  order: SQL,
): SQL {
  return sql`SELECT * FROM (
    SELECT ${columns},
           row_number() OVER (PARTITION BY ${partition} ORDER BY ${order})
             AS export_rn
    ${source}
  ) capped WHERE capped.export_rn <= ${FETCH}`
}

/** Groups rows under the value of one column, preserving row order. */
function groupBy(
  rows: Record<string, unknown>[],
  key: string,
): Map<string, Record<string, unknown>[]> {
  const grouped = new Map<string, Record<string, unknown>[]>()
  for (const row of rows) {
    const at = String(row[key])
    const bucket = grouped.get(at)
    if (bucket === undefined) grouped.set(at, [row])
    else bucket.push(row)
  }
  return grouped
}

/* ------------------------------------------------------------------ *
 * Row shapes
 * ------------------------------------------------------------------ */

/** 7.15's authenticated serving path, the only way to read bytes in Dana. */
function fileUrl(id: string): string {
  return `/api/v1/files/${id}`
}

function fileFrom(row: Record<string, unknown>): ExportFile {
  const id = String(row.id)
  return {
    id,
    kind: String(row.kind),
    name: String(row.name),
    mime: String(row.mime),
    bytes: Number(row.bytes),
    width: nullableInt(row.width),
    height: nullableInt(row.height),
    duration_ms: nullableInt(row.duration_ms),
    created_at: toIso(row.created_at),
    url: fileUrl(id),
  }
}

function stepFrom(row: Record<string, unknown>): ExportStep {
  return {
    id: String(row.id),
    title: String(row.title),
    done: row.done === true,
    position: Number(row.position),
    created_at: toIso(row.created_at),
  }
}

function reminderFrom(row: Record<string, unknown>): ExportReminder {
  return {
    offset_minutes: nullableInt(row.offset_minutes),
    time_of_day: nullableString(row.reminder_time_of_day),
    fire_at: toIso(row.fire_at),
    state: String(row.reminder_state),
    fired_at: nullableIso(row.fired_at),
  }
}

function blockFrom(row: Record<string, unknown>): ExportBlock {
  return {
    rich_content:(row.rich_content??null) as ExportBlock['rich_content'],
    section_block_id:nullableString(row.section_block_id),
    list_parent_block_id:nullableString(row.list_parent_block_id),
    checked:row.checked===null||row.checked===undefined?null:Boolean(row.checked),
    page_position:nullableString(row.page_position),
    id: String(row.id),
    kind: String(row.kind),
    position: Number(row.position),
    text: nullableString(row.text),
    file_id: nullableString(row.file_id),
    ref_folder_id: nullableString(row.ref_folder_id),
    width_pct: nullableInt(row.width_pct),
    updated_at: toIso(row.updated_at),
  }
}

function labelFrom(row: Record<string, unknown>): ExportLabel {
  return {
    id: String(row.id),
    scope: String(row.scope),
    name: String(row.name),
    color: String(row.color),
    description: nullableString(row.description),
    archived: present(row.archived_at),
    folder_id: nullableString(row.folder_id),
  }
}

/** The definition columns every Label statement below selects, so the three
 * of them cannot drift into three different documents. */
const LABEL_COLUMNS = sql`l.id, l.scope, l.name, l.color, l.description,
  l.archived_at, l.folder_id`

/** Active before archived, then lower(name), then id — the order #208 fixes
 * for every Label list in the product, applied here so that two exports of an
 * unchanged account are the same bytes. */
const LABEL_ORDER = sql`(l.archived_at IS NOT NULL) ASC, lower(l.name) ASC,
  l.id ASC`

function taskFrom(
  row: Record<string, unknown>,
  steps: ExportStep[],
  labels: { personal: string[]; folder: string[] },
  document: ExportBlock[],
): ExportTask {
  return {
    section_block_id:nullableString(row.section_block_id),
    page_position:nullableString(row.page_position),
    id: String(row.id),
    title: String(row.title),
    notes: nullableString(row.notes),
    status: String(row.status),
    important: row.important === true,
    start_date: nullableString(row.start_date),
    due_date: nullableString(row.due_date),
    due_time: nullableString(row.due_time),
    recurrence_rule: nullableString(row.recurrence_rule),
    series_id: nullableString(row.series_id),
    /* Null where the creator's account was deleted: 8.10 scrubs the name and
       every card reads null. The column still points at the
       scrubbed row, which is not this document's business. */
    created_by: nullableString(row.creator_display_name),
    assignee: nullableString(row.assignee_display_name),
    completed_at: nullableIso(row.completed_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    trashed: present(row.deleted_at),
    steps,
    reminder: present(row.fire_at) ? reminderFrom(row) : null,
    personal_label_ids: labels.personal,
    folder_label_ids: labels.folder,
    document,
  }
}

/*
The columns every exported task carries, in both places tasks appear. The
reminder is a LEFT JOIN of 4.8's one row per task, projected as both its
columns with exactly one non-null (7.0's TaskDetail rule); `state` and
`time_of_day` are aliased because a reader of `taskFrom` should not have to
work out which table a bare name came from.
*/
const TASK_COLUMNS = sql`t.id, t.section_block_id, t.page_position, t.title, t.notes, t.status, t.important,
  ${START_DATE} AS start_date,
  ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
  t.recurrence_rule, t.series_id, t.completed_at, t.created_at, t.updated_at,
  t.deleted_at, t.folder_id,
  cb.display_name AS creator_display_name,
  asg.display_name AS assignee_display_name,
  r.offset_minutes, to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day,
  r.fire_at, r.state AS reminder_state, r.fired_at`

/** The creator join carries `deleted_at IS NULL` rather than the projection
 * carrying a case, which is `taskView`'s own arrangement: 4.5 makes
 * `created_by` NOT NULL, so the LEFT is for the scrub and nothing else. */
const TASK_JOINS = sql`LEFT JOIN users cb
    ON cb.id = t.created_by AND cb.deleted_at IS NULL
  LEFT JOIN users asg ON asg.id = t.assignee_id
  LEFT JOIN reminders r ON r.task_id = t.id`

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

/**
 * Assembles the whole export for one viewer, or null when no live account
 * holds that id — which the route answers 401, a session having outlived the
 * person it spoke for.
 */
export async function exportForViewer(
  db: Db,
  viewerId: string,
): Promise<ExportDocument | null> {
  const truncation = new Truncation()

  const accountRows = await rowsOf(
    db,
    sql`SELECT id, email, display_name, avatar_url, timezone, created_at
        FROM users
        WHERE id = ${viewerId} AND deleted_at IS NULL`,
  )
  const accountRow = accountRows[0]
  if (accountRow === undefined) return null

  /* ---------------------------------------------------------------- *
   * Settings (4.10), the two per-person page tables (4.20, 4.22), and
   * the saved views (4.19). Every one of these already exists as a
   * viewer-scoped domain read, so this calls them rather than writing a
   * fifth and sixth copy of their SQL.
   * ---------------------------------------------------------------- */

  const bundle = await readBundle(db, viewerId)
  const flagRows = await rowsOf(
    db,
    sql`SELECT show_important, show_all, show_done
        FROM user_settings WHERE user_id = ${viewerId}`,
  )
  const flags = flagRows[0] ?? {}
  const covers = await listPlaceCovers(db, viewerId)
  const descriptions = await listPlaceDescriptions(db, viewerId)
  const views = truncation.apply('views', await listViews(db, viewerId))

  /* ---------------------------------------------------------------- *
   * Owned folders and everything hanging off them.
   *
   * `owner_id = viewer` is the scope on all four statements, written into
   * each FROM clause rather than resolved once and passed down: a statement
   * that lost it returns nothing rather than another person's rows. The
   * three child statements are additionally restricted to the folder ids
   * that survived the folder cap, so none of them reads a row the document
   * is going to throw away.
   *
   * Trashed folders are carried with their flag. 7.13 has not deleted them
   * yet, so an export that dropped them would be wrong on the day their
   * owner restores one.
   * ---------------------------------------------------------------- */

  const folderRows = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.is_default, f.icon, f.color, f.description,
               f.cover_file_id, f.cover_preset, f.cover_focal_y,
               f.created_at, f.deleted_at, f.parent_folder_id,
               m.shelf_name AS my_shelf, m.color AS my_color
        FROM folders f
        LEFT JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = ${viewerId}
        WHERE f.owner_id = ${viewerId}
        ORDER BY f.created_at ASC, f.id ASC
        LIMIT ${FETCH}`,
  )
  const folders = truncation.apply('folders', folderRows)
  const folderIds = folders.map((row) => String(row.id))

  const memberRows = await rowsOf(
    db,
    cappedPerParent(
      sql`fm.folder_id, u.display_name`,
      sql`FROM folder_members fm
          JOIN folders f ON f.id = fm.folder_id AND f.owner_id = ${viewerId}
          JOIN users u ON u.id = fm.user_id
          WHERE fm.folder_id IN ${idSet(folderIds)}`,
      sql`fm.folder_id`,
      sql`fm.created_at ASC, fm.user_id ASC`,
    ),
  )

  const folderTaskRows = await rowsOf(
    db,
    cappedPerParent(
      TASK_COLUMNS,
      sql`FROM tasks t
          JOIN folders f ON f.id = t.folder_id AND f.owner_id = ${viewerId}
          ${TASK_JOINS}
          WHERE t.folder_id IN ${idSet(folderIds)}`,
      sql`t.folder_id`,
      sql`t.created_at ASC, t.id ASC`,
    ),
  )

  const folderBlockRows = await rowsOf(
    db,
    cappedPerParent(
      sql`b.id, b.folder_id, b.kind, b.position, b.text, b.file_id,
          b.ref_folder_id, b.width_pct, b.updated_at, b.rich_content, b.section_block_id,
          b.list_parent_block_id, b.checked, b.page_position`,
      sql`FROM page_blocks b
          JOIN folders f ON f.id = b.folder_id AND f.owner_id = ${viewerId}
          WHERE b.folder_id IN ${idSet(folderIds)}`,
      sql`b.folder_id`,
      sql`b.position ASC, b.id ASC`,
    ),
  )

  /* The per-folder task cap is taken here rather than during assembly,
     because the step statement below is handed these ids and must not read
     the steps of a task the document has already cut. */
  const tasksByFolder = new Map<string, Record<string, unknown>[]>()
  for (const [id, list] of groupBy(folderTaskRows, 'folder_id')) {
    tasksByFolder.set(id, truncation.apply('folders.tasks', list))
  }

  /* ---------------------------------------------------------------- *
   * Tasks in folders the person belongs to and does not own, kept only
   * where the task is still their own work: they wrote it, or it is theirs
   * to do. Everything else in such a folder is the owner's, and their
   * export is where it belongs.
   *
   * A trashed *folder* here is its owner's trash rather than the viewer's,
   * so those are out; a trashed *task* is carried with its flag, as above.
   * ---------------------------------------------------------------- */

  const foreignTaskRows = await rowsOf(
    db,
    sql`SELECT ${TASK_COLUMNS}, f.name AS folder_name
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
        ${TASK_JOINS}
        WHERE f.owner_id <> ${viewerId}
          AND (t.created_by = ${viewerId} OR t.assignee_id = ${viewerId})
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT ${FETCH}`,
  )
  const foreignTasks = truncation.apply('tasks_elsewhere', foreignTaskRows)

  /*
  Steps for both task sets in one statement, restricted to the tasks that
  actually reached the document.

  **The membership join is LEFT here and it used to be INNER, which was a
  latent way to lose every step of an owned folder (corrected 2026-09-04).**
  The two arms of the scope are not the same shape: a folder the viewer owns
  is theirs by `folders.owner_id` and by nothing else, while a folder they
  merely belong to is theirs by `folder_members`. An INNER join asked for a
  membership row on both arms, so an owner whose own membership row had gone
  missing would have exported their folders, their tasks and *no steps at
  all*, silently and with nothing in the document saying so. INV-2 makes that
  row exist, which is exactly why the bug would have been invisible until the
  day it did not. `folderRows` above already has this shape; the two now
  match.
  */
  const cappedTaskIds = [
    ...[...tasksByFolder.values()].flat().map((row) => String(row.id)),
    ...foreignTasks.map((row) => String(row.id)),
  ]
  const stepRows = await rowsOf(
    db,
    cappedPerParent(
      sql`s.id, s.task_id, s.title, s.done, s.position, s.created_at`,
      sql`FROM steps s
          JOIN tasks t ON t.id = s.task_id
          JOIN folders f ON f.id = t.folder_id
          LEFT JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          WHERE s.task_id IN ${idSet(cappedTaskIds)}
            AND (f.owner_id = ${viewerId}
                 OR (m.user_id IS NOT NULL
                     AND f.deleted_at IS NULL
                     AND (t.created_by = ${viewerId}
                          OR t.assignee_id = ${viewerId})))`,
      sql`s.task_id`,
      sql`s.position ASC, s.id ASC`,
    ),
  )
  const stepsByTask = groupBy(stepRows, 'task_id')

  /* #221: each exported Task's document, scoped exactly as its steps are,
     over the same capped ids. A document holds at most 500 blocks (7.16), so
     the per-parent cap never cuts one. */
  const taskBlockRows = await rowsOf(
    db,
    cappedPerParent(
      sql`b.id, b.task_id, b.kind, b.position, b.text, b.file_id,
          b.ref_folder_id, b.width_pct, b.updated_at, b.rich_content, b.section_block_id,
          b.list_parent_block_id, b.checked, b.page_position`,
      sql`FROM page_blocks b
          JOIN tasks t ON t.id = b.task_id
          JOIN folders f ON f.id = t.folder_id
          LEFT JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          WHERE b.task_id IN ${idSet(cappedTaskIds)}
            AND (f.owner_id = ${viewerId}
                 OR (m.user_id IS NOT NULL
                     AND f.deleted_at IS NULL
                     AND (t.created_by = ${viewerId}
                          OR t.assignee_id = ${viewerId})))`,
      sql`b.task_id`,
      sql`b.page_position ASC NULLS LAST, b.position ASC, b.id ASC`,
    ),
  )
  const documentByTask = groupBy(taskBlockRows, 'task_id')
  const documentOf = (taskId: string): ExportBlock[] =>
    (documentByTask.get(taskId) ?? []).map(blockFrom)

  /* ---------------------------------------------------------------- *
   * Labels (#208's M1 model, #227 area 5)
   *
   * Six statements, and the privacy boundary is the whole design rather
   * than a filter applied afterwards:
   *
   * - the viewer's **own** Personal definitions, complete with their
   *   archived state, scoped by `owner_user_id`;
   * - the **complete** Folder Label vocabulary of each owned folder,
   *   scoped by `folders.owner_id`;
   * - the viewer's Personal assignments to those folders and to every
   *   exported task, scoped by `owner_user_id` again;
   * - the Folder Label assignments of every exported task;
   * - and, for a task in a folder the viewer does **not** own, exactly
   *   the definitions that task wears and no others.
   *
   * **The last one is the line #227 draws and it is the only place in
   * this module where a definition is resolved per row rather than per
   * parent.** A colleague's folder may hold forty categories; what
   * belongs in this person's export is the two that are on the one task
   * that is their own work. A statement scoped by folder rather than by
   * task would hand them the other thirty-eight, which is exactly the
   * widening the issue forbids.
   *
   * **No statement here reads another account's Personal Label.** Both
   * Personal statements carry `owner_user_id = <viewer>`, so deleting
   * that clause returns nothing rather than somebody else's
   * classification of shared work — 10.2's own test, applied to the
   * second kind of privacy this model has.
   *
   * **Two of the six carry no cap, and that is a decision rather than an
   * omission.** The assignment statements are bounded below 10.3's
   * export cap by 10.3's own Label caps: 100 Folder and 100 Personal
   * Labels on one Task, 100 Personal on one Folder, all of them a tenth
   * of `EXPORT_ROW_CAP`, so a `cappedPerParent` over them could never
   * fire and would only add a window function to every export. The two
   * definition statements keep their caps anyway — 500 per account and
   * 250 per folder are equally unreachable — because they are named
   * collections in `truncated` and a collection that can be named
   * should be counted the same way as its neighbours.
   * ---------------------------------------------------------------- */

  const personalLabelRows = await rowsOf(
    db,
    sql`SELECT ${LABEL_COLUMNS} FROM labels l
         WHERE l.owner_user_id = ${viewerId} AND l.scope = 'personal'
         ORDER BY ${LABEL_ORDER}
         LIMIT ${FETCH}`,
  )

  const folderLabelRows = await rowsOf(
    db,
    cappedPerParent(
      sql`${LABEL_COLUMNS}`,
      sql`FROM labels l
          JOIN folders f ON f.id = l.folder_id AND f.owner_id = ${viewerId}
          WHERE l.scope = 'folder' AND l.folder_id IN ${idSet(folderIds)}`,
      sql`l.folder_id`,
      sql`(l.archived_at IS NOT NULL) ASC, lower(l.name) ASC, l.id ASC`,
    ),
  )

  const folderPersonalRows = await rowsOf(
    db,
    sql`SELECT fpl.folder_id, fpl.label_id
          FROM folder_personal_labels fpl
          JOIN labels l ON l.id = fpl.label_id
         WHERE fpl.owner_user_id = ${viewerId}
           AND fpl.folder_id IN ${idSet(folderIds)}
         ORDER BY fpl.folder_id ASC, ${LABEL_ORDER}`,
  )

  const taskPersonalRows = await rowsOf(
    db,
    sql`SELECT tpl.task_id, tpl.label_id
          FROM task_personal_labels tpl
          JOIN labels l ON l.id = tpl.label_id
         WHERE tpl.owner_user_id = ${viewerId}
           AND tpl.task_id IN ${idSet(cappedTaskIds)}
         ORDER BY tpl.task_id ASC, ${LABEL_ORDER}`,
  )

  /* The scope repeats the step statement's, which is the two arms an
     exported task can have: a folder the viewer owns, or a live folder they
     belong to where the task is their own work. The id list already came
     from a scoped read; the predicate stays anyway, on this module's rule. */
  const exportedTaskScope = sql`JOIN tasks t ON t.id = tfl.task_id
      JOIN folders f ON f.id = t.folder_id
      LEFT JOIN folder_members m
        ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
     WHERE tfl.task_id IN ${idSet(cappedTaskIds)}
       AND (f.owner_id = ${viewerId}
            OR (m.user_id IS NOT NULL
                AND f.deleted_at IS NULL
                AND (t.created_by = ${viewerId}
                     OR t.assignee_id = ${viewerId})))`

  const taskFolderRows = await rowsOf(
    db,
    sql`SELECT tfl.task_id, tfl.label_id
          FROM task_folder_labels tfl
          JOIN labels l ON l.id = tfl.label_id
          ${exportedTaskScope}
         ORDER BY tfl.task_id ASC, ${LABEL_ORDER}`,
  )

  const foreignLabelRows = await rowsOf(
    db,
    sql`SELECT tfl.task_id, ${LABEL_COLUMNS}
          FROM task_folder_labels tfl
          JOIN labels l ON l.id = tfl.label_id
          ${exportedTaskScope}
           AND f.owner_id <> ${viewerId}
         ORDER BY tfl.task_id ASC, ${LABEL_ORDER}`,
  )

  const personalLabels = truncation
    .apply('personal_labels', personalLabelRows)
    .map(labelFrom)
  const labelsByFolder = groupBy(folderLabelRows, 'folder_id')
  const personalOnFolder = groupBy(folderPersonalRows, 'folder_id')
  const personalOnTask = groupBy(taskPersonalRows, 'task_id')
  const folderOnTask = groupBy(taskFolderRows, 'task_id')
  const definitionsOnForeignTask = groupBy(foreignLabelRows, 'task_id')

  const labelIdsOf = (taskId: string): { personal: string[]; folder: string[] } => ({
    personal: (personalOnTask.get(taskId) ?? []).map((row) =>
      String(row.label_id),
    ),
    folder: (folderOnTask.get(taskId) ?? []).map((row) => String(row.label_id)),
  })

  const stepsOf = (
    taskId: string,
    collection: ExportCollection,
  ): ExportStep[] =>
    truncation.apply(collection, stepsByTask.get(taskId) ?? []).map(stepFrom)

  /* ---------------------------------------------------------------- *
   * Comments the person wrote, wherever they wrote them. Authorship is
   * the scope; a comment in a folder they have since left is still a
   * thing they said.
   * ---------------------------------------------------------------- */

  const commentRows = await rowsOf(
    db,
    sql`SELECT c.id, c.folder_id, c.task_id, c.discussion_id, c.parent_id,
               c.body,
               c.created_at, c.edited_at
        FROM comments c
        WHERE c.author_id = ${viewerId}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${FETCH}`,
  )
  const comments = truncation.apply('comments', commentRows)

  /* ---------------------------------------------------------------- *
   * The exporter's own Responsibility documents (issue #230, #209 R10).
   *
   * **Read the two joins rather than the columns.** `member_id = viewerId`
   * is what keeps this the exporter's own and nobody else's, and the join to
   * `folder_members` is what keeps it to folders they are *currently* in --
   * which is #230's "do not expose inaccessible former-Folder data merely
   * because a historical row exists", written as a predicate rather than as
   * an intention. `ended_at IS NULL` is the third: a document belonging to a
   * membership that ended is not an active Responsibility even while the
   * membership that replaced it exists.
   *
   * Delete any one of the three and the statement leaks something different,
   * which is 10.2's own test applied to a read that has no id to substitute.
   * ---------------------------------------------------------------- */

  const responsibilityRows = await rowsOf(
    db,
    sql`SELECT r.id, r.content, r.current_revision_no, r.updated_at,
               f.id AS folder_id, f.name AS folder_name,
               u.display_name AS updated_by
          FROM folder_responsibilities r
          JOIN folders f ON f.id = r.folder_id
          JOIN folder_members m
            ON m.folder_id = r.folder_id AND m.user_id = ${viewerId}
          LEFT JOIN users u ON u.id = r.updated_by
         WHERE r.member_id = ${viewerId} AND r.ended_at IS NULL
         ORDER BY f.name ASC, f.id ASC
         LIMIT ${FETCH}`,
  )
  const responsibilityCurrent = truncation.apply(
    'responsibilities',
    responsibilityRows,
  )
  const responsibilityIds = responsibilityCurrent.map((row) => String(row.id))
  const revisionRows =
    responsibilityIds.length === 0
      ? []
      : await rowsOf(
          db,
          cappedPerParent(
            sql`h.responsibility_id, h.revision_no, h.content,
                h.effective_at, hu.display_name AS committed_by`,
            sql`FROM folder_responsibility_history h
                JOIN folder_responsibilities r
                  ON r.id = h.responsibility_id AND r.member_id = ${viewerId}
                LEFT JOIN users hu ON hu.id = h.actor_id
                WHERE h.responsibility_id IN ${idSet(responsibilityIds)}
                  AND h.revision_no IS NOT NULL`,
            sql`h.responsibility_id`,
            sql`h.revision_no ASC`,
          ),
        )
  const revisionsByDocument = new Map<string, Record<string, unknown>[]>()
  for (const row of revisionRows) {
    const key = String(row.responsibility_id)
    const list = revisionsByDocument.get(key) ?? []
    list.push(row)
    revisionsByDocument.set(key, list)
  }

  const commentFileRows = await rowsOf(
    db,
    cappedPerParent(
      sql`cf.comment_id, fi.id, fi.kind, fi.name, fi.mime, fi.bytes,
          fi.width, fi.height, fi.duration_ms, fi.created_at`,
      sql`FROM comment_files cf
          JOIN comments c
            ON c.id = cf.comment_id AND c.author_id = ${viewerId}
          JOIN files fi ON fi.id = cf.file_id
          WHERE cf.comment_id IN ${idSet(
            comments.map((row) => String(row.id)),
          )}`,
      sql`cf.comment_id`,
      sql`cf.created_at ASC, cf.file_id ASC`,
    ),
  )
  const filesByComment = groupBy(commentFileRows, 'comment_id')

  /* ---------------------------------------------------------------- *
   * Shelves (4.18) with their pages, and the person's own files (4.16)
   * ---------------------------------------------------------------- */

  const shelfRows = await rowsOf(
    db,
    sql`SELECT id, name, icon, color, description, cover_file_id,
               cover_preset, cover_focal_y, created_at
        FROM shelves
        WHERE user_id = ${viewerId}
        ORDER BY created_at ASC, id ASC
        LIMIT ${FETCH}`,
  )
  const shelves = truncation.apply('shelves', shelfRows)

  const shelfBlockRows = await rowsOf(
    db,
    cappedPerParent(
      sql`b.id, b.shelf_id, b.kind, b.position, b.text, b.file_id,
          b.ref_folder_id, b.width_pct, b.updated_at, b.rich_content, b.section_block_id,
          b.list_parent_block_id, b.checked, b.page_position`,
      sql`FROM page_blocks b
          JOIN shelves s ON s.id = b.shelf_id AND s.user_id = ${viewerId}
          WHERE b.shelf_id IN ${idSet(
            shelves.map((row) => String(row.id)),
          )}`,
      sql`b.shelf_id`,
      sql`b.position ASC, b.id ASC`,
    ),
  )
  const blocksByShelf = groupBy(shelfBlockRows, 'shelf_id')

  /*
  Issue #210: the person's own Folder facets and their documents.

  **The membership join is the scope and it is inside the FROM clause**, as
  every other statement here has it. Two conditions, and the second is the one
  that matters: `ff.owner_id = viewer` takes the private facets -- all of them,
  in every folder this person is currently in, owned or not -- and
  `fo.owner_id = viewer` takes the shared ones only where the folder page
  beside them is already being carried under `folders.blocks`. That second
  clause is 7.22's "shared facets follow the folder page" rule, written as
  SQL.

  Trashed facets come too, with `trashed` set, as a trashed folder does; the
  export is what the person has, and a thirty-day window has not closed yet.
  `h1.text` is joined for the same reason 7.27 joins it: a Work facet's name is
  its heading's at read time, and an export that stored a different word would
  read back tabs nobody recognises.
  */
  const facetRows = await rowsOf(
    db,
    sql`SELECT ff.id, ff.folder_id, ff.kind, ff.owner_id, ff.display_name,
               ff.hidden, ff.position, ff.h1_block_id, ff.created_at,
               ff.updated_at, ff.deleted_at, h1.text AS h1_text
          FROM folder_facets ff
          JOIN folders fo ON fo.id = ff.folder_id
          JOIN folder_members m
            ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
          LEFT JOIN page_blocks h1 ON h1.id = ff.h1_block_id
         WHERE ff.owner_id = ${viewerId}
            OR (ff.owner_id IS NULL AND fo.owner_id = ${viewerId})
         ORDER BY ff.folder_id ASC, ff.position ASC, ff.id ASC
         LIMIT ${FETCH}`,
  )
  const facets = truncation.apply('facets', facetRows)

  const facetBlockRows =
    facets.length === 0
      ? []
      : await rowsOf(
          db,
          cappedPerParent(
            sql`b.id, b.facet_id, b.kind, b.position, b.text, b.file_id,
                b.ref_folder_id, b.width_pct, b.updated_at, b.rich_content,
                b.section_block_id, b.list_parent_block_id, b.checked,
                b.page_position`,
            /* **The scope, restated in this statement's own FROM clause.**
               `facets` above was already gathered under exactly this
               predicate, so the `IN` list alone would be correct -- and that
               is true of `folderBlockRows` and `shelfBlockRows` too, and both
               of them join their parent and check the owner anyway. This is
               the house rule rather than a doubt about the line above it:
               10.2's membership check belongs inside the `FROM`, so that a
               statement which loses its `IN` list, or is handed one somebody
               else built, returns nothing rather than another person's
               writing. Found by the verification of 743a6ac, where this was
               the only one of the three block reads without it. */
            sql`FROM page_blocks b
                JOIN folder_facets ff ON ff.id = b.facet_id
                JOIN folders fo ON fo.id = ff.folder_id
                JOIN folder_members m
                  ON m.folder_id = ff.folder_id AND m.user_id = ${viewerId}
                WHERE b.facet_id IN ${idSet(
                  facets.map((row) => String(row.id)),
                )}
                  AND (ff.owner_id = ${viewerId}
                       OR (ff.owner_id IS NULL AND fo.owner_id = ${viewerId}))`,
            sql`b.facet_id`,
            sql`b.page_position ASC NULLS LAST, b.position ASC, b.id ASC`,
          ),
        )
  const blocksByFacet = groupBy(facetBlockRows, 'facet_id')

  const fileRows = await rowsOf(
    db,
    sql`SELECT id, kind, name, mime, bytes, width, height, duration_ms,
               created_at
        FROM files
        WHERE owner_id = ${viewerId}
        ORDER BY created_at ASC, id ASC
        LIMIT ${FETCH}`,
  )

  /* ---------------------------------------------------------------- *
   * Assembly
   * ---------------------------------------------------------------- */

  const membersByFolder = groupBy(memberRows, 'folder_id')
  const blocksByFolder = groupBy(folderBlockRows, 'folder_id')
  // tasksByFolder was built above, the per-folder cap already taken, because
  // the step statement had to be handed the surviving ids.

  const exportedFolderIds = new Set(folderIds)
  const exportedFolders: ExportFolder[] = folders.map((row) => {
    const id = String(row.id)
    const parentId = nullableString(row.parent_folder_id)
    return {
      id,
      name: String(row.name),
      is_default: row.is_default === true,
      /* Version 8 (wave 2): the page tree, as far as this document reaches.
         A parent that is not in it (somebody else's page, or cut by the row
         cap) is null, so the export never names a page it does not carry. */
      parent_folder_id:
        parentId !== null && exportedFolderIds.has(parentId) ? parentId : null,
      icon: nullableString(row.icon),
      color: nullableString(row.color),
      description: nullableString(row.description),
      cover_file_id: nullableString(row.cover_file_id),
      cover_preset: nullableString(row.cover_preset),
      cover_focal_y: Number(row.cover_focal_y ?? 50),
      my_shelf: nullableString(row.my_shelf),
      my_color: nullableString(row.my_color),
      created_at: toIso(row.created_at),
      trashed: present(row.deleted_at),
      /* Display names and nothing else. 4.1 makes the column nullable and
         8.10's scrub empties it, so a member whose account is gone reads as
         an empty string rather than dropping out of the list and changing
         the count somebody's folder actually had. */
      members: truncation
        .apply('folders.members', membersByFolder.get(id) ?? [])
        .map((member) =>
          member.display_name === null || member.display_name === undefined
            ? ''
            : String(member.display_name),
        ),
      // Already capped, above, so no second `apply` here: calling it twice
      // would be harmless (the second call sees a list at the cap and cuts
      // nothing) and would read as though the cap were taken here, which is
      // the thing the step statement above depends on it not being.
      tasks: (tasksByFolder.get(id) ?? []).map((task) =>
        taskFrom(
          task,
          stepsOf(String(task.id), 'folders.tasks.steps'),
          labelIdsOf(String(task.id)),
          documentOf(String(task.id)),
        ),
      ),
      blocks: truncation
        .apply('folders.blocks', blocksByFolder.get(id) ?? [])
        .map(blockFrom),
      labels: truncation
        .apply('folders.labels', labelsByFolder.get(id) ?? [])
        .map(labelFrom),
      personal_label_ids: (personalOnFolder.get(id) ?? []).map((row) =>
        String(row.label_id),
      ),
    }
  })

  const exportedForeign: ExportForeignTask[] = foreignTasks.map((row) => {
    const id = String(row.id)
    return {
      ...taskFrom(row, stepsOf(id, 'tasks_elsewhere.steps'), labelIdsOf(id), documentOf(id)),
      folder: { id: String(row.folder_id), name: String(row.folder_name) },
      folder_labels: (definitionsOnForeignTask.get(id) ?? []).map(labelFrom),
    }
  })

  const exportedComments: ExportComment[] = comments.map((row) => {
    const id = String(row.id)
    return {
      id,
      folder_id: String(row.folder_id),
      task_id: nullableString(row.task_id),
      discussion_id: nullableString(row.discussion_id),
      parent_id: nullableString(row.parent_id),
      body: nullableString(row.body),
      created_at: toIso(row.created_at),
      edited_at: nullableIso(row.edited_at),
      files: truncation
        .apply('comments.files', filesByComment.get(id) ?? [])
        .map(fileFrom),
    }
  })

  const exportedShelves: ExportShelf[] = shelves.map((row) => {
    const id = String(row.id)
    return {
      id,
      name: String(row.name),
      icon: nullableString(row.icon),
      color: nullableString(row.color),
      description: nullableString(row.description),
      cover_file_id: nullableString(row.cover_file_id),
      cover_preset: nullableString(row.cover_preset),
      cover_focal_y: Number(row.cover_focal_y ?? 50),
      created_at: toIso(row.created_at),
      blocks: truncation
        .apply('shelves.blocks', blocksByShelf.get(id) ?? [])
        .map(blockFrom),
    }
  })

  const exportedFacets: ExportFacet[] = facets.map((row) => {
    const id = String(row.id)
    const kind = String(row.kind) as FacetKind
    const displayName = nullableString(row.display_name)
    return {
      id,
      folder_id: String(row.folder_id),
      kind,
      name: resolveFacetName(kind, displayName, nullableString(row.h1_text)),
      display_name: displayName,
      hidden: row.hidden === true,
      private: row.owner_id !== null && row.owner_id !== undefined,
      position: String(row.position),
      h1_block_id: nullableString(row.h1_block_id),
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
      trashed: row.deleted_at !== null && row.deleted_at !== undefined,
      blocks: truncation
        .apply('facets.blocks', blocksByFacet.get(id) ?? [])
        .map(blockFrom),
    }
  })

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    account: {
      id: String(accountRow.id),
      email: nullableString(accountRow.email),
      display_name: nullableString(accountRow.display_name),
      avatar_url: nullableString(accountRow.avatar_url),
      timezone: String(accountRow.timezone),
      created_at: toIso(accountRow.created_at),
    },
    settings: {
      ...bundle,
      show_important: flags.show_important === true,
      show_all: flags.show_all === true,
      show_done: flags.show_done === true,
      place_covers: covers.map((cover) => ({
        place: cover.place,
        file_id: cover.file_id,
        preset: cover.preset,
        focal_y: cover.focal_y,
      })),
      place_descriptions: descriptions.map((entry) => ({
        place: entry.place,
        description: entry.description,
      })),
    },
    folders: exportedFolders,
    facets: exportedFacets,
    tasks_elsewhere: exportedForeign,
    responsibilities: responsibilityCurrent.map((row) => {
      const id = String(row.id)
      return {
        folder: {
          id: String(row.folder_id),
          name: String(row.folder_name),
        },
        content: row.content ?? null,
        revision_no: Number(row.current_revision_no),
        updated_at: toIso(row.updated_at),
        updated_by: nullableString(row.updated_by),
        revisions: truncation
          .apply(
            'responsibilities.revisions',
            revisionsByDocument.get(id) ?? [],
          )
          .map((revision) => ({
            revision_no: Number(revision.revision_no),
            content: revision.content ?? null,
            committed_at: toIso(revision.effective_at),
            committed_by: nullableString(revision.committed_by),
          })),
      }
    }),
    comments: exportedComments,
    shelves: exportedShelves,
    views: views.map((view) => ({
      id: view.id,
      name: view.name,
      definition: view.definition,
      pinned: view.pinned,
      created_at: view.created_at,
    })),
    files: truncation.apply('files', fileRows).map(fileFrom),
    personal_labels: personalLabels,
    truncated: truncation.names(),
  }
}

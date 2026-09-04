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
is applied per collection, in SQL where the collection is nested (a window
function per parent) and as a LIMIT where it is flat, so what is fetched is
bounded rather than merely what is sent. A collection that hit the cap is
named in `truncated`. Streaming is not attempted in version 1; the caps are
what make that safe, and an account that outgrows them wants a format change
rather than a chunked copy of this one.

**No statement below reads an email address but the viewer's own.** Other
people enter the document as `display_name` and nothing else: members of a
folder, a task's creator, a task's assignee. `invites` and `connections` are
not read at all, which is the same rule stated as an absence.

**No statement is per row.** Tasks, steps, reminders, blocks, members and
comment attachments each arrive as one statement across every parent, grouped
in memory afterwards, rather than as one statement per folder or per comment.
And none of them names a list of ids gathered by an earlier statement, which
is the shape that would have put a hundred thousand bind parameters on the
wire for a large account: each is scoped by repeating the predicate that
scoped its parent.
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
  ExportFile,
  ExportFolder,
  ExportForeignTask,
  ExportReminder,
  ExportShelf,
  ExportStep,
  ExportTask,
} from '../../shared/export.js'
import { rowsOf } from '../database.js'
import { listViews, readBundle } from './bundle.js'
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

function taskFrom(
  row: Record<string, unknown>,
  steps: ExportStep[],
): ExportTask {
  return {
    id: String(row.id),
    title: String(row.title),
    notes: nullableString(row.notes),
    status: String(row.status),
    important: row.important === true,
    due_date: nullableString(row.due_date),
    due_time: nullableString(row.due_time),
    recurrence_rule: nullableString(row.recurrence_rule),
    series_id: nullableString(row.series_id),
    /* Null where the creator's account was deleted: 8.10 scrubs the name and
       AC-250 makes every card read null. The column still points at the
       scrubbed row, which is not this document's business. */
    created_by: nullableString(row.creator_display_name),
    assignee: nullableString(row.assignee_display_name),
    completed_at: nullableIso(row.completed_at),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    trashed: present(row.deleted_at),
    steps,
    reminder: present(row.fire_at) ? reminderFrom(row) : null,
  }
}

/*
The columns every exported task carries, in both places tasks appear. The
reminder is a LEFT JOIN of 4.8's one row per task, projected as both its
columns with exactly one non-null (7.0's TaskDetail rule); `state` and
`time_of_day` are aliased because a reader of `taskFrom` should not have to
work out which table a bare name came from.
*/
const TASK_COLUMNS = sql`t.id, t.title, t.notes, t.status, t.important,
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
   * that lost it returns nothing rather than another person's rows.
   *
   * Trashed folders are carried with their flag. 7.13 has not deleted them
   * yet, so an export that dropped them would be wrong on the day their
   * owner restores one.
   * ---------------------------------------------------------------- */

  const folderRows = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.is_default, f.icon, f.color, f.description,
               f.cover_file_id, f.cover_preset, f.cover_focal_y,
               f.created_at, f.deleted_at,
               m.label AS my_label, m.color AS my_color
        FROM folders f
        LEFT JOIN folder_members m
          ON m.folder_id = f.id AND m.user_id = ${viewerId}
        WHERE f.owner_id = ${viewerId}
        ORDER BY f.created_at ASC, f.id ASC
        LIMIT ${FETCH}`,
  )
  const folders = truncation.apply('folders', folderRows)

  const memberRows = await rowsOf(
    db,
    cappedPerParent(
      sql`fm.folder_id, u.display_name`,
      sql`FROM folder_members fm
          JOIN folders f ON f.id = fm.folder_id AND f.owner_id = ${viewerId}
          JOIN users u ON u.id = fm.user_id`,
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
          ${TASK_JOINS}`,
      sql`t.folder_id`,
      sql`t.created_at ASC, t.id ASC`,
    ),
  )

  const folderBlockRows = await rowsOf(
    db,
    cappedPerParent(
      sql`b.id, b.folder_id, b.kind, b.position, b.text, b.file_id,
          b.ref_folder_id, b.width_pct, b.updated_at`,
      sql`FROM page_blocks b
          JOIN folders f ON f.id = b.folder_id AND f.owner_id = ${viewerId}`,
      sql`b.folder_id`,
      sql`b.position ASC, b.id ASC`,
    ),
  )

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

  /* Steps for both task sets in one statement. The WHERE is the disjunction
     of the two scopes above rather than a list of the ids they returned:
     a step is reachable here exactly when its task is. */
  const stepRows = await rowsOf(
    db,
    cappedPerParent(
      sql`s.id, s.task_id, s.title, s.done, s.position, s.created_at`,
      sql`FROM steps s
          JOIN tasks t ON t.id = s.task_id
          JOIN folder_members m
            ON m.folder_id = t.folder_id AND m.user_id = ${viewerId}
          JOIN folders f ON f.id = t.folder_id
          WHERE f.owner_id = ${viewerId}
             OR (f.deleted_at IS NULL
                 AND (t.created_by = ${viewerId}
                      OR t.assignee_id = ${viewerId}))`,
      sql`s.task_id`,
      sql`s.position ASC, s.id ASC`,
    ),
  )
  const stepsByTask = groupBy(stepRows, 'task_id')

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
    sql`SELECT c.id, c.folder_id, c.task_id, c.parent_id, c.body,
               c.created_at, c.edited_at
        FROM comments c
        WHERE c.author_id = ${viewerId}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${FETCH}`,
  )
  const comments = truncation.apply('comments', commentRows)

  const commentFileRows = await rowsOf(
    db,
    cappedPerParent(
      sql`cf.comment_id, fi.id, fi.kind, fi.name, fi.mime, fi.bytes,
          fi.width, fi.height, fi.duration_ms, fi.created_at`,
      sql`FROM comment_files cf
          JOIN comments c
            ON c.id = cf.comment_id AND c.author_id = ${viewerId}
          JOIN files fi ON fi.id = cf.file_id`,
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
          b.ref_folder_id, b.width_pct, b.updated_at`,
      sql`FROM page_blocks b
          JOIN shelves s ON s.id = b.shelf_id AND s.user_id = ${viewerId}`,
      sql`b.shelf_id`,
      sql`b.position ASC, b.id ASC`,
    ),
  )
  const blocksByShelf = groupBy(shelfBlockRows, 'shelf_id')

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
  const tasksByFolder = groupBy(folderTaskRows, 'folder_id')
  const blocksByFolder = groupBy(folderBlockRows, 'folder_id')

  const exportedFolders: ExportFolder[] = folders.map((row) => {
    const id = String(row.id)
    return {
      id,
      name: String(row.name),
      is_default: row.is_default === true,
      icon: nullableString(row.icon),
      color: nullableString(row.color),
      description: nullableString(row.description),
      cover_file_id: nullableString(row.cover_file_id),
      cover_preset: nullableString(row.cover_preset),
      cover_focal_y: Number(row.cover_focal_y ?? 50),
      my_label: nullableString(row.my_label),
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
      tasks: truncation
        .apply('folders.tasks', tasksByFolder.get(id) ?? [])
        .map((task) =>
          taskFrom(task, stepsOf(String(task.id), 'folders.tasks.steps')),
        ),
      blocks: truncation
        .apply('folders.blocks', blocksByFolder.get(id) ?? [])
        .map(blockFrom),
    }
  })

  const exportedForeign: ExportForeignTask[] = foreignTasks.map((row) => ({
    ...taskFrom(row, stepsOf(String(row.id), 'tasks_elsewhere.steps')),
    folder: { id: String(row.folder_id), name: String(row.folder_name) },
  }))

  const exportedComments: ExportComment[] = comments.map((row) => {
    const id = String(row.id)
    return {
      id,
      folder_id: String(row.folder_id),
      task_id: nullableString(row.task_id),
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
    tasks_elsewhere: exportedForeign,
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
    truncated: truncation.names(),
  }
}

// The 7.22 data export of one person's data. The request has no id: every statement is scoped to the viewer
// in its own FROM clause, and new statements must keep that. Child reads take the ids of capped parents AND keep
// the scope. Ids bind as one jsonb array, not an IN list (drizzle expands arrays). Only the viewer's email is read.
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
  ExportDirectMessage,
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
import { idSet, rowsOf } from '../database.js'
import { listViews, readBundle } from './bundle.js'
import { postContentOrNull } from './comments.js'
import { listPlaceCovers } from './covers.js'
import { listPlaceDescriptions } from './place-descriptions.js'

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

// to_char, because node-postgres parses DATE into a JS Date while PGlite returns a string.
const START_DATE = sql`to_char(t.start_date, 'YYYY-MM-DD')`
const START_TIME = sql`to_char(t.start_time, 'HH24:MI')`
const DUE_DATE = sql`to_char(t.due_date, 'YYYY-MM-DD')`
const DUE_TIME = sql`to_char(t.due_time, 'HH24:MI')`

/** One more row than the cap, so a full list is distinguishable from a cut one. */
const FETCH = EXPORT_ROW_CAP + 1

class Truncation {
  private readonly cut = new Set<ExportCollection>()

  apply<T>(collection: ExportCollection, list: T[]): T[] {
    if (list.length <= EXPORT_ROW_CAP) return list
    this.cut.add(collection)
    return list.slice(0, EXPORT_ROW_CAP)
  }

  /** Insertion order is enough for naming what was cut. */
  names(): ExportCollection[] {
    return [...this.cut]
  }
}

/** A per-parent cap in SQL: at most `FETCH` children per parent. The scope lives in `source`. */
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
    toggleable: row.toggleable === true ? true : null,
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

const LABEL_COLUMNS = sql`l.id, l.scope, l.name, l.color, l.description,
  l.archived_at, l.folder_id`

/** Active before archived, then lower(name), then id, so two exports of an unchanged account match. */
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
    start_time: nullableString(row.start_time),
    due_date: nullableString(row.due_date),
    due_time: nullableString(row.due_time),
    recurrence_rule: nullableString(row.recurrence_rule),
    series_id: nullableString(row.series_id),
    /* Null when the creator's account was deleted (8.10). */
    created_by: nullableString(row.creator_display_name),
    assignee: nullableString(row.assignee_display_name),
    assignees: Array.isArray(row.assignee_names)
      ? row.assignee_names.map(nullableString) : [],
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

// Exported task columns. The reminder is a LEFT JOIN with exactly one mode column non-null.
const TASK_COLUMNS = sql`t.id, t.section_block_id, t.page_position, t.title, t.notes, t.status, t.important,
  ${START_DATE} AS start_date, ${START_TIME} AS start_time,
  ${DUE_DATE} AS due_date, ${DUE_TIME} AS due_time,
  t.recurrence_rule, t.series_id, t.completed_at, t.created_at, t.updated_at,
  t.deleted_at, t.folder_id,
  cb.display_name AS creator_display_name,
  asg.display_name AS assignee_display_name,
  (SELECT coalesce(json_agg(au.display_name ORDER BY ids.ord), '[]'::json)
     FROM unnest(t.assignee_ids) WITH ORDINALITY AS ids(user_id, ord)
     JOIN users au ON au.id = ids.user_id) AS assignee_names,
  r.offset_minutes, to_char(r.time_of_day, 'HH24:MI') AS reminder_time_of_day,
  r.fire_at, r.state AS reminder_state, r.fired_at`

/** The LEFT JOIN exists only for scrubbed creators: created_by is NOT NULL (4.5). */
const TASK_JOINS = sql`LEFT JOIN users cb
    ON cb.id = t.created_by AND cb.deleted_at IS NULL
  LEFT JOIN users asg ON asg.id = t.assignee_id
  LEFT JOIN reminders r ON r.task_id = t.id`

/** The whole export for one viewer, or null when no live account holds that id (the route answers 401). */
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
  const directMessages = truncation.apply('direct_messages', await rowsOf(db, sql`
    SELECT m.id, m.conversation_id, m.author_id, m.body, m.created_at,
           other_user.display_name AS other_name
    FROM direct_messages m
    JOIN direct_conversations c ON c.id = m.conversation_id
    JOIN users other_user ON other_user.id = CASE
      WHEN c.user_a_id = ${viewerId}::uuid THEN c.user_b_id ELSE c.user_a_id END
    WHERE c.user_a_id = ${viewerId}::uuid OR c.user_b_id = ${viewerId}::uuid
    ORDER BY m.created_at ASC, m.id ASC
    LIMIT ${FETCH}`))

  const folderRows = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.is_default, f.icon, f.color, f.description,
               f.cover_file_id, f.cover_preset, f.cover_focal_y,
               f.created_at, f.deleted_at, f.parent_folder_id,
               f.project_id, f.kind, f.tab_position,
               CASE WHEN f.id = f.project_id THEN m.shelf_name END AS my_shelf, m.color AS my_color
        FROM folders f
        LEFT JOIN folder_members m
          ON m.folder_id = f.project_id AND m.user_id = ${viewerId}
        WHERE f.owner_id = ${viewerId}
        ORDER BY f.created_at ASC, f.id ASC
        LIMIT ${FETCH}`,
  )
  const folders = truncation.apply('folders', folderRows)
  const folderIds = folders.map((row) => String(row.id))

  const memberRows = await rowsOf(
    db,
    cappedPerParent(
      sql`f.id AS folder_id, u.display_name`,
      sql`FROM folders f
          JOIN folder_members fm ON fm.folder_id = f.project_id
          JOIN users u ON u.id = fm.user_id
          WHERE f.owner_id = ${viewerId} AND f.id IN ${idSet(folderIds)}`,
      sql`f.id`,
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
          b.list_parent_block_id, b.checked, b.page_position, b.toggleable`,
      sql`FROM page_blocks b
          JOIN folders f ON f.id = b.folder_id AND f.owner_id = ${viewerId}
          WHERE b.folder_id IN ${idSet(folderIds)}`,
      sql`b.folder_id`,
      sql`b.position ASC, b.id ASC`,
    ),
  )

  const tasksByFolder = new Map<string, Record<string, unknown>[]>()
  for (const [id, list] of groupBy(folderTaskRows, 'folder_id')) {
    tasksByFolder.set(id, truncation.apply('folders.tasks', list))
  }

  const foreignTaskRows = await rowsOf(
    db,
    sql`SELECT ${TASK_COLUMNS}, f.name AS folder_name
        FROM tasks t
        JOIN folder_members m
          ON m.folder_id = t.project_id AND m.user_id = ${viewerId}
        JOIN folders f ON f.id = t.folder_id AND f.deleted_at IS NULL
        ${TASK_JOINS}
        WHERE f.owner_id <> ${viewerId}
          AND (t.created_by = ${viewerId} OR ${viewerId}::uuid = ANY(t.assignee_ids))
        ORDER BY t.created_at ASC, t.id ASC
        LIMIT ${FETCH}`,
  )
  const foreignTasks = truncation.apply('tasks_elsewhere', foreignTaskRows)

  const cappedTaskIds = [
    ...[...tasksByFolder.values()].flat().map((row) => String(row.id)),
    ...foreignTasks.map((row) => String(row.id)),
  ]
  const stepRows = await rowsOf(
    db,
    cappedPerParent(
      sql`s.id, s.task_id, s.text AS title, s.checked AS done,
          (row_number() OVER (PARTITION BY s.task_id
                              ORDER BY s.page_position ASC NULLS LAST, s.position, s.updated_at, s.id) - 1)::int
            AS position,
          s.updated_at AS created_at`,
      sql`FROM page_blocks s
          JOIN tasks t ON t.id = s.task_id
          JOIN folders f ON f.id = t.folder_id
          LEFT JOIN folder_members m
            ON m.folder_id = t.project_id AND m.user_id = ${viewerId}
          WHERE s.task_id IN ${idSet(cappedTaskIds)} AND s.kind = 'checklist'
            AND (f.owner_id = ${viewerId}
                 OR (m.user_id IS NOT NULL
                     AND f.deleted_at IS NULL
                     AND (t.created_by = ${viewerId}
                          OR ${viewerId}::uuid = ANY(t.assignee_ids))))`,
      sql`s.task_id`,
      sql`s.page_position ASC NULLS LAST, s.position ASC, s.updated_at ASC, s.id ASC`,
    ),
  )
  const stepsByTask = groupBy(stepRows, 'task_id')

  const taskBlockRows = await rowsOf(
    db,
    cappedPerParent(
      sql`b.id, b.task_id, b.kind, b.position, b.text, b.file_id,
          b.ref_folder_id, b.width_pct, b.updated_at, b.rich_content, b.section_block_id,
          b.list_parent_block_id, b.checked, b.page_position, b.toggleable`,
      sql`FROM page_blocks b
          JOIN tasks t ON t.id = b.task_id
          JOIN folders f ON f.id = t.folder_id
          LEFT JOIN folder_members m
            ON m.folder_id = t.project_id AND m.user_id = ${viewerId}
          WHERE b.task_id IN ${idSet(cappedTaskIds)}
            AND (f.owner_id = ${viewerId}
                 OR (m.user_id IS NOT NULL
                     AND f.deleted_at IS NULL
                     AND (t.created_by = ${viewerId}
                          OR ${viewerId}::uuid = ANY(t.assignee_ids))))`,
      sql`b.task_id`,
      sql`b.page_position ASC NULLS LAST, b.position ASC, b.id ASC`,
    ),
  )
  const documentByTask = groupBy(taskBlockRows, 'task_id')
  const documentOf = (taskId: string): ExportBlock[] =>
    (documentByTask.get(taskId) ?? []).map(blockFrom)

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

  const exportedTaskScope = sql`JOIN tasks t ON t.id = tfl.task_id
      JOIN folders f ON f.id = t.folder_id
      LEFT JOIN folder_members m
        ON m.folder_id = t.project_id AND m.user_id = ${viewerId}
     WHERE tfl.task_id IN ${idSet(cappedTaskIds)}
       AND (f.owner_id = ${viewerId}
            OR (m.user_id IS NOT NULL
                AND f.deleted_at IS NULL
                AND (t.created_by = ${viewerId}
                     OR ${viewerId}::uuid = ANY(t.assignee_ids))))`

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

  /* A Discussion comment has no single Task: Discussion links are many-to-many. */
  const commentRows = await rowsOf(
    db,
    sql`SELECT c.id, c.folder_id, c.task_id, c.discussion_id, c.parent_id,
               c.body, c.content,
               c.created_at, c.edited_at
        FROM comments c
        WHERE c.author_id = ${viewerId}
        ORDER BY c.created_at ASC, c.id ASC
        LIMIT ${FETCH}`,
  )
  const comments = truncation.apply('comments', commentRows)

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
  const bioRows = await rowsOf(db, sql`
    SELECT f.id AS folder_id, f.name AS folder_name, m.bio
      FROM folder_members m JOIN folders f ON f.id = m.folder_id
     WHERE m.user_id = ${viewerId} AND m.bio IS NOT NULL
     ORDER BY f.name ASC, f.id ASC LIMIT ${FETCH}
  `)
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
          b.list_parent_block_id, b.checked, b.page_position, b.toggleable`,
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

  const fileRows = await rowsOf(
    db,
    sql`SELECT id, kind, name, mime, bytes, width, height, duration_ms,
               created_at
        FROM files
        WHERE owner_id = ${viewerId}
        ORDER BY created_at ASC, id ASC
        LIMIT ${FETCH}`,
  )

  const membersByFolder = groupBy(memberRows, 'folder_id')
  const blocksByFolder = groupBy(folderBlockRows, 'folder_id')

  const exportedFolderIds = new Set(folderIds)
  const exportedFolders: ExportFolder[] = folders.map((row) => {
    const id = String(row.id)
    const parentId = nullableString(row.parent_folder_id)
    return {
      id,
      name: String(row.name),
      is_default: row.is_default === true,
      parent_folder_id:
        parentId !== null && exportedFolderIds.has(parentId) ? parentId : null,
      project_id: exportedFolderIds.has(String(row.project_id)) ? String(row.project_id) : id,
      kind: nullableString(row.kind) as ExportFolder['kind'],
      tab_position: exportedFolderIds.has(String(row.project_id))
        ? nullableString(row.tab_position)
        : (nullableString(row.tab_position) ?? 'a0'),
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
      members: truncation
        .apply('folders.members', membersByFolder.get(id) ?? [])
        .map((member) =>
          member.display_name === null || member.display_name === undefined
            ? ''
            : String(member.display_name),
        ),
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
        .map(blockFrom)
        .map((block) =>
          block.kind === 'page' &&
          block.ref_folder_id !== null &&
          !exportedFolderIds.has(block.ref_folder_id)
            ? { ...block, ref_folder_id: null }
            : block,
        ),
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
      content: postContentOrNull(row.content),
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

  const exportedFacets: ExportFacet[] = []

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
    team_bios: truncation.apply('team_bios', bioRows).map((row) => ({
      folder: { id: String(row.folder_id), name: String(row.folder_name) },
      bio: String(row.bio),
    })),
    comments: exportedComments,
    direct_messages: directMessages.map((row): ExportDirectMessage => ({
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      other_name: nullableString(row.other_name),
      sent_by_me: String(row.author_id) === viewerId,
      body: String(row.body),
      created_at: toIso(row.created_at),
    })),
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

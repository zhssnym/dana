// Labels: Folder and Personal definitions, their assignments, caps, and the batch projections.
// Migration 0022's composite FKs keep a Folder Label on its own Folder's Tasks; guards here only make that a 422.
// Personal Labels are private: every statement on them carries owner_user_id = viewer. Readers stay batched.
// Applying a Folder Label is authorized here, under the Task row lock, because it depends on the current assignee.
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import { LIST_ROW_CAP, takeCapped } from '../../shared/list-cap.js'
import {
  FOLDER_LABEL_DEFINITION_CAP,
  FOLDER_PERSONAL_LABEL_CAP,
  PERSONAL_LABEL_DEFINITION_CAP,
  TASK_FOLDER_LABEL_CAP,
  TASK_PERSONAL_LABEL_CAP,
} from '../../shared/labels.js'
import type {
  GetLabelsQuery,
  LabelDefinition,
  LabelRef,
  LabelScope,
  TaskLabels,
} from '../../shared/labels.js'
import { idSet, inTransaction, pairSet, rowsOf } from '../database.js'
import type { Executor, IdPair } from '../database.js'
import { recordEvent } from './events.js'
import {
  folderActorFacts,
  joinVisibleFolder,
  mayPerform,
  visibleFolder,
} from './folder-access.js'
import type { FolderAction } from './folder-access.js'

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

/**
 * Shared Label columns; `archived` is derived from `archived_at`. `sort_name` is `lower(name)` named,
 * because ORDER BY across a UNION may name only output columns.
 */
const LABEL_COLUMNS = sql`l.id, l.scope, l.name, l.color, l.description,
       (l.archived_at IS NOT NULL) AS archived, l.folder_id,
       lower(l.name) AS sort_name`

/** Every Label list's order: active before archived, then lower(name), then id. */
const LABEL_ORDER = sql`archived ASC, sort_name ASC, id ASC`

function refFromRow(row: Record<string, unknown>): LabelRef {
  return {
    id: String(row.id),
    scope: String(row.scope) as LabelScope,
    name: String(row.name),
    color: String(row.color),
    archived: row.archived === true,
    folder_id: nullableString(row.folder_id),
  }
}

function definitionFromRow(row: Record<string, unknown>): LabelDefinition {
  return {
    ...refFromRow(row),
    description: nullableString(row.description),
  }
}

/**
 * The Labels of many Tasks in one statement: the viewer's Personal ones and each Task's Folder ones.
 * Each half carries its own scope, which also hides assignments on folders the viewer lost access to.
 */
export async function taskLabelsFor(
  executor: Executor,
  viewerId: string,
  taskIds: readonly string[],
): Promise<Map<string, TaskLabels>> {
  const byTask = new Map<string, TaskLabels>()
  for (const id of taskIds) byTask.set(id, { personal: [], folder: [] })
  if (taskIds.length === 0) return byTask

  const ids = idSet(taskIds)
  const found = await rowsOf(
    executor,
    sql`SELECT target_id, bucket, id, scope, name, color, archived, folder_id,
               sort_name
        FROM (
          SELECT tpl.task_id AS target_id, 'personal' AS bucket, ${LABEL_COLUMNS}
            FROM task_personal_labels tpl
            JOIN labels l ON l.id = tpl.label_id
            JOIN tasks t ON t.id = tpl.task_id AND t.deleted_at IS NULL
            ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
           WHERE tpl.owner_user_id = ${viewerId}
             AND tpl.task_id IN ${ids}
          UNION ALL
          SELECT tfl.task_id AS target_id, 'folder' AS bucket, ${LABEL_COLUMNS}
            FROM task_folder_labels tfl
            JOIN labels l ON l.id = tfl.label_id
            JOIN tasks t ON t.id = tfl.task_id AND t.deleted_at IS NULL
            ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
           WHERE tfl.task_id IN ${ids}
        ) applied
        ORDER BY target_id ASC, bucket ASC, ${LABEL_ORDER}`,
  )

  for (const row of found) {
    const entry = byTask.get(String(row.target_id))
    if (entry === undefined) continue
    const ref = refFromRow(row)
    if (String(row.bucket) === 'personal') entry.personal.push(ref)
    else entry.folder.push(ref)
  }
  return byTask
}

/** The single-row path uses the same statement, so it cannot scope differently from the batch. */
export async function taskLabelsOf(
  executor: Executor,
  viewerId: string,
  taskId: string,
): Promise<TaskLabels> {
  const found = await taskLabelsFor(executor, viewerId, [taskId])
  return found.get(taskId) ?? { personal: [], folder: [] }
}

/** The viewer's own Personal Labels on many Folders at once. Folder Labels never classify a Folder. */
export async function folderPersonalLabelsFor(
  executor: Executor,
  viewerId: string,
  folderIds: readonly string[],
): Promise<Map<string, LabelRef[]>> {
  const byFolder = new Map<string, LabelRef[]>()
  for (const id of folderIds) byFolder.set(id, [])
  if (folderIds.length === 0) return byFolder

  const found = await rowsOf(
    executor,
    sql`SELECT fpl.folder_id AS target_id, ${LABEL_COLUMNS}
        FROM folder_personal_labels fpl
        JOIN labels l ON l.id = fpl.label_id
        ${joinVisibleFolder(viewerId, { folderId: sql`fpl.folder_id`, folder: 'f' })}
       WHERE fpl.owner_user_id = ${viewerId}
         AND fpl.folder_id IN ${idSet(folderIds)}
       ORDER BY target_id ASC, ${LABEL_ORDER}`,
  )

  for (const row of found) {
    byFolder.get(String(row.target_id))?.push(refFromRow(row))
  }
  return byFolder
}

export type ListLabelsResult =
  | { kind: 'listed'; labels: LabelDefinition[]; truncated: boolean }
  /** The `folder_id` selector names a Folder the viewer cannot reach: 404, not 403 (10.2). */
  | { kind: 'folder_not_found' }

/**
 * Every definition the viewer may read: their own Personal ones, then Folder ones from live Folders they belong to,
 * grouped by Folder so picker headings get contiguous rows.
 */
export async function listLabels(
  db: Db,
  viewerId: string,
  query: GetLabelsQuery,
): Promise<ListLabelsResult> {
  if (
    query.folder_id !== undefined &&
    (await folderActorFacts(db, viewerId, query.folder_id)) === null
  ) {
    return { kind: 'folder_not_found' }
  }

  const state =
    query.state === 'all'
      ? sql``
      : query.state === 'active'
        ? sql` AND l.archived_at IS NULL`
        : sql` AND l.archived_at IS NOT NULL`

  const halves: SQL[] = []
  if (query.scope !== 'folder') {
    halves.push(sql`
      SELECT 0 AS scope_rank, NULL::uuid AS folder_rank, ${LABEL_COLUMNS}
        FROM labels l
       WHERE l.scope = 'personal' AND l.owner_user_id = ${viewerId}${state}`)
  }
  if (query.scope !== 'personal') {
    const one =
      query.folder_id === undefined
        ? sql``
        : sql` AND l.folder_id = ${query.folder_id}`
    halves.push(sql`
      SELECT 1 AS scope_rank, l.folder_id AS folder_rank, ${LABEL_COLUMNS}
        FROM labels l
        ${joinVisibleFolder(viewerId, { folderId: sql`l.folder_id`, folder: 'f' })}
       WHERE l.scope = 'folder'${one}${state}`)
  }
  if (halves.length === 0) {
    return { kind: 'listed', labels: [], truncated: false }
  }

  /* One row over 10.3's cap tells whether the answer was cut, without a second count. */
  const found = await rowsOf(
    db,
    sql`SELECT * FROM (${sql.join(halves, sql` UNION ALL `)}) visible
        ORDER BY scope_rank ASC, folder_rank ASC NULLS FIRST, ${LABEL_ORDER}
        LIMIT ${LIST_ROW_CAP + 1}`,
  )
  const capped = takeCapped([found.map(definitionFromRow)])
  return {
    kind: 'listed',
    labels: capped.sections[0] ?? [],
    truncated: capped.truncated,
  }
}

export interface LabelFields {
  name: string
  color: string
  description?: string | null
}

export interface LabelPatch {
  name?: string
  color?: string
  description?: string | null
}

export type CreateLabelResult =
  | { kind: 'created'; label: LabelDefinition }
  /** A Label of this name already exists in this catalog, case-insensitively, archived included. */
  | { kind: 'duplicate_name' }
  | { kind: 'definition_cap' }

export type PatchLabelResult =
  | { kind: 'patched'; label: LabelDefinition }
  | { kind: 'not_found' }
  | { kind: 'duplicate_name' }

export type ArchiveLabelResult =
  | { kind: 'ok'; label: LabelDefinition }
  | { kind: 'not_found' }

/** The unique index a 23505 came from, or null. Compares the constraint name, never the translated message. */
function uniqueViolationConstraint(error: unknown): string | null {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; constraint?: unknown }
    if (candidate.code === '23505') return String(candidate.constraint ?? '')
    current = current.cause
  }
  return null
}

/**
 * Whether a rejection is one of 0022's case-insensitive name indexes. The index decides races, not a SELECT first.
 * Other unique violations are rethrown: a 409 would hide a defect.
 */
function isDuplicateName(error: unknown): boolean {
  const constraint = uniqueViolationConstraint(error)
  return (
    constraint === 'labels_personal_name_idx' ||
    constraint === 'labels_folder_name_idx'
  )
}

async function insertLabel(
  tx: Executor,
  scope: LabelScope,
  ownerUserId: string | null,
  folderId: string | null,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  try {
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO labels (scope, owner_user_id, folder_id, name, color,
                              description)
          VALUES (${scope}, ${ownerUserId}::uuid, ${folderId}::uuid,
                  ${fields.name}, ${fields.color},
                  ${fields.description ?? null})
          RETURNING id, scope, name, color, description,
                    (archived_at IS NOT NULL) AS archived, folder_id`,
    )
    const row = inserted[0]
    if (row === undefined) throw new Error('INSERT INTO labels returned no row')
    return { kind: 'created', label: definitionFromRow(row) }
  } catch (error) {
    if (isDuplicateName(error)) return { kind: 'duplicate_name' }
    throw error
  }
}

/**
 * POST /labels/personal. Count, cap and insert in one transaction behind the owner's user row lock.
 * Archived definitions count toward the cap.
 */
export async function createPersonalLabel(
  db: Db,
  viewerId: string,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT 1 FROM users WHERE id = ${viewerId} FOR UPDATE`)
    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM labels
          WHERE scope = 'personal' AND owner_user_id = ${viewerId}`,
    )
    if (Number(held[0]?.n ?? 0) >= PERSONAL_LABEL_DEFINITION_CAP) {
      return { kind: 'definition_cap' }
    }
    return insertLabel(tx, 'personal', viewerId, null, fields)
  })
}

/** POST /folders/:folderId/labels. The caller has resolved Folder access. Locks the Folder row for the count. */
export async function createFolderLabel(
  db: Db,
  folderId: string,
  fields: LabelFields,
): Promise<CreateLabelResult> {
  return inTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
    )
    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM labels
          WHERE scope = 'folder' AND folder_id = ${folderId}`,
    )
    if (Number(held[0]?.n ?? 0) >= FOLDER_LABEL_DEFINITION_CAP) {
      return { kind: 'definition_cap' }
    }
    return insertLabel(tx, 'folder', null, folderId, fields)
  })
}

/**
 * Resolves one definition for writing, as a WHERE clause, so a foreign id is a 404 (10.2).
 * Folder scope checks membership only: the route checks `label.vocabulary.manage` and answers 403 itself.
 */
function writableLabel(
  viewerId: string,
  labelId: string,
  folderId: string | null,
): SQL {
  return folderId === null
    ? sql`l.id = ${labelId} AND l.scope = 'personal'
          AND l.owner_user_id = ${viewerId}`
    : sql`l.id = ${labelId} AND l.scope = 'folder'
          AND l.folder_id = ${folderId}
          AND ${visibleFolder(sql`l.folder_id`, viewerId)}`
}

/** PATCH any subset of name, color and description; archived Labels may be edited. An empty patch writes nothing. */
export async function patchLabel(
  db: Db,
  viewerId: string,
  labelId: string,
  folderId: string | null,
  patch: LabelPatch,
): Promise<PatchLabelResult> {
  return inTransaction(db, async (tx) => {
    const sets: SQL[] = []
    if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
    if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
    if (patch.description !== undefined) {
      sets.push(sql`description = ${patch.description}`)
    }

    if (sets.length === 0) {
      const found = await rowsOf(
        tx,
        sql`SELECT ${LABEL_COLUMNS} FROM labels l
            WHERE ${writableLabel(viewerId, labelId, folderId)}`,
      )
      const row = found[0]
      return row === undefined
        ? { kind: 'not_found' }
        : { kind: 'patched', label: definitionFromRow(row) }
    }

    sets.push(sql`updated_at = now()`)
    try {
      const updated = await rowsOf(
        tx,
        sql`UPDATE labels l SET ${sql.join(sets, sql`, `)}
            WHERE ${writableLabel(viewerId, labelId, folderId)}
            RETURNING l.id, l.scope, l.name, l.color, l.description,
                      (l.archived_at IS NOT NULL) AS archived, l.folder_id`,
      )
      const row = updated[0]
      return row === undefined
        ? { kind: 'not_found' }
        : { kind: 'patched', label: definitionFromRow(row) }
    } catch (error) {
      if (isDuplicateName(error)) return { kind: 'duplicate_name' }
      throw error
    }
  })
}

/** Archive and restore. No assignment is touched either way; an archived Label just cannot be newly applied. */
export async function setLabelArchived(
  db: Db,
  viewerId: string,
  labelId: string,
  folderId: string | null,
  archived: boolean,
): Promise<ArchiveLabelResult> {
  const updated = await rowsOf(
    db,
    sql`UPDATE labels l
        SET archived_at = ${archived ? sql`now()` : sql`NULL`},
            updated_at = now()
        WHERE ${writableLabel(viewerId, labelId, folderId)}
        RETURNING l.id, l.scope, l.name, l.color, l.description,
                  (l.archived_at IS NOT NULL) AS archived, l.folder_id`,
  )
  const row = updated[0]
  return row === undefined
    ? { kind: 'not_found' }
    : { kind: 'ok', label: definitionFromRow(row) }
}

export type AttachResult =
  | { kind: 'attached' }
  /** The target or the Label is not visible: one answer, so existence does not leak (10.2). */
  | { kind: 'not_found' }
  /** A visible Label that cannot classify this target: 422 naming `label_id`. */
  | { kind: 'wrong_target' }
  /** An archived Label cannot be newly applied. */
  | { kind: 'archived' }
  | { kind: 'assignment_cap' }
  /** The caller sees both but may not change the Folder's classification: 403 with the rule's sentence. */
  | { kind: 'forbidden'; reason: string }

export type DetachResult =
  | { kind: 'detached' }
  | { kind: 'not_found' }
  | { kind: 'forbidden'; reason: string }

interface VisibleLabel {
  id: string
  scope: LabelScope
  folderId: string | null
  archived: boolean
}

/**
 * The Label if the viewer may see it at all, else null. Callers then check fit:
 * not-found means "you cannot see it", wrong-target means "you can, but it does not belong here".
 */
async function visibleLabel(
  executor: Executor,
  viewerId: string,
  labelId: string,
): Promise<VisibleLabel | null> {
  const found = await rowsOf(
    executor,
    sql`SELECT l.id, l.scope, l.folder_id,
               (l.archived_at IS NOT NULL) AS archived
        FROM labels l
        WHERE l.id = ${labelId}
          AND (
            (l.scope = 'personal' AND l.owner_user_id = ${viewerId})
            OR (l.scope = 'folder'
                AND ${visibleFolder(sql`l.folder_id`, viewerId)})
          )`,
  )
  const row = found[0]
  if (row === undefined) return null
  return {
    id: String(row.id),
    scope: String(row.scope) as LabelScope,
    folderId: nullableString(row.folder_id),
    archived: row.archived === true,
  }
}

/**
 * Whether this actor may classify this Task with this Label's scope, or the refusal. Null means carry on.
 * Every argument is read under the caller's Task row lock, so a reassignment committed first is seen.
 */
async function classificationRefusal(
  tx: Executor,
  viewerId: string,
  folderId: string,
  scope: LabelScope,
  assigneeId: string | null,
): Promise<
  { kind: 'not_found' } | { kind: 'forbidden'; reason: string } | null
> {
  const facts = await folderActorFacts(tx, viewerId, folderId)
  /* Membership re-read in the transaction; someone removed meanwhile gets 404. */
  if (facts === null) return { kind: 'not_found' }
  const action: FolderAction =
    scope === 'folder' ? 'label.apply' : 'personal.label'
  const decision = mayPerform(facts, action, { assigneeId })
  return decision.allowed
    ? null
    : { kind: 'forbidden', reason: decision.reason }
}

/**
 * PUT /tasks/:taskId/labels/:labelId. Wrong-target is checked before archived. ON CONFLICT DO NOTHING makes it
 * idempotent. The per-Task caps are counted behind the Task row lock.
 */
export async function attachTaskLabel(
  db: Db,
  viewerId: string,
  taskId: string,
  labelId: string,
): Promise<AttachResult> {
  return inTransaction(db, async (tx) => {
    /* Lock first, so the count is read under it. It also yields the Task's Folder and current assignee for the gate. */
    const locked = await rowsOf(
      tx,
      sql`SELECT folder_id, assignee_id, assignee_ids FROM tasks
          WHERE id = ${taskId}::uuid FOR UPDATE`,
    )
    const task = locked[0]
    if (task === undefined) return { kind: 'not_found' }
    const taskFolderId = String(task.folder_id)

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    if (label.scope === 'folder' && label.folderId !== taskFolderId) {
      return { kind: 'wrong_target' }
    }
    /* Authority after scope (which picks the action) and before the archive check. */
    const refusal = await classificationRefusal(
      tx,
      viewerId,
      taskFolderId,
      label.scope,
      Array.isArray(task.assignee_ids) && task.assignee_ids.includes(viewerId)
        ? viewerId : nullableString(task.assignee_id),
    )
    if (refusal !== null) return refusal
    if (label.archived) return { kind: 'archived' }

    if (label.scope === 'personal') {
      const held = await rowsOf(
        tx,
        sql`SELECT count(*)::int AS n FROM task_personal_labels
            WHERE task_id = ${taskId} AND owner_user_id = ${viewerId}
              AND label_id <> ${labelId}`,
      )
      if (Number(held[0]?.n ?? 0) >= TASK_PERSONAL_LABEL_CAP) {
        return { kind: 'assignment_cap' }
      }
      await tx.execute(
        sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
            VALUES (${taskId}::uuid, ${labelId}::uuid, ${viewerId}::uuid)
            ON CONFLICT DO NOTHING`,
      )
      return { kind: 'attached' }
    }

    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM task_folder_labels
          WHERE task_id = ${taskId} AND label_id <> ${labelId}`,
    )
    if (Number(held[0]?.n ?? 0) >= TASK_FOLDER_LABEL_CAP) {
      return { kind: 'assignment_cap' }
    }
    const added = await rowsOf(
      tx,
      sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
          VALUES (${taskFolderId}::uuid, ${taskId}::uuid, ${labelId}::uuid)
          ON CONFLICT DO NOTHING
          RETURNING label_id`,
    )
    if (added.length > 0) {
      await recordLabelEvent(tx, viewerId, taskId, taskFolderId, labelId, 'added')
    }
    return { kind: 'attached' }
  })
}

/**
 * DELETE /tasks/:taskId/labels/:labelId. Archived assignments may be removed; a repeat succeeds.
 * The Personal delete keeps the owner_user_id scope. Authorized under the Task row lock, like attach.
 */
export async function detachTaskLabel(
  db: Db,
  viewerId: string,
  taskId: string,
  labelId: string,
): Promise<DetachResult> {
  return inTransaction(db, async (tx) => {
    const locked = await rowsOf(
      tx,
      sql`SELECT folder_id, assignee_id, assignee_ids FROM tasks
          WHERE id = ${taskId}::uuid FOR UPDATE`,
    )
    const task = locked[0]
    if (task === undefined) return { kind: 'not_found' }

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    const refusal = await classificationRefusal(
      tx,
      viewerId,
      String(task.folder_id),
      label.scope,
      Array.isArray(task.assignee_ids) && task.assignee_ids.includes(viewerId)
        ? viewerId : nullableString(task.assignee_id),
    )
    if (refusal !== null) return refusal

    if (label.scope === 'personal') {
      await tx.execute(
        sql`DELETE FROM task_personal_labels
            WHERE task_id = ${taskId} AND label_id = ${labelId}
              AND owner_user_id = ${viewerId}`,
      )
    } else {
      const removed = await rowsOf(
        tx,
        sql`DELETE FROM task_folder_labels
            WHERE task_id = ${taskId} AND label_id = ${labelId}
            RETURNING label_id`,
      )
      if (removed.length > 0) {
        await recordLabelEvent(
          tx,
          viewerId,
          taskId,
          String(task.folder_id),
          labelId,
          'removed',
        )
      }
    }
    return { kind: 'detached' }
  })
}

/*
A Folder Label added or removed is an event of the Task. Personal Labels record none: an event would show them
to every member. Only real changes record; the verb is 'edited' (the verb list is a CHECK).
 */
async function recordLabelEvent(
  tx: Executor,
  viewerId: string,
  taskId: string,
  folderId: string,
  labelId: string,
  act: 'added' | 'removed',
): Promise<void> {
  const names = await rowsOf(
    tx,
    sql`SELECT (SELECT title FROM tasks WHERE id = ${taskId}::uuid) AS task,
               (SELECT name FROM labels WHERE id = ${labelId}::uuid) AS label`,
  )
  const row = names[0]
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'edited',
    subjectKind: 'task',
    subjectId: taskId,
    subjectName: String(row?.task ?? ''),
    folderId,
    detail: `${act} the label '${String(row?.label ?? '')}'`,
  })
}

/**
 * PUT /folders/:folderId/labels/:labelId: Personal Labels only. A Folder Label here is a 422 naming `label_id`,
 * since a Folder Label never classifies a Folder.
 */
export async function attachFolderLabel(
  db: Db,
  viewerId: string,
  folderId: string,
  labelId: string,
): Promise<AttachResult> {
  return inTransaction(db, async (tx) => {
    // Lock first, for attachTaskLabel's reason.
    await tx.execute(
      sql`SELECT 1 FROM folders WHERE id = ${folderId}::uuid FOR UPDATE`,
    )

    const label = await visibleLabel(tx, viewerId, labelId)
    if (label === null) return { kind: 'not_found' }
    if (label.scope !== 'personal') return { kind: 'wrong_target' }
    if (label.archived) return { kind: 'archived' }

    const held = await rowsOf(
      tx,
      sql`SELECT count(*)::int AS n FROM folder_personal_labels
          WHERE folder_id = ${folderId} AND owner_user_id = ${viewerId}
            AND label_id <> ${labelId}`,
    )
    if (Number(held[0]?.n ?? 0) >= FOLDER_PERSONAL_LABEL_CAP) {
      return { kind: 'assignment_cap' }
    }
    await tx.execute(
      sql`INSERT INTO folder_personal_labels (folder_id, label_id, owner_user_id)
          VALUES (${folderId}::uuid, ${labelId}::uuid, ${viewerId}::uuid)
          ON CONFLICT DO NOTHING`,
    )
    return { kind: 'attached' }
  })
}

/** DELETE /folders/:folderId/labels/:labelId: archived assignments may be removed, and a repeat succeeds. */
export async function detachFolderLabel(
  db: Db,
  viewerId: string,
  folderId: string,
  labelId: string,
): Promise<DetachResult> {
  const label = await visibleLabel(db, viewerId, labelId)
  if (label === null) return { kind: 'not_found' }
  await db.execute(
    sql`DELETE FROM folder_personal_labels
        WHERE folder_id = ${folderId} AND label_id = ${labelId}
          AND owner_user_id = ${viewerId}`,
  )
  return { kind: 'detached' }
}

/**
 * Drops a Task's Folder Labels before it moves Folders, in the caller's transaction:
 * `task_folder_labels_task_scope_fkey` would otherwise refuse the move. Personal assignments stay.
 */
export async function dropFolderLabelsOnMove(
  tx: Executor,
  taskId: string,
): Promise<void> {
  await tx.execute(
    sql`DELETE FROM task_folder_labels WHERE task_id = ${taskId}::uuid`,
  )
}

/*
Copy rules. A Personal Label never travels to another person. A Folder Label is re-created with new ids
when its Folder is copied. A Folder copy carries archived definitions and their assignments; a Task copy
never newly applies an archived Label. No caps are checked: copies are bounded by sources that met them.
 */

/**
 * Labels for a Task duplicated in the same Folder: Folder Label ids carry as they are. Only the duplicator's
 * own active Personal assignments cross.
 */
export async function copyTaskLabelsForDuplicate(
  tx: Executor,
  duplicatorId: string,
  sourceTaskId: string,
  copyTaskId: string,
): Promise<void> {
  /* The Folder comes from the source row, so the task-scope FK cannot be violated. */
  await tx.execute(
    sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
        SELECT tfl.folder_id, ${copyTaskId}::uuid, tfl.label_id
          FROM task_folder_labels tfl
          JOIN labels l ON l.id = tfl.label_id
         WHERE tfl.task_id = ${sourceTaskId}::uuid
           AND l.archived_at IS NULL`,
  )
  await tx.execute(
    sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
        SELECT ${copyTaskId}::uuid, tpl.label_id, tpl.owner_user_id
          FROM task_personal_labels tpl
          JOIN labels l ON l.id = tpl.label_id
         WHERE tpl.task_id = ${sourceTaskId}::uuid
           AND tpl.owner_user_id = ${duplicatorId}::uuid
           AND l.archived_at IS NULL`,
  )
}

/**
 * A duplicated Folder's Label definitions under new ids, archived ones still archived. Answers the id mapping.
 * One statement per definition, because RETURNING ids cannot be paired with their sources except by name.
 */
export async function copyFolderLabelCatalog(
  tx: Executor,
  sourceFolderId: string,
  copyFolderId: string,
): Promise<IdPair[]> {
  const sources = await rowsOf(
    tx,
    sql`SELECT id FROM labels
         WHERE folder_id = ${sourceFolderId}::uuid AND scope = 'folder'
         ORDER BY created_at ASC, id ASC`,
  )
  const pairs: IdPair[] = []
  for (const row of sources) {
    const sourceId = String(row.id)
    /* `archived_at` is copied in SQL, so no timestamp crosses the driver. */
    const made = await rowsOf(
      tx,
      sql`INSERT INTO labels
            (scope, folder_id, name, color, description, archived_at)
          SELECT 'folder', ${copyFolderId}::uuid, l.name, l.color,
                 l.description, l.archived_at
            FROM labels l WHERE l.id = ${sourceId}::uuid
          RETURNING id`,
    )
    const copyId = made[0]?.id
    if (copyId === undefined) continue
    pairs.push([sourceId, String(copyId)])
  }
  return pairs
}

/**
 * A duplicated Folder's assignments: Folder Labels remapped through `labelPairs` (archived included), and the
 * duplicator's own active Personal Labels on the source Folder and Tasks. Three statements in all.
 */
export async function copyFolderLabelAssignments(
  tx: Executor,
  duplicatorId: string,
  sourceFolderId: string,
  copyFolderId: string,
  labelPairs: readonly IdPair[],
  taskPairs: readonly IdPair[],
): Promise<void> {
  if (labelPairs.length > 0 && taskPairs.length > 0) {
    await tx.execute(
      sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
          SELECT ${copyFolderId}::uuid, tm.new_id, lm.new_id
            FROM task_folder_labels tfl
            JOIN ${pairSet(taskPairs)} tm ON tm.old_id = tfl.task_id
            JOIN ${pairSet(labelPairs)} lm ON lm.old_id = tfl.label_id
           WHERE tfl.folder_id = ${sourceFolderId}::uuid`,
    )
  }

  await tx.execute(
    sql`INSERT INTO folder_personal_labels
          (folder_id, label_id, owner_user_id)
        SELECT ${copyFolderId}::uuid, fpl.label_id, fpl.owner_user_id
          FROM folder_personal_labels fpl
          JOIN labels l ON l.id = fpl.label_id
         WHERE fpl.folder_id = ${sourceFolderId}::uuid
           AND fpl.owner_user_id = ${duplicatorId}::uuid
           AND l.archived_at IS NULL`,
  )

  if (taskPairs.length > 0) {
    await tx.execute(
      sql`INSERT INTO task_personal_labels (task_id, label_id, owner_user_id)
          SELECT tm.new_id, tpl.label_id, tpl.owner_user_id
            FROM task_personal_labels tpl
            JOIN ${pairSet(taskPairs)} tm ON tm.old_id = tpl.task_id
            JOIN labels l ON l.id = tpl.label_id
           WHERE tpl.owner_user_id = ${duplicatorId}::uuid
             AND l.archived_at IS NULL`,
    )
  }
}

/** A workflow file declaring two Folder Labels whose lower() names match, with the `field` path to name it. */
export class WorkflowLabelNameConflict extends Error {
  constructor(
    readonly folderIndex: number,
    readonly labelName: string,
  ) {
    super(
      `labels: the name ${JSON.stringify(labelName)} is declared twice in ` +
        'one folder, and names are compared without regard to case',
    )
    this.name = 'WorkflowLabelNameConflict'
  }

  /** Where in the file the two definitions are, from its root. */
  get field(): string {
    return `folders.${String(this.folderIndex)}.labels`
  }
}

/**
 * Creates an imported file's Folder Labels in the new Folder, always active, and maps file keys to ids.
 * Duplicate names are found first by `row_number() OVER (PARTITION BY lower(name))` in the database, the index's
 * own fold (JavaScript lowercasing differs), and refused as 422 so the client shows the message.
 */
export async function createWorkflowFolderLabels(
  tx: Executor,
  folderId: string,
  definitions: readonly {
    key: string
    name: string
    color: string
    description?: string | null | undefined
  }[],
  /** Which folder of the file this vocabulary belongs to, so a collision can be named. */
  folderIndex: number,
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>()
  if (definitions.length === 0) return byKey

  /* The file's vocabulary as VALUES rows, read by both statements below. Plain bind parameters, not jsonb:
  a lone surrogate in a file would break a jsonb cast. At most 1000 parameters. */
  const input = sql`(VALUES ${sql.join(
    definitions.map(
      (definition, index) =>
        sql`(${definition.name}::text, ${definition.color}::text,
             ${definition.description ?? null}::text, ${index + 1}::int)`,
    ),
    sql`, `,
  )}) AS d(name, color, description, ord)`

  /* The fold, in the database's own lower(): the first repeated name is the collision to report. */
  const collision = await rowsOf(
    tx,
    sql`SELECT c.ord AS ord
          FROM (SELECT d.ord AS ord,
                       row_number() OVER (PARTITION BY lower(d.name)
                                          ORDER BY d.ord) AS seq
                  FROM ${input}) c
         WHERE c.seq > 1
         ORDER BY c.ord ASC
         LIMIT 1`,
  )
  const at = collision[0]?.ord
  if (at !== undefined) {
    const offending = definitions[Number(at) - 1]
    if (offending === undefined) {
      throw new Error('the fold named a definition the file does not carry')
    }
    throw new WorkflowLabelNameConflict(folderIndex, offending.name)
  }

  const made = await rowsOf(
    tx,
    sql`INSERT INTO labels (scope, folder_id, name, color, description)
        SELECT 'folder', ${folderId}::uuid, d.name, d.color, d.description
          FROM ${input}
         ORDER BY d.ord
        RETURNING id, name`,
  )
  /* Pairing by name is safe only here: one new vocabulary with no repeated names. A missing key is a defect. */
  const idByName = new Map(made.map((row) => [String(row.name), String(row.id)]))
  for (const definition of definitions) {
    const id = idByName.get(definition.name)
    if (id === undefined) {
      throw new Error('INSERT INTO labels returned no row for a definition')
    }
    byKey.set(definition.key, id)
  }
  return byKey
}

/**
 * One imported Task's Folder Label assignments, in one statement per Task (one per assignment was too slow).
 * Ids bind through `idSet`; ON CONFLICT DO NOTHING absorbs a key named twice. Per Task keeps the parameter bounded.
 */
export async function applyWorkflowTaskLabels(
  tx: Executor,
  folderId: string,
  taskId: string,
  labelIds: readonly string[],
): Promise<void> {
  if (labelIds.length === 0) return
  await tx.execute(
    sql`INSERT INTO task_folder_labels (folder_id, task_id, label_id)
        SELECT ${folderId}::uuid, ${taskId}::uuid, assigned.label_id
          FROM ${idSet(labelIds)} AS assigned(label_id)
        ON CONFLICT DO NOTHING`,
  )
}

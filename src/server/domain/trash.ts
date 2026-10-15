// Trash (7.13). Access is by folder membership, never by who deleted. Tasks in a trashed folder ride its fate.
// Restore has no 30-day guard; the purge (11.7) owns the window. The permanent delete and the object
// collection live here, shared by the purge and the endpoint; objects are removed after commit (7.15).
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type {
  GetTrashResponse,
  TrashedFolder,
  TrashedTask,
} from '../../shared/trash.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { trashedDiscussions } from './consultation.js'
import {
  joinVisibleFolder,
  mayPerform,
  presetFromRow,
  resolveScoped,
  visibleFolder,
} from './folder-access.js'
import type { FolderAccessPreset } from '../../shared/folder-access.js'
import {
  destroyableTrashedWith,
  ensureHomeBlock,
  lockPageTree,
  releaseSurvivors,
  restoreTrashedPage,
} from './page-tree.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

// Typed against `shared/trash.ts`. The `(row): TrashedTask` annotations on the map callbacks are load-bearing:
// without them an extra field passes the return type and the client's parser drops it silently.
export async function trashView(
  db: Db,
  viewerId: string,
): Promise<GetTrashResponse> {
  const tasks = await rowsOf(
    db,
    sql`SELECT t.id, t.title, t.folder_id, f.name AS folder_name, t.deleted_at,
               m.access,
               (f.owner_id = ${viewerId}) AS is_owner
        FROM tasks t
        ${joinVisibleFolder(viewerId, { folderId: sql`t.folder_id`, folder: 'f' })}
        WHERE t.deleted_at IS NOT NULL
        ORDER BY t.deleted_at DESC, t.id DESC`,
  )
  const folders = await rowsOf(
    db,
    sql`SELECT f.id, f.name, f.deleted_at, m.access,
               (f.owner_id = ${viewerId}) AS is_owner,
               CASE WHEN f.project_id <> f.id
                         AND ${visibleFolder(sql`f.project_id`, viewerId, { trashed: 'any' })}
                    THEN (SELECT pr.name FROM folders pr WHERE pr.id = f.project_id) END
                 AS project_name,
               (SELECT count(*)::int FROM tasks t
                 WHERE t.folder_id = f.id) AS task_count
        FROM folders f
        ${joinVisibleFolder(viewerId, { folder: 'f', trashed: 'trashed' })}
        WHERE
          /* Wave 2: a sub-page trashed with its parent rides the parent's
             entry, which restores and purges the set. It is listed on its
             own only for a viewer who cannot see that entry (not a member
             of the initiating page), so it never vanishes from the one
             Trash that could bring it back. */
          (f.trashed_with_folder_id IS NULL
               OR NOT ${visibleFolder(sql`f.trashed_with_folder_id`, viewerId, { trashed: 'any' })})
        ORDER BY f.deleted_at DESC, f.id DESC`,
  )
  /* Facets are tabs now, listed with the folders above; the field stays empty for old clients. */
  const facets: [] = []
  const discussions = await trashedDiscussions(db, viewerId)
  return {
    facets,
    discussions,
    tasks: tasks.map((row): TrashedTask => ({
      id: String(row.id),
      title: String(row.title),
      folder_id: String(row.folder_id),
      folder_name: String(row.folder_name),
      deleted_at: toIso(row.deleted_at),
      is_owner: Boolean(row.is_owner),
      my_access: accessOfRow(row, viewerId, String(row.folder_id)),
    })),
    folders: folders.map((row): TrashedFolder => ({
      id: String(row.id),
      name: String(row.name),
      task_count: Number(row.task_count),
      deleted_at: toIso(row.deleted_at),
      is_owner: Boolean(row.is_owner),
      my_access: accessOfRow(row, viewerId, String(row.id)),
      project_name: row.project_name === null || row.project_name === undefined ? null : String(row.project_name),
    })),
  }
}

/** The viewer's own preset. Throws rather than defaulting: a default would be a guess about authority. */
function accessOfRow(
  row: Record<string, unknown>,
  viewerId: string,
  folderId: string,
): FolderAccessPreset {
  return presetFromRow(row.access, viewerId, folderId)
}

/** 'not_found' covers missing, not trashed, not a member, or inside a trashed folder: one answer (10.2). */
export async function restoreTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<'restored' | 'not_found' | { kind: 'forbidden'; reason: string }> {
  return inTransaction(db, async (tx) => {
    const homes = await rowsOf(tx,sql`SELECT folder_id FROM tasks WHERE id=${taskId}::uuid`)
    if(homes[0]===undefined)return 'not_found'
    await tx.execute(sql`SELECT 1 FROM folders WHERE id=${homes[0].folder_id}::uuid FOR UPDATE`)
    /* `lockedTask` cannot see a trashed task, so this is the same scope with the trash predicate inverted. */
    const found = await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: sql`t.title, t.folder_id`,
      row: 'trashed',
      lock: true,
    })
    if (found === null) return 'not_found'
    const { row } = found
    const decision = mayPerform(found.facts, 'task.restore')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    await tx.execute(
      sql`UPDATE tasks SET deleted_at = NULL, updated_at = now()
          WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'restored',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'restored from Trash',
    })
    return 'restored'
  })
}

const ONE_DISCUSSION_TAB = 'This project already has a Discussion tab. Move it to Trash to bring this one back.'

/** SQLSTATE 23505 on the named index, never the server's prose. */
function violates(error: unknown, constraint: string): boolean {
  const e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null
  if (e === null || typeof e !== 'object') return false
  if (e.code === '23505' && e.constraint === constraint) return true
  return e.cause !== undefined && violates(e.cause, constraint)
}

export async function restoreFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<
  | 'restored'
  | 'not_found'
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; reason: string }
> {
  try {
    return await restoreFolderOnce(db, viewerId, folderId)
  } catch (error) {
    /* One live Discussion tab per project; a tab restored with its set is refused here. */
    if (violates(error, 'folders_one_discussion_per_project_idx')) {
      return { kind: 'conflict', reason: ONE_DISCUSSION_TAB }
    }
    throw error
  }
}

async function restoreFolderOnce(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<
  | 'restored'
  | 'not_found'
  | { kind: 'forbidden'; reason: string }
  | { kind: 'conflict'; reason: string }
> {
  return inTransaction(db, async (tx) => {
    // The tree lock before any row lock (page-tree.ts's lock order).
    await lockPageTree(tx)
    const found = await resolveScoped(tx, 'folder', folderId, viewerId, {
      folder: 'trashed',
      lock: true,
    })
    if (found === null) return 'not_found'
    /* Full control restores, and so does the owner whatever their own Access (`owner: 'sufficient'`). */
    const decision = mayPerform(found.facts, 'folder.restore')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason }
    }
    /* A Discussion tab stays in Trash if its project made another meanwhile. */
    const second = await rowsOf(
      tx,
      sql`SELECT 1 FROM folders t
            JOIN folders other ON other.project_id = t.project_id AND other.id <> t.id
           WHERE t.id = ${folderId}::uuid AND t.kind = 'discussion'
             AND other.kind = 'discussion' AND other.deleted_at IS NULL`,
    )
    if (second.length > 0) return { kind: 'conflict', reason: ONE_DISCUSSION_TAB }
    /* A page whose parent is live comes back with its home `page` block, appended if it has none. */
    await restoreTrashedPage(tx, viewerId, folderId, found.facts.name)
    await ensureHomeBlock(tx, folderId)
    return 'restored'
  })
}

export interface DestroyedFolders {
  folderIds: string[]
  /** The caller removes these from the store after its commit. */
  fileIds: string[]
}

export interface DestroyedTasks {
  taskIds: string[]
  /** Always empty: tasks carry no files of their own. Kept so every caller has one shape. */
  fileIds: string[]
}

/**
 * Deletes the folders `doomed` selects and collects the files rows the cascade drops, in one statement.
 * `doomed` carries its own lock clause: SKIP LOCKED for the purge, FOR UPDATE for the endpoint.
 */
export async function destroyFolders(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedFolders> {
  /* One savepoint, so the claim, the release of surviving pages and the delete see the same rows.
  A project root's pages cascade with it, so their files are collected too. */
  return (executor as unknown as {
    transaction<T>(run: (tx: Executor) => Promise<T>): Promise<T>
  }).transaction(async (tx) => {
    const picked = await rowsOf(tx, sql`WITH doomed AS (${doomed}) SELECT id FROM doomed`)
    const ids = picked.map((row) => String(row.id))
    if (ids.length === 0) return { folderIds: [], fileIds: [] }
    const doomedList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)
    const managed = await rowsOf(tx, sql`SELECT root_folder_id FROM profile_doc_roots
      WHERE custody_project_id IN (${doomedList}) FOR UPDATE`)
    const managedIds = managed.map((row) => String(row.root_folder_id))
    const profileRows = await rowsOf(tx, sql`SELECT f.id FROM folders f
      JOIN profile_doc_roots r ON r.root_folder_id = f.project_id
      WHERE f.id IN (${doomedList})`)
    const profileIds = new Set(profileRows.map((row) => String(row.id)))
    await releaseSurvivors(tx, ids.filter((id) => !profileIds.has(id)))
    const list = sql.join([...ids, ...managedIds].map((id) => sql`${id}::uuid`), sql`, `)
    const files = await rowsOf(
      tx,
      sql`SELECT f.id FROM files f JOIN folders fo ON fo.id = f.folder_id
           WHERE fo.id IN (${list}) OR fo.project_id IN (${list})`,
    )
    if (managedIds.length) {
      await tx.execute(sql`DELETE FROM folders WHERE id IN (
        ${sql.join(managedIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
    }
    const removed = await rowsOf(tx, sql`DELETE FROM folders WHERE id IN (${doomedList}) RETURNING id`)
    return {
      folderIds: [...managedIds, ...removed.map((row) => String(row.id))],
      fileIds: files.map((row) => String(row.id)),
    }
  })
}

/** Deletes the tasks `doomed` selects. Tasks have no files rows or comments, so `fileIds` is always empty. */
export async function destroyTasks(
  executor: Executor,
  doomed: SQL,
): Promise<DestroyedTasks> {
  const rows = await rowsOf(
    executor,
    sql`WITH doomed AS (${doomed})
        DELETE FROM tasks WHERE id IN (SELECT id FROM doomed)
        RETURNING id`,
  )
  return { taskIds: rows.map((row) => String(row.id)), fileIds: [] }
}

/** Removes objects after commit. A failure here leaves unreachable bytes and must fail neither the pass nor the response. */
export async function removeObjects(
  store: ObjectStore | undefined,
  fileIds: readonly string[],
): Promise<void> {
  if (store === undefined) return
  for (const id of fileIds) {
    try {
      await store.remove(id)
    } catch {
      // Unreachable bytes: see above.
    }
  }
}

export type DestroyOutcome =
  | { kind: 'destroyed'; fileIds: string[] }
  /** Visible but not theirs to perform: 403, with the resolver's reason. */
  | { kind: 'forbidden'; reason: string }
  /** Missing, not in Trash, inside a trashed folder, or not a member: one answer (10.2). */
  | { kind: 'not_found' }

/** DELETE /trash/tasks/:id: only a trashed task. The event goes on the folder, which survives. */
export async function destroyTask(
  db: Db,
  viewerId: string,
  taskId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await resolveScoped(tx, 'task', taskId, viewerId, {
      columns: sql`t.title, t.folder_id`,
      row: 'trashed',
      lock: true,
    })
    if (found === null) return { kind: 'not_found' } as const
    const { row } = found
    /* Full control, not ownership: an owner who lowered their own Access cannot. */
    const decision = mayPerform(found.facts, 'task.destroy')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    const destroyed = await destroyTasks(
      tx,
      sql`SELECT id FROM tasks WHERE id = ${taskId}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'task',
      subjectId: taskId,
      subjectName: String(row.title),
      folderId: String(row.folder_id),
      detail: 'deleted permanently',
    })
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}

/** DELETE /trash/folders/:id. No event: the folder's events cascade with it. */
export async function destroyFolder(
  db: Db,
  viewerId: string,
  folderId: string,
): Promise<DestroyOutcome> {
  return inTransaction(db, async (tx) => {
    const found = await resolveScoped(tx, 'folder', folderId, viewerId, {
      folder: 'trashed',
      lock: true,
    })
    if (found === null) return { kind: 'not_found' } as const
    /* Requires both custody and Full control: `owner: 'required'` over a `full_control` bar. */
    const decision = mayPerform(found.facts, 'folder.destroy')
    if (!decision.allowed) {
      return { kind: 'forbidden', reason: decision.reason } as const
    }
    /* Pages trashed with this one go too where the actor may destroy them; the rest stay in Trash on their own. */
    const alsoDoomed = await destroyableTrashedWith(tx, viewerId, folderId)
    const destroyed = await destroyFolders(
      tx,
      sql`SELECT id FROM folders WHERE id IN (${sql.join(
        [folderId, ...alsoDoomed].map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
    return { kind: 'destroyed', fileIds: destroyed.fileIds } as const
  })
}

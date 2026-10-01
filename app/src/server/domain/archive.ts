import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { ArchivedWork, GetArchivedWorkResponse } from '../../shared/archive.js'
import { inTransaction, rowsOf } from '../database.js'
import { destroyFolders } from './trash.js'
import { joinVisibleFolder, mayPerform, presetFromRow, resolveScoped } from './folder-access.js'
import { ensureHomeBlock, lockPageTree, removeHomeBlock } from './page-tree.js'

type Outcome = 'done' | 'not_found' | { kind: 'forbidden' | 'conflict'; reason: string }

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

function violates(error: unknown, constraint: string): boolean {
  const cause = error as { code?: unknown; constraint?: unknown; cause?: unknown } | null
  if (cause === null || typeof cause !== 'object') return false
  if (cause.code === '23505' && cause.constraint === constraint) return true
  return cause.cause !== undefined && violates(cause.cause, constraint)
}

/** Archive the canonical page and its live descendants in one transaction. */
export async function archiveFolder(db: Db, actorId: string, folderId: string): Promise<Outcome> {
  return inTransaction(db, async (tx) => {
    await lockPageTree(tx)
    const found = await resolveScoped(tx, 'folder', folderId, actorId, {
      columns: sql`fo.project_id`, lock: true,
    })
    if (found === null) return 'not_found'
    const decision = mayPerform(found.facts, 'folder.trash')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    if (found.facts.isDefault) return { kind: 'conflict', reason: 'The default Work cannot be archived.' }

    await removeHomeBlock(tx, folderId)

    const isProject = String(found.row.project_id) === folderId
    const descendants = isProject
      ? await rowsOf(tx, sql`SELECT id FROM folders WHERE project_id = ${folderId}::uuid
            AND deleted_at IS NULL AND archived_at IS NULL`)
      : await rowsOf(tx, sql`WITH RECURSIVE pages(id) AS (
            SELECT id FROM folders WHERE id = ${folderId}::uuid
            UNION ALL
            SELECT c.id FROM folders c JOIN pages p ON c.parent_folder_id = p.id
             WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
          ) SELECT id FROM pages`)
    const ids = descendants.map((row) => String(row.id))
    await tx.execute(sql`UPDATE folders
      SET archived_at = now(), archived_by = ${actorId}::uuid,
          archived_with_folder_id = CASE WHEN id = ${folderId}::uuid THEN NULL ELSE ${folderId}::uuid END
      WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`)
    return 'done'
  })
}

export async function archivedWorkView(db: Db, viewerId: string): Promise<GetArchivedWorkResponse> {
  const rows = await rowsOf(db, sql`SELECT f.id, f.name, f.archived_at,
        u.display_name AS archived_by_name, m.access, f.is_default,
        (f.owner_id = ${viewerId}::uuid) AS is_owner,
        (SELECT count(*)::int FROM folder_members fm WHERE fm.folder_id = f.project_id) AS member_count
      FROM folders f
      ${joinVisibleFolder(viewerId, { folder: 'f', trashed: 'archived' })}
      LEFT JOIN users u ON u.id = f.archived_by AND u.deleted_at IS NULL
      WHERE f.archived_with_folder_id IS NULL
      ORDER BY f.archived_at DESC, f.id DESC`)
  return { rows: rows.map((row): ArchivedWork => {
    const facts = {
      folderId: String(row.id), actorId: viewerId,
      access: presetFromRow(row.access, viewerId, String(row.id)),
      isOwner: row.is_owner === true,
      isDefault: row.is_default === true,
      name: String(row.name),
    }
    return {
      id: String(row.id), name: String(row.name), archived_at: iso(row.archived_at),
      archived_by_name: row.archived_by_name == null ? null : String(row.archived_by_name),
      shared: Number(row.member_count) > 1,
      can_restore: mayPerform(facts, 'folder.restore').allowed,
      can_destroy: mayPerform(facts, 'folder.destroy').allowed,
    }
  }) }
}

export async function restoreArchivedFolder(db: Db, actorId: string, folderId: string): Promise<Outcome> {
  try { return await inTransaction(db, async (tx) => {
    await lockPageTree(tx)
    const found = await resolveScoped(tx, 'folder', folderId, actorId, {
      folder: 'archived', columns: sql`fo.archived_with_folder_id, fo.parent_folder_id, fo.project_id`, lock: true,
    })
    if (found === null || found.row.archived_with_folder_id !== null) return 'not_found'
    const decision = mayPerform(found.facts, 'folder.restore')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    const ancestors = await rowsOf(tx, sql`SELECT 1 FROM folders f
      WHERE f.id IN (${String(found.row.project_id)}::uuid,
        ${found.row.parent_folder_id === null ? folderId : String(found.row.parent_folder_id)}::uuid)
        AND f.id <> ${folderId}::uuid
        AND (f.deleted_at IS NOT NULL OR f.archived_at IS NOT NULL)`)
    if (ancestors.length > 0) {
      return { kind: 'conflict', reason: 'Restore the parent Work first.' }
    }
    await tx.execute(sql`UPDATE folders
      SET archived_at = NULL, archived_by = NULL, archived_with_folder_id = NULL
      WHERE id = ${folderId}::uuid OR archived_with_folder_id = ${folderId}::uuid`)
    await ensureHomeBlock(tx, folderId)
    return 'done'
  }) } catch (error) {
    if (violates(error, 'folders_one_discussion_per_project_idx')) {
      return { kind: 'conflict', reason: 'This Work already has a Discussion page. Remove it before restoring the archived one.' }
    }
    throw error
  }
}

export async function destroyArchivedFolder(
  db: Db, actorId: string, folderId: string,
): Promise<Outcome | { kind: 'destroyed'; fileIds: string[] }> {
  return inTransaction(db, async (tx) => {
    await lockPageTree(tx)
    const found = await resolveScoped(tx, 'folder', folderId, actorId, {
      folder: 'archived', columns: sql`fo.archived_with_folder_id`, lock: true,
    })
    if (found === null || found.row.archived_with_folder_id !== null) return 'not_found'
    const decision = mayPerform(found.facts, 'folder.destroy')
    if (!decision.allowed) return { kind: 'forbidden', reason: decision.reason }
    const destroyed = await destroyFolders(tx, sql`SELECT id FROM folders
      WHERE id = ${folderId}::uuid OR archived_with_folder_id = ${folderId}::uuid`)
    return { kind: 'destroyed', fileIds: destroyed.fileIds }
  })
}

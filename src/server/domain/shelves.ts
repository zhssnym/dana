// Shelves (4.18, 7.16): private per-user containers. Membership is folder_members.shelf_name, kept in step
// with the shelf name in one transaction. Every read is scoped to the viewer; events carry no folder scope.
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { PatchShelfBody, PostShelvesBody, Shelf } from '../../shared/shelves.js'
import type { ObjectStore } from '../files/store.js'
import { inTransaction, rowsOf } from '../database.js'
import type { Executor } from '../database.js'
import { recordEvent } from './events.js'
import { copyCoverFile, coverFileFor, readableFileScope } from './files.js'

function toIso(value: unknown): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(String(value)).toISOString()
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function shelfFromRow(row: Record<string, unknown>): Shelf {
  return {
    id: String(row.id),
    name: String(row.name),
    icon: nullableString(row.icon),
    color: nullableString(row.color),
    cover_file_id: nullableString(row.cover_file_id),
    cover_preset: nullableString(row.cover_preset),
    cover_focal_y: Number(row.cover_focal_y ?? 50),
    description: nullableString(row.description),
    created_at: toIso(row.created_at),
  }
}

const SHELF_COLUMNS = sql`id, name, icon, color, cover_file_id, cover_preset,
  cover_focal_y, description, created_at`

export async function listShelves(db: Db, viewerId: string): Promise<Shelf[]> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${SHELF_COLUMNS} FROM shelves
        WHERE user_id = ${viewerId}
        ORDER BY lower(name) ASC, id ASC`,
  )
  return rows.map(shelfFromRow)
}

export async function shelfView(
  db: Executor,
  viewerId: string,
  shelfId: string,
): Promise<Shelf | null> {
  const rows = await rowsOf(
    db,
    sql`SELECT ${SHELF_COLUMNS} FROM shelves
        WHERE id = ${shelfId} AND user_id = ${viewerId}`,
  )
  const row = rows[0]
  return row === undefined ? null : shelfFromRow(row)
}

/**
 * The shelf a membership names, created if missing, inside the caller's transaction.
 * ON CONFLICT DO NOTHING because UNIQUE (user_id, name) settles races. No event: nobody asked for a shelf.
 */
export async function ensureShelf(
  tx: Executor,
  viewerId: string,
  name: string,
): Promise<void> {
  await tx.execute(
    sql`INSERT INTO shelves (user_id, name)
        VALUES (${viewerId}::uuid, ${name})
        ON CONFLICT (user_id, name) DO NOTHING`,
  )
}

export type CreateShelfResult =
  | { kind: 'created'; shelf: Shelf }
  | { kind: 'name_taken' }

export async function createShelf(
  db: Db,
  viewerId: string,
  body: PostShelvesBody,
): Promise<CreateShelfResult> {
  return inTransaction(db, async (tx) => {
    const taken = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM shelves
          WHERE user_id = ${viewerId} AND name = ${body.name}`,
    )
    if (taken.length > 0) return { kind: 'name_taken' } as const
    const inserted = await rowsOf(
      tx,
      sql`INSERT INTO shelves (user_id, name, icon, color, description)
          VALUES (${viewerId}::uuid, ${body.name}, ${body.icon ?? null},
                  ${body.color ?? null}, ${body.description ?? null})
          RETURNING ${SHELF_COLUMNS}`,
    )
    const shelf = shelfFromRow(inserted[0] ?? {})
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'created',
      subjectKind: 'shelf',
      subjectId: shelf.id,
      subjectName: shelf.name,
      folderId: null,
    })
    return { kind: 'created', shelf } as const
  })
}

export type PatchShelfResult =
  | { kind: 'patched'; shelf: Shelf }
  | { kind: 'not_found' }
  | { kind: 'name_taken' }
  /** The cover is not a reachable picture, or its bytes are gone: one 422 for both. */
  | { kind: 'cover_not_readable' }
  /** 10.3's 1 GB quota, spent by the copy: 413. */
  | { kind: 'quota_exceeded' }

export async function patchShelf(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  shelfId: string,
  patch: PatchShelfBody,
): Promise<PatchShelfResult> {
  /** Bytes copied in the transaction. If it throws, they index nothing and are removed. */
  const copied: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      const current = await rowsOf(
        tx,
        sql`SELECT name FROM shelves
            WHERE id = ${shelfId} AND user_id = ${viewerId}
            FOR UPDATE`,
      )
      const row = current[0]
      if (row === undefined) return { kind: 'not_found' } as const
      const oldName = String(row.name)

      const renaming = patch.name !== undefined && patch.name !== oldName
      if (renaming) {
        const taken = await rowsOf(
          tx,
          sql`SELECT 1 AS present FROM shelves
              WHERE user_id = ${viewerId} AND name = ${patch.name}
                AND id <> ${shelfId}::uuid`,
        )
        if (taken.length > 0) return { kind: 'name_taken' } as const
      }

      /*
      The cover gate; there is no authorization chokepoint. The file must be readable (`readableFileScope`,
      as `serveFile` uses) and a picture (kind cover or image), the same rule as the other cover gates.
      A shelf page has no folder_id, so a folder-scope clause would match nothing.
       */
      let coverFileId = patch.cover_file_id
      if (patch.cover_file_id !== undefined && patch.cover_file_id !== null) {
        const cover = await rowsOf(
          tx,
          sql`SELECT 1 AS present FROM files f
              WHERE f.id = ${patch.cover_file_id}
                AND f.kind IN ('cover', 'image')
                AND ${readableFileScope(viewerId)}`,
        )
        if (cover.length === 0) return { kind: 'cover_not_readable' } as const

        /* Make the cover file the person's own, copying it unless it is already their folder-less cover,
        so it keeps drawing if they leave the source folder. */
        const held = await coverFileFor(
          tx,
          store,
          viewerId,
          patch.cover_file_id,
          null,
        )
        if (held.kind === 'bytes_missing') {
          return { kind: 'cover_not_readable' } as const
        }
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') copied.push(held.id)
        coverFileId = held.id
      }

      const sets = []
      if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
      if (patch.icon !== undefined) sets.push(sql`icon = ${patch.icon}`)
      if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
      /* One source: a file clears the preset and a preset clears the file (shelves_cover_one_source_check). */
      if (coverFileId !== undefined) {
        sets.push(sql`cover_file_id = ${coverFileId}`)
        if (coverFileId !== null) sets.push(sql`cover_preset = NULL`)
      }
      if (patch.cover_preset !== undefined) {
        sets.push(sql`cover_preset = ${patch.cover_preset}`)
        if (patch.cover_preset !== null) sets.push(sql`cover_file_id = NULL`)
      }
      if (patch.cover_focal_y !== undefined) {
        sets.push(sql`cover_focal_y = ${patch.cover_focal_y}`)
      }
      if (patch.description !== undefined) {
        sets.push(sql`description = ${patch.description}`)
      }
      if (sets.length > 0) {
        await tx.execute(
          sql`UPDATE shelves SET ${sql.join(sets, sql`, `)}
              WHERE id = ${shelfId}::uuid`,
        )
      }
      // Rename the viewer's own matching memberships in the same transaction (4.18).
      if (renaming) {
        await tx.execute(
          sql`UPDATE folder_members SET shelf_name = ${patch.name}
              WHERE user_id = ${viewerId} AND shelf_name = ${oldName}`,
        )
      }
      if (sets.length > 0) {
        await recordEvent(tx, {
          actorId: viewerId,
          verb: renaming ? 'renamed' : 'edited',
          subjectKind: 'shelf',
          subjectId: shelfId,
          subjectName: patch.name ?? oldName,
          folderId: null,
        })
      }
      const after = await rowsOf(
        tx,
        sql`SELECT ${SHELF_COLUMNS} FROM shelves WHERE id = ${shelfId}::uuid`,
      )
      return { kind: 'patched', shelf: shelfFromRow(after[0] ?? {}) } as const
    })
  } catch (error: unknown) {
    for (const id of copied) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes; they must not replace the real error below.
      }
    }
    throw error
  }
}

/** Folders survive their shelf: only the shelf row, its page and the viewer's matching memberships go. */
export async function deleteShelf(
  db: Db,
  viewerId: string,
  shelfId: string,
): Promise<'deleted' | 'not_found'> {
  return inTransaction(db, async (tx) => {
    const removed = await rowsOf(
      tx,
      sql`DELETE FROM shelves
          WHERE id = ${shelfId} AND user_id = ${viewerId}
          RETURNING name`,
    )
    const row = removed[0]
    if (row === undefined) return 'not_found' as const
    await tx.execute(
      sql`UPDATE folder_members SET shelf_name = NULL
          WHERE user_id = ${viewerId} AND shelf_name = ${String(row.name)}`,
    )
    await recordEvent(tx, {
      actorId: viewerId,
      verb: 'deleted',
      subjectKind: 'shelf',
      subjectId: shelfId,
      subjectName: String(row.name),
      folderId: null,
    })
    return 'deleted' as const
  })
}

/*
POST /shelves/:id/duplicate, in one transaction. The copy gets its own cover file so the two shelves
stay independent, and the copied bytes are removed if the transaction fails. The page is not copied.
 */

export type DuplicateShelfResult =
  | { kind: 'duplicated'; shelf: Shelf }
  | { kind: 'not_found' }
  /** "X (copy n)" names up to 50 were all taken; UNIQUE (user_id, name) makes this a refusal, not a 500. */
  | { kind: 'name_taken' }
  /** 10.3's 1 GB quota, spent by the copied picture. */
  | { kind: 'quota_exceeded' }

/** Names are at most 40 characters, so the base is cut to fit the suffix. */
async function freeCopyName(
  tx: Executor,
  viewerId: string,
  sourceName: string,
): Promise<string | null> {
  for (let n = 1; n <= 50; n += 1) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${String(n)})`
    const base = sourceName.slice(0, Math.max(1, 40 - suffix.length)).trimEnd()
    const candidate = `${base}${suffix}`
    const taken = await rowsOf(
      tx,
      sql`SELECT 1 AS present FROM shelves
          WHERE user_id = ${viewerId} AND name = ${candidate}`,
    )
    if (taken.length === 0) return candidate
  }
  return null
}

export async function duplicateShelf(
  db: Db,
  store: ObjectStore,
  viewerId: string,
  shelfId: string,
): Promise<DuplicateShelfResult> {
  const copied: string[] = []
  try {
    return await inTransaction(db, async (tx) => {
      const found = await rowsOf(
        tx,
        sql`SELECT name, icon, color, description, cover_file_id,
                   cover_preset, cover_focal_y
            FROM shelves
            WHERE id = ${shelfId} AND user_id = ${viewerId}`,
      )
      const source = found[0]
      if (source === undefined) return { kind: 'not_found' } as const

      const name = await freeCopyName(tx, viewerId, String(source.name))
      if (name === null) return { kind: 'name_taken' } as const

      /* Always `copyCoverFile`, never `coverFileFor`: sharing one cover_file_id would couple the two shelves.
      A source whose bytes are gone gets no file. */
      let coverFileId: string | null = null
      if (source.cover_file_id !== null && source.cover_file_id !== undefined) {
        const held = await copyCoverFile(
          tx,
          store,
          viewerId,
          String(source.cover_file_id),
          null,
        )
        if (held.kind === 'quota_exceeded') {
          return { kind: 'quota_exceeded' } as const
        }
        if (held.kind === 'copied') {
          copied.push(held.id)
          coverFileId = held.id
        }
      }

      const made = await rowsOf(
        tx,
        sql`INSERT INTO shelves (user_id, name, icon, color, description,
                                 cover_file_id, cover_preset, cover_focal_y)
            VALUES (${viewerId}::uuid, ${name},
                    ${source.icon === null ? null : String(source.icon)},
                    ${source.color === null ? null : String(source.color)},
                    ${source.description === null ? null : String(source.description)},
                    ${coverFileId}::uuid,
                    ${coverFileId === null && source.cover_preset !== null ? String(source.cover_preset) : null},
                    ${Number(source.cover_focal_y ?? 50)})
            RETURNING ${SHELF_COLUMNS}`,
      )
      const shelf = shelfFromRow(made[0] ?? {})
      await recordEvent(tx, {
        actorId: viewerId,
        verb: 'duplicated',
        subjectKind: 'shelf',
        subjectId: shelf.id,
        subjectName: shelf.name,
        folderId: null,
        detail: `from ${String(source.name)}`,
      })
      return { kind: 'duplicated', shelf } as const
    })
  } catch (error: unknown) {
    for (const id of copied) {
      try {
        await store.remove(id)
      } catch {
        // Unreachable bytes; they must not replace the real error below.
      }
    }
    throw error
  }
}

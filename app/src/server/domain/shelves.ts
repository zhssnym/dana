/*
The S5 shelf module (4.18, 7.16): a per-user container whose membership
remains folder_members.label, unchanged and frozen, and whose page needs a
stable key a rename cannot move. The API holds label and shelf name in step
in one transaction, both directions: a rename rewrites the viewer's matching
labels, a delete clears them, and the id never changes. Shelves are private
by construction (DES-195/196), so every read below is scoped to the viewer
and the events they record carry no folder scope.
*/
import { sql } from 'drizzle-orm'

import type { Db } from '../../../db/client.js'
import type { PatchShelfBody, PostShelvesBody, Shelf } from '../../shared/shelves.js'
import { inTransaction, rowsOf } from './db.js'
import type { Executor } from './db.js'
import { recordEvent } from './events.js'

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
    description: nullableString(row.description),
    created_at: toIso(row.created_at),
  }
}

const SHELF_COLUMNS = sql`id, name, icon, color, cover_file_id, description,
  created_at`

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
  db: Db,
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
 * The shelf a label names, made if it is not there already (issue #65).
 *
 * 4.18's sentence is that the API "holds label and shelf name in step in one
 * transaction", and until this function existed it held them in step in two
 * directions out of three: a rename rewrote the matching labels, a delete
 * cleared them, and a label written through frozen 7.4 named whatever string
 * it liked. The third direction is the reported defect. 9.1 draws the Library
 * as "the viewer's shelves and folders as one ordered list" and its roles
 * table makes every shelf row a link, so a group heading whose label no
 * shelves row names has no id to link to and no page to open; the client
 * draws it as plain text and the shelf, in the person's words, "stays only as
 * a sidebar group".
 *
 * Called inside the caller's transaction, so a folder that took a label and
 * the shelf that label names commit together or not at all.
 *
 * ON CONFLICT DO NOTHING rather than a SELECT and then an INSERT: two
 * requests filing two folders onto one new shelf race, and 4.18's UNIQUE
 * (user_id, name) is the arbiter. The event is recorded only for the request
 * that actually inserted, so a shelf has one 'created' line however many
 * folders arrived at once.
 *
 * The lengths agree by contract and nothing here has to check: 10.3 gives the
 * personal label and the shelf name the same 1 to 40 bound, and
 * `shared/folders.ts` has already refused anything outside it with a 422
 * before this runs.
 */
export async function ensureShelf(
  tx: Executor,
  viewerId: string,
  name: string,
): Promise<void> {
  const inserted = await rowsOf(
    tx,
    sql`INSERT INTO shelves (user_id, name)
        VALUES (${viewerId}::uuid, ${name})
        ON CONFLICT (user_id, name) DO NOTHING
        RETURNING id`,
  )
  const row = inserted[0]
  if (row === undefined) return
  await recordEvent(tx, {
    actorId: viewerId,
    verb: 'created',
    subjectKind: 'shelf',
    subjectId: String(row.id),
    subjectName: name,
    folderId: null,
  })
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

export async function patchShelf(
  db: Db,
  viewerId: string,
  shelfId: string,
  patch: PatchShelfBody,
): Promise<PatchShelfResult> {
  return inTransaction(db, async (tx) => {
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

    const sets = []
    if (patch.name !== undefined) sets.push(sql`name = ${patch.name}`)
    if (patch.icon !== undefined) sets.push(sql`icon = ${patch.icon}`)
    if (patch.color !== undefined) sets.push(sql`color = ${patch.color}`)
    if (patch.description !== undefined) {
      sets.push(sql`description = ${patch.description}`)
    }
    if (sets.length > 0) {
      await tx.execute(
        sql`UPDATE shelves SET ${sql.join(sets, sql`, `)}
            WHERE id = ${shelfId}::uuid`,
      )
    }
    // 4.18: label and shelf name held in step, one transaction. The labels
    // are the viewer's own; nobody else's arrangement moves.
    if (renaming) {
      await tx.execute(
        sql`UPDATE folder_members SET label = ${patch.name}
            WHERE user_id = ${viewerId} AND label = ${oldName}`,
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
}

/** The folders survive their shelf (4.18): only the shelf row, its page
 * (the 4.17 cascade), and the viewer's matching labels go. */
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
      sql`UPDATE folder_members SET label = NULL
          WHERE user_id = ${viewerId} AND label = ${String(row.name)}`,
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
